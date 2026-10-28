"""Stage 3 - names: clean display names, aliases, category, tags, and a confidence score.

All behaviour is driven by config/name_rules.json (lexicons, boilerplate, synonyms). The core is the pure function
`parse_name(raw, rules, ...)`; `clean_names(df, ...)` applies it to a DataFrame.

What the rules do to a USDA-style name
--------------------------------------
"Chicken, broilers or fryers, breast, meat only, cooked, roasted"
  1. lower-case, expand abbreviations (only for sources flagged name_is_abbreviated), drop boilerplate inline
     ("broilers or fryers", "meat only", "NFS", "commercial", "includes USDA commodity ...", "drained", ...)
  2. split into comma parts; classify each part as head / modifier / preparation state / dropped
  3. states ("cooked, roasted") are collapsed to the most specific one ("roasted") and moved to the END
  4. generic heads are promoted ("Fish, salmon, Atlantic" -> "Salmon, atlantic"), animal + cut are joined
     ("Chicken" + "breast" -> "Chicken breast"; "Beef" + "ground" -> "Ground beef"), some heads are inverted
     ("Beans, kidney" -> "Kidney beans", "Cheese, cheddar" -> "Cheddar cheese")
  5. sentence case with proper nouns / acronyms restored
=> "Chicken breast, roasted"

Confidence (0..1) drops for long/odd names, leftover odd tokens, non-English text, unknown category or an
ambiguous category; rows under `review_threshold` go to needs_review_names.csv / .jsonl.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

from .report import Log
from .schema import CATEGORIES, TAGS
from .textutil import clean_ws, raw_tokens, singular

DEFAULT_RULES_PATH = Path(__file__).resolve().parent.parent / "config" / "name_rules.json"

_STATE_TOKEN_SPLIT = re.compile(r"\s+")


def _phrases(s: str) -> list[str]:
    return [p.strip() for p in s.split(",") if p.strip()]


def ptoks(text: str) -> tuple[str, ...]:
    """Singularised word tokens used for lexicon matching."""
    return tuple(singular(t) for t in raw_tokens(text))


class Rules:
    """Compiled view of name_rules.json."""

    def __init__(self, d: dict[str, Any]):
        self.d = d
        self.review_threshold = float(d.get("review_threshold", 0.7))
        self.abbr = d.get("abbreviations", {})
        self.drop_inline = [re.compile(p, re.I) for p in d.get("drop_inline", [])]
        self.drop_parts = [re.compile(r"^(?:%s)$" % p, re.I) for p in d.get("drop_parts", [])]
        self.mod_rewrites = d.get("mod_rewrites", {})
        self.mod_rewrite_regex = [(re.compile(a, re.I), b) for a, b in d.get("mod_rewrite_regex", [])]
        self.states = set(d.get("states", []))
        self.state_phrases = sorted([s for s in self.states if " " in s], key=len, reverse=True)
        self.state_spelling = d.get("state_spelling", {})
        self.cooking_methods = set(d.get("cooking_methods", []))
        self.promote = set(d.get("promote_heads", []))
        self.invert = d.get("invert_heads", {})
        self.invert_skip = set(d.get("invert_skip_mods", []))
        self.animals = set(d.get("animal_heads", []))
        self.prefix_mods = set(d.get("prefix_mods", []))
        self.cut_nouns = set(d.get("cut_nouns", []))
        self.cut_suffixes = set(d.get("cut_suffixes", []))
        self.product_nouns = set(d.get("product_nouns", []))
        self.proper = sorted(d.get("proper_words", []), key=len, reverse=True)
        self.proper_re = re.compile(r"\b(" + "|".join(re.escape(p) for p in self.proper) + r")\b") if self.proper else None
        self.acronyms = set(d.get("acronyms", []))
        self.acronym_re = re.compile(r"\b(" + "|".join(sorted(map(re.escape, self.acronyms), key=len, reverse=True)) + r")\b") \
            if self.acronyms else None
        self.min_cat_score = float(d.get("min_category_score", 3))
        self.group_weight = float(d.get("group_weight", 4))
        self.group_hints = [(a.lower(), b) for a, b in d.get("source_group_hints", [])]
        self.cat_order = d.get("category_order", CATEGORIES)
        self.generic_base = set(d.get("generic_base_nouns", []))
        self.stopwords = set(d.get("dedupe_stopwords", []))
        self.spelling = d.get("spelling", {})
        # lexicon: phrase tuple -> categories
        self.cat_index: dict[tuple[str, ...], set[str]] = defaultdict(set)
        for cat, s in d.get("categories", {}).items():
            for ph in _phrases(s):
                t = ptoks(ph)
                if t:
                    self.cat_index[t].add(cat)
        self.tag_index: dict[str, set[tuple[str, ...]]] = {}
        for tag, s in d.get("tags", {}).items():
            self.tag_index[tag] = {ptoks(p) for p in _phrases(s) if ptoks(p)}
        self.processed_kw = {ptoks(p) for p in _phrases(d.get("tag_processed_keywords", "")) if ptoks(p)}
        self.processed_cats = set(d.get("tag_processed_categories", []))
        # synonyms
        self.groups: list[dict[str, Any]] = []
        self.term_to_group: dict[str, int] = {}
        for gi, g in enumerate(d.get("synonyms", [])):
            terms = [t.lower() for t in g["terms"]]
            self.groups.append({"terms": terms, "unless": [u.lower() for u in g.get("unless", [])]})
            for t in terms:
                self.term_to_group.setdefault(t, gi)
        alt = sorted(self.term_to_group, key=len, reverse=True)
        self.syn_re = re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(t) for t in alt) + r")(s|es)?(?![a-z0-9])") if alt else None
        self.spell_re = re.compile(r"(?<![a-z0-9-])(" + "|".join(re.escape(t) for t in sorted(self.spelling, key=len, reverse=True)) + r")(?![a-z0-9-])") \
            if self.spelling else None


_RULES_CACHE: dict[str, Rules] = {}


def load_rules(path: str | Path | None = None) -> Rules:
    p = str(path or DEFAULT_RULES_PATH)
    if p not in _RULES_CACHE:
        with open(p, encoding="utf-8") as f:
            _RULES_CACHE[p] = Rules(json.load(f))
    return _RULES_CACHE[p]


# --------------------------------------------------------------------------- synonyms / canonical text

def _unless_blocks(group: dict, text: str) -> bool:
    toks = set(raw_tokens(text))
    flat = " ".join(raw_tokens(text))
    return any((u in toks) or (u in flat) for u in group["unless"])


def canon_text(text: str, rules: Rules) -> str:
    """Normalise spelling variants and synonyms to ONE canonical wording (used for dedupe keys)."""
    t = text.lower()
    if rules.spell_re:
        t = rules.spell_re.sub(lambda m: rules.spelling[m.group(1)], t)
    if rules.syn_re:
        def sub(m: re.Match) -> str:
            g = rules.groups[rules.term_to_group[m.group(1)]]
            if _unless_blocks(g, text):
                return m.group(0)
            return g["terms"][0]
        t = rules.syn_re.sub(sub, t)
    return t


def synonym_variants(text: str, rules: Rules, limit: int = 4) -> list[str]:
    """Alternative wordings of `text` from the synonym groups (keeps plural suffix)."""
    out: list[str] = []
    if not rules.syn_re:
        return out
    t = text.lower()
    for m in rules.syn_re.finditer(t):
        g = rules.groups[rules.term_to_group[m.group(1)]]
        if _unless_blocks(g, t):
            continue
        suffix = m.group(2) or ""
        for alt in g["terms"][:limit + 1]:
            if alt == m.group(1):
                continue
            out.append((t[:m.start()] + alt + (suffix if not alt.endswith("s") else "") + t[m.end():]).strip())
    return out


def key_tokens(text: str, rules: Rules) -> tuple[str, ...]:
    """Canonical token tuple (synonyms + spelling folded, singular, stop-words removed, sorted, unique)."""
    t = canon_text(text, rules)
    toks = {singular(x) for x in raw_tokens(t) if x not in rules.stopwords}
    return tuple(sorted(toks))


# --------------------------------------------------------------------------- name parsing

def _expand_abbreviations(s: str, rules: Rules) -> str:
    def sub(m: re.Match) -> str:
        w = m.group(0)
        return rules.abbr.get(w, w)
    return re.sub(r"[a-z]+/?o?/?|w/o|w/", sub, s)


def _title_case_proper(s: str, rules: Rules) -> str:
    if rules.proper_re:
        s = rules.proper_re.sub(lambda m: m.group(1).title(), s)
    if rules.acronym_re:
        s = rules.acronym_re.sub(lambda m: m.group(1).upper(), s)
    s = re.sub(r"\bvitamin ([a-z]\d*)\b", lambda m: "vitamin " + m.group(1).upper(), s)
    for i, ch in enumerate(s):
        if ch.isalpha():
            return s[:i] + ch.upper() + s[i + 1:]
    return s


def _state_of(part: str, rules: Rules) -> str | None:
    p = rules.state_spelling.get(part, part)
    words = p.split()
    if not words or len(words) > 6:
        return None
    if p in rules.states:
        return p
    for ph in rules.state_phrases:
        if p.startswith(ph + " ") or p == ph:
            return p
    w0 = rules.state_spelling.get(words[0], words[0])
    if w0 in rules.states and w0 not in ("dry",):
        return p
    if w0 == "dry" and len(words) <= 2 and (len(words) == 1 or words[1] in ("roasted",)):
        return p
    return None


def _handle_parens(s: str, rules: Rules) -> tuple[str, list[str], int]:
    """Parentheses holding alternative names ("(garbanzo beans, bengal gram)") become aliases and leave the name;
    parentheses holding qualifiers ("(with skin)", "(boiled)", "(85% lean)") stay as ordinary comma parts."""
    keep_words = set(rules.d.get("paren_keep_words", []))
    skip_rx = re.compile(rules.d.get("alias_skip_pattern", r"$^"), re.I)
    aliases: list[str] = []
    kept = 0

    def sub(m: re.Match) -> str:
        nonlocal kept
        pieces = [clean_ws(p) for p in m.group(1).split(",") if clean_ws(p)]
        def is_qualifier(p: str) -> bool:
            w = p.split()
            return (not w or any(x in keep_words for x in w) or bool(re.search(r"\d|%", p)) or _state_of(p, rules) is not None
                    or any(rx.match(p) for rx in rules.drop_parts) or len(w) > 3 or not re.fullmatch(r"[a-z' -]+", p))
        if any(is_qualifier(p) for p in pieces):
            kept += 1
            return "(" + m.group(1) + ")"
        for p in pieces:
            if not skip_rx.search(p):
                aliases.append(p)
        return " "

    return re.sub(r"\(([^)]*)\)", sub, s), aliases, kept


def _is_cut(m0: str, rules: Rules) -> bool:
    words = m0.split()
    if len(words) > 3 or re.search(r"\d|%", m0):
        return False
    return m0 in rules.cut_nouns or words[-1] in rules.cut_suffixes


def _rewrite_part(p: str, rules: Rules) -> str | None:
    if p in rules.mod_rewrites:
        return rules.mod_rewrites[p]
    for rx, rep in rules.mod_rewrite_regex:
        if rx.match(p):
            return rx.sub(rep, p)
    return p


def _score_head(toks: tuple[str, ...], rules: Rules) -> dict[str, float]:
    out: dict[str, float] = {}
    n = len(toks)
    if not n:
        return out
    for cat in rules.cat_index.get(toks, ()):
        out[cat] = max(out.get(cat, 0), 10 + n)
    for i in range(1, n):
        for cat in rules.cat_index.get(toks[i:], ()):
            out[cat] = max(out.get(cat, 0), 6 + (n - i))
    for j in range(1, n):
        for cat in rules.cat_index.get(toks[:j], ()):
            out[cat] = max(out.get(cat, 0), 5 + j)
    return out


def classify(head_cands: list[tuple[str, float]], other_parts: list[str], group: str, rules: Rules
             ) -> tuple[str, float, float]:
    """-> (category, best score, margin to the runner-up category)."""
    best: dict[str, float] = {}
    for text, w in head_cands:
        for cat, s in _score_head(ptoks(text), rules).items():
            best[cat] = max(best.get(cat, 0.0), s * w)
    other: dict[str, float] = defaultdict(float)
    for part in other_parts:
        toks = ptoks(part)
        seen = set()
        for n in (3, 2, 1):
            for i in range(0, len(toks) - n + 1):
                for cat in rules.cat_index.get(toks[i:i + n], ()):
                    if cat not in seen:
                        seen.add(cat)
                        other[cat] = min(6.0, other[cat] + 3.0)
    for cat, s in other.items():
        best[cat] = best.get(cat, 0.0) + s
    g = (group or "").lower()
    if g:
        for sub, cat in rules.group_hints:
            if sub in g:
                best[cat] = best.get(cat, 0.0) + rules.group_weight
                break
    if not best:
        return "other", 0.0, 0.0
    order = {c: i for i, c in enumerate(rules.cat_order)}
    ranked = sorted(best.items(), key=lambda kv: (-kv[1], order.get(kv[0], 99)))
    top, s1 = ranked[0]
    s2 = ranked[1][1] if len(ranked) > 1 else 0.0
    if s1 < rules.min_cat_score:
        return "other", s1, 0.0
    return top, s1, s1 - s2


def _find_tags(flat_tokens: tuple[str, ...], category: str, rules: Rules) -> list[str]:
    def has(phrases: set[tuple[str, ...]]) -> bool:
        n = len(flat_tokens)
        for ph in phrases:
            k = len(ph)
            for i in range(0, n - k + 1):
                if flat_tokens[i:i + k] == ph:
                    return True
        return False
    tags = []
    req = {
        "fatty_fish": {"fish"},
        "leafy_green": {"vegetable"},
        "whole_grain": {"grain", "prepared"},
        "plant_iron": {"legume", "vegetable", "nut_seed", "grain", "fruit"},
        "fermented": {"dairy", "vegetable", "legume", "condiment", "beverage", "prepared", "grain"},
    }
    for tag in TAGS:
        if tag == "processed":
            continue
        ph = rules.tag_index.get(tag)
        if ph and category in req.get(tag, set(CATEGORIES)) and has(ph):
            tags.append(tag)
    if category in rules.processed_cats or has(rules.processed_kw):
        tags.append("processed")
    return tags


def parse_name(raw: str, rules: Rules, abbreviated: bool = False, source_group: str = "",
               alt_names: list[str] | tuple[str, ...] = ()) -> dict[str, Any]:
    """Pure: raw source description -> dict(name, core, head, states, category, tags, aliases, conf, reasons)."""
    reasons: list[str] = []
    conf = 1.0
    s0 = unicodedata.normalize("NFKC", str(raw)).strip()
    if re.search(r"[®™©]", s0):
        reasons.append("trademark_symbol")
        conf -= 0.3
    s = s0.lower().replace("&amp;", "&")
    s = s.replace('"', "").replace("”", "").replace("“", "").replace("’", "'")
    if abbreviated:
        s = _expand_abbreviations(s, rules)
    s = re.sub(r"\bw/o\b", "without", s)
    s = re.sub(r"\bw/(?=\s|$)", "with ", s)
    alts = re.findall(r"\[([^\]]+)\]", s)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    for rx in rules.drop_inline:
        s = rx.sub(" ", s)
    s, paren_aliases, n_paren = _handle_parens(s, rules)
    alts = alts + paren_aliases
    s = s.replace("(", ", ").replace(")", ", ").replace(";", ", ").replace(" | ", ", ").replace(" - ", ", ")
    s = re.sub(r"\s+,", ",", s)
    parts_all = [clean_ws(p).strip(" .:") for p in s.split(",")]
    parts_all = [p for p in parts_all if p]
    n_fields = len(parts_all)

    head: str | None = None
    mods: list[str] = []
    states: list[str] = []
    for idx, p in enumerate(parts_all):
        p2 = _rewrite_part(p, rules)
        if p2 is None or not p2:
            continue
        p = p2
        if any(rx.match(p) for rx in rules.drop_parts):
            continue
        if head is not None or idx > 0:
            st = _state_of(p, rules)
            if st:
                st = rules.state_spelling.get(st, st)
                if st not in states:
                    states.append(st)
                continue
        if head is None:
            head = p
        elif p not in mods and p != head:
            mods.append(p)
    if head is None:
        if states:
            head = states.pop(0)
        else:
            head = clean_ws(s0.lower())
        reasons.append("no_head")
        conf -= 0.4
    # a first part that was only a state word ("raw", ...) is fine when it is the only thing left
    if len(states) > 1 or (states and "cooked" in states):
        if any(m in rules.cooking_methods for m in states):
            states = [x for x in states if x != "cooked"]
    if "raw" in states and "uncooked" in states:
        states.remove("uncooked")

    orig_head = head
    base: str | None = None
    # promote generic heads: "fish, salmon" -> "salmon"
    guard = 0
    while head in rules.promote and mods and guard < 2:
        head = mods.pop(0)
        guard += 1
    if head in rules.promote and not mods:
        reasons.append("generic_head")
        conf -= 0.2
    promoted_head = head
    joined = False
    if head in rules.animals and mods:
        m0 = mods[0]
        if m0 in rules.product_nouns:
            head = mods.pop(0)
        elif m0 in rules.prefix_mods:
            base = head
            head = f"{mods.pop(0)} {head}"
            joined = True
        elif _is_cut(m0, rules):
            base = head
            head = f"{head} {mods.pop(0)}"
            joined = True
    if not joined and head in rules.invert and mods:
        m0 = mods[0]
        if m0 not in rules.invert_skip and len(m0.split()) <= 3 and not re.search(r"\d|%", m0) \
                and _state_of(m0, rules) is None and not m0.startswith(("with ", "without ", "no ")):
            mods.pop(0)
            base = head
            head = f"{m0} {rules.invert[head]}"
    mods = [m for m in mods if m != head]

    pieces = [head] + mods + states
    flat_name = ", ".join(pieces)
    name = _title_case_proper(flat_name, rules)
    core = ", ".join([head] + mods)

    # category: head candidates (original head counts most when it is a generic classifier like "spices")
    wo = 1.2 if orig_head in rules.promote else 1.0
    cands: list[tuple[str, float]] = [(orig_head, wo), (promoted_head, 1.0), (head, 1.0)]
    cat, cscore, margin = classify(cands, mods, source_group, rules)
    if cat == "other":
        reasons.append("category_unknown")
        conf -= 0.35
    elif margin < 2:
        reasons.append("category_ambiguous")
        conf -= 0.15

    # confidence heuristics
    if n_fields >= 7:
        reasons.append("many_fields")
        conf -= 0.15
    if re.search(r"[\"/\\]|\btrimmed\b|\bupc\b|\d+\s*(?:oz|lb|fl)\b|#\d", flat_name):
        reasons.append("odd_tokens")
        conf -= 0.2
    if n_paren:
        reasons.append("parentheses")
        conf -= 0.05
    if len(name) > 100:
        reasons.append("very_long_name")
        conf -= 0.3
    elif len(name) > 70:
        reasons.append("long_name")
        conf -= 0.15
    if len(name.split()) > 10:
        reasons.append("many_words")
        conf -= 0.1
    if len(name) <= 2:
        reasons.append("too_short")
        conf -= 0.5
    letters = [c for c in name if c.isalpha()]
    if letters and sum(1 for c in letters if ord(c) > 127) / len(letters) > 0.05:
        reasons.append("non_ascii")
        conf -= 0.25

    # aliases
    aliases = make_aliases(head, mods, base, flat_name, name, list(alt_names) + alts, rules, joined, orig_head)
    # tags
    flat_tokens = ptoks(" ".join([head] + mods + states))
    tags = _find_tags(flat_tokens, cat, rules)

    return {
        "name": name, "core": core.lower(), "head": head, "states": states, "category": cat,
        "tags": tags, "aliases": aliases, "conf": round(max(0.0, min(1.0, conf)), 3),
        "reasons": reasons, "cat_score": cscore,
    }


def make_aliases(head: str, mods: list[str], base: str | None, flat_name: str, name: str,
                 alt_names: list[str], rules: Rules, joined: bool, orig_head: str) -> list[str]:
    out: list[str] = []

    def add(a: str) -> None:
        a = clean_ws(a.lower())
        a = re.sub(r"[^\w\s%'./-]", " ", a)
        a = clean_ws(a)
        if a and a != name.lower() and len(a) <= 60 and a not in out:
            out.append(a)

    head_l = head.lower()
    variants = [head_l]
    # head phrase alone ("chicken breast", "kidney beans") is the thing people type
    if len(head_l.split()) >= 2 or mods:
        add(head_l)
    # reversed first modifier: "cheddar cheese" for "Cheese, cheddar"; "whole milk" for "Milk, whole"
    if mods and len(head_l.split()) == 1:
        m0 = mods[0].lower()
        if len(m0.split()) == 1 and re.fullmatch(r"[a-z][a-z'-]*", m0) and not m0.startswith(("with", "without", "no ")) \
                and m0 not in ("lean only", "skin only", "plain", "unsweetened", "sweetened", "salted", "unsalted"):
            rev = f"{m0} {head_l}"
            add(rev)
            variants.append(rev)
    if base and base.lower() not in rules.generic_base and base.lower() != head_l:
        add(base)
    # singular form when the head is a plural ("bananas" -> "banana")
    words = head_l.split()
    if words:
        sg = singular(words[-1])
        if sg != words[-1] and len(sg) > 2:
            sing = " ".join(words[:-1] + [sg])
            add(sing)
            variants.append(sing)
    # synonyms ("zucchini" <-> "courgette")
    for v in list(variants):
        for syn in synonym_variants(v, rules):
            add(syn)
    for a in alt_names:
        if isinstance(a, str) and 2 <= len(a) <= 60:
            add(a)
    # spelling variant of the full name (UK/US)
    return out[:12]


# --------------------------------------------------------------------------- DataFrame stage

NAME_COLUMNS = ["name", "core", "head", "state", "category", "tags", "aliases", "name_conf", "name_reasons"]


def load_overrides(path: str | Path | None) -> dict[str, dict[str, Any]]:
    """Overrides keyed by uid. Accepts JSON {uid: {...}} or JSONL rows {id, proposed_name, category, aliases?}
    (the same shape as the needs_review_names.jsonl export, so an LLM reply can be dropped in as-is)."""
    if not path or not Path(path).exists():
        return {}
    text = Path(path).read_text(encoding="utf-8").strip()
    if not text:
        return {}
    rows: dict[str, dict[str, Any]] = {}
    try:
        whole = json.loads(text)
    except json.JSONDecodeError:
        whole = None  # several JSONL lines
    if isinstance(whole, dict):
        if "id" in whole or "uid" in whole:  # a single JSONL row
            return {whole.get("id") or whole.get("uid"): whole}
        return {k: v for k, v in whole.items() if not str(k).startswith("_")}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        key = r.get("id") or r.get("uid")
        if key:
            rows[key] = r
    return rows


def clean_names(items: pd.DataFrame, rules: Rules | None = None, abbreviated_sources: set[str] | None = None,
                overrides: dict[str, dict[str, Any]] | None = None, log: Log | None = None) -> pd.DataFrame:
    """Pure: items (uid, source, raw_name, source_group, alt_names) -> items + NAME_COLUMNS."""
    rules = rules or load_rules()
    abbreviated_sources = abbreviated_sources or set()
    overrides = overrides or {}
    abbr_col = dict(zip(items["uid"], items["abbreviated"])) if "abbreviated" in items else {}
    cache: dict[tuple, dict] = {}
    recs: list[dict[str, Any]] = []
    for uid, src, raw, grp, alts in zip(items["uid"], items["source"], items["raw_name"],
                                        items["source_group"] if "source_group" in items else [""] * len(items),
                                        items["alt_names"] if "alt_names" in items else [[]] * len(items)):
        abbr = src in abbreviated_sources or bool(abbr_col.get(uid, False))
        alts_t = tuple(alts) if isinstance(alts, (list, tuple)) else ()
        key = (raw, abbr, grp, alts_t)
        r = cache.get(key)
        if r is None:
            r = parse_name(raw, rules, abbr, grp or "", alts_t)
            cache[key] = r
        r = dict(r)
        ov = overrides.get(uid)
        if ov:
            if ov.get("proposed_name") or ov.get("name"):
                r["name"] = ov.get("proposed_name") or ov.get("name")
            if ov.get("category") in CATEGORIES:
                r["category"] = ov["category"]
            if ov.get("aliases"):
                r["aliases"] = list(dict.fromkeys(list(ov["aliases"]) + r["aliases"]))
            r["conf"] = 1.0
            r["reasons"] = list(r["reasons"]) + ["override"]
            if log:
                log.add("names", "override", "name_override_applied", uid=uid, source=src)
        recs.append(r)
    out = items.copy()
    out["name"] = [r["name"] for r in recs]
    out["core"] = [r["core"] for r in recs]
    out["head"] = [r["head"] for r in recs]
    out["state"] = [" | ".join(r["states"]) for r in recs]
    out["category"] = [r["category"] for r in recs]
    out["tags"] = [r["tags"] for r in recs]
    out["aliases"] = [r["aliases"] for r in recs]
    out["name_conf"] = [r["conf"] for r in recs]
    out["name_reasons"] = [";".join(r["reasons"]) for r in recs]
    if log:
        log.add("names", "info", "names_cleaned", n=len(out))
        log.add("names", "info", "low_confidence_names", n=int((out["name_conf"] < rules.review_threshold).sum()))
    return out


def build_review(foods: pd.DataFrame, threshold: float, id_col: str = "uid") -> pd.DataFrame:
    """Rows to send to an LLM: id (uid of the primary source record), raw_name, proposed_name, category, + context."""
    low = foods[foods["name_conf"] < threshold]
    cols = {
        "id": low[id_col].to_numpy(),
        "raw_name": low["raw_name"].to_numpy(),
        "proposed_name": low["name"].to_numpy(),
        "category": low["category"].to_numpy(),
        "confidence": low["name_conf"].to_numpy(),
        "reasons": low["name_reasons"].to_numpy(),
    }
    if "food_id" in low:
        cols["food_id"] = low["food_id"].to_numpy()
    return pd.DataFrame(cols)


def review_jsonl(review: pd.DataFrame) -> str:
    lines = []
    for r in review.itertuples(index=False):
        lines.append(json.dumps(
            {"id": r.id, "raw_name": r.raw_name, "proposed_name": r.proposed_name, "category": r.category,
             "reasons": r.reasons},
            ensure_ascii=False))
    return "\n".join(lines) + ("\n" if lines else "")
