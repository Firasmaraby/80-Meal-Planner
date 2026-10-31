"""Orchestration of the consumer layer: records -> enriched -> hidden / extended / everyday -> ranked.

Pure functions over the record dicts produced by adapter.load_records, so build.py and the tests share them.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from . import aliases as A
from . import names_en as N
from . import rank as R
from . import tiers as T
from .adapter import sig4  # noqa: F401  (re-export for convenience)

SPARSE_MIN_BOARD = 6


def enrich(rec: dict[str, Any], lex: N.Lexicon) -> dict[str, Any]:
    """Add name / head / form / category / tags / aliases / flags to a record (in place) and return it."""
    nr = N.build_name(rec["name_en"], rec["source_id"], lex, rec["food_group"])
    cat = N.category_of(rec["food_group"], rec["name_en"] if rec["food_group"] == "meat_poultry" else nr.name)
    rec["raw_name"] = rec["name_en"]
    rec["name"] = nr.name
    rec["head"] = nr.head
    rec["branded"] = nr.branded
    rec["category"] = cat or "other"
    rec["baby"] = cat is None
    rec["form"] = N.form_of(rec["state"], nr.name, rec["category"], nr.parts)
    rec["ultra"] = T.is_ultra_processed(rec)
    rec["ext_reasons"] = T.extended_reasons(rec)
    rec["tags"] = N.tags_of(nr.name, rec["category"], rec["n"].get("iron"), nr.branded, rec["ultra"] and rec["category"] in {"sweet", "prepared", "beverage", "other"})
    rec["aliases"] = N.aliases_for(nr.head, nr.name, N.paren_names(rec["name_en"]), lex)
    rec["n_board"] = T.count_board(rec["n"])
    return rec


def common_positions(lex: N.Lexicon) -> dict[str, tuple[int, set[str]]]:
    """head key -> (position in the list, preferred forms)."""
    pos: dict[str, tuple[int, set[str]]] = {}
    for e in lex.entries:
        k = N.head_key(e.head)
        if k not in pos:
            pos[k] = (len(pos), set())
        if e.form:
            pos[k][1].add(e.form)
    return pos


def prepare(records: list[dict[str, Any]], lex: N.Lexicon, aliases: dict[str, list[str]] | None = None) -> dict[str, int]:
    """After enrich: apply head_aliases.json, then make every head spelled one way per head key ('Blueberries' / 'blueberry' /
    'blueberries' -> one head), and give the list's own heads the same spelling. Idempotent."""
    for r in records:
        r.setdefault("src0", [list(x) for x in r["src"]])
        r.setdefault("n_sources0", r["n_sources"])
        r.setdefault("head0", r["head"])
        r["head"] = r["head0"]
    n_alias = A.apply_aliases(records, aliases or {})
    by_key: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        by_key[N.head_key(r["head"])][r["head"]] += 1
    listed = {N.head_key(e.head): e.head for e in lex.entries}
    canon: dict[str, str] = {}
    for k, cnt in by_key.items():
        canon[k] = listed[k] if k in listed and listed[k] in cnt else sorted(cnt, key=lambda h: (-cnt[h], len(h), h))[0]
    merged = 0
    for r in records:
        c = canon[N.head_key(r["head"])]
        if c != r["head"]:
            merged += 1
            r["head"] = c
    for e in lex.entries:
        e.head = canon.get(N.head_key(e.head), e.head)
    lex.known = {e.head for e in lex.entries}
    return {"aliased": n_alias, "heads_respelled": merged, "head_keys": len(by_key)}


REGION_RUNG = {"cnf": 0, "usda_fdc_sr_legacy": 1, "usda_fdc_foundation": 2}


SOURCE_COUNTRY = {"cnf": "Canada", "usda_fdc_sr_legacy": "US", "usda_fdc_foundation": "US", "cofid": "UK", "afcd": "Australia",
                  "ciqual": "France", "swiss_fcdb": "Switzerland", "mext_japan": "Japan", "taco": "Brazil"}
SAME_FOOD_KCAL = 0.20     # same name across categories / forms: one food when energy is within 20 %


def _priority(pinned: set[str]):
    return lambda r: (r["canonical_id"] not in pinned, REGION_RUNG.get(r["source_id"], 3), -r["n_board"], r["canonical_id"])


def _merge(win: dict[str, Any], lose: dict[str, Any]) -> None:
    lose["hidden_reason"] = "duplicate_name"
    lose["duplicate_of"] = win["canonical_id"]
    have = {(db, ref) for db, ref in win["src"]}
    for db, ref in lose["src"]:
        if (db, ref) not in have:
            have.add((db, ref))
            win["src"].append([db, ref])
    win["n_sources"] = max(win["n_sources"], len({db for db, _ in win["src"]}))
    win["collapsed"] += 1


def _close_kcal(a: dict[str, Any], b: dict[str, Any]) -> bool:
    ka, kb = a["n"].get("kcal"), b["n"].get("kcal")
    return ka is not None and kb is not None and abs(ka - kb) <= SAME_FOOD_KCAL * max(ka, kb, 1.0)


def collapse(records: list[dict[str, Any]], pinned: set[str]) -> int:
    """One food per name, so a list never shows the same name twice ('Blueberries, raw' == 'Blueberry, raw').
    1. same normalised display name + form + category: one food;
    2. same normalised name across categories / forms (sources file hummus as a legume or a dish): one food when the
       energy is within 20 %; a really different food under the same name (coconut milk, canned 214 kcal vs drink 22 kcal)
       stays and is labelled with its source country.
    The region-priority record (cnf, usda_sr, usda_foundation, other; then more nutrients) stays, the others are hidden as
    `duplicate_name` and their citations are added to the survivor's `src`. Pinned records are never hidden.
    Returns how many were collapsed."""
    prio = _priority(pinned)
    for r in records:                      # idempotent: curate runs twice (before and after the legacy pins)
        r["name"] = r.setdefault("name0", r["name"])
        r["collapsed"] = 0
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        if not r["hidden_reason"]:
            groups[(N.head_key(r["name"]), r["category"], r["form"])].append(r)
    n = 0
    for grp in groups.values():
        grp.sort(key=prio)
        for lose in grp[1:]:
            _merge(grp[0], lose)
            n += 1
    by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        if not r["hidden_reason"]:
            by_name[N.head_key(r["name"])].append(r)
    for grp in by_name.values():
        if len(grp) < 2:
            continue
        grp.sort(key=prio)
        kept: list[dict[str, Any]] = []
        for r in grp:
            win = next((k for k in kept if _close_kcal(k, r)), None)
            if win is None or r["canonical_id"] in pinned:
                kept.append(r)
            else:
                _merge(win, r)
                n += 1
        for r in kept[1:]:
            # kept legacy sample foods have no foodpipe source: their citation names the database
            country = SOURCE_COUNTRY.get(r["source_id"]) or ("US" if r["src"] and "USDA" in r["src"][0][0] else None)
            if country and not r["name"].endswith(f"({country})"):
                r["name"] = f"{r['name']} ({country})"
    return n


def curate(records: list[dict[str, Any]], lex: N.Lexicon, pinned: set[str] | None = None, target: int = 3000,
           unhide_ok: set[str] | None = None, prefs: R.Prefs | None = None) -> dict[str, Any]:
    """Assign tier / reason / score / rank to every record (in place). Returns summary numbers.

    unhide_ok: canonical ids whose 'supplement' hidden reason is waived (legacy sample foods a bundled plan uses)."""
    pinned = pinned or set()
    unhide_ok = unhide_ok or set()
    pos = common_positions(lex)
    n_common = len(pos)
    head_prefer: dict[str, list[str]] = {}
    for e in lex.entries:
        if e.prefer:
            head_prefer.setdefault(e.head, []).extend(e.prefer)
    prefs = prefs or R.Prefs(head_prefer=head_prefer)
    for r in records:
        r["src"] = [list(x) for x in r["src0"]]
        r["n_sources"] = r["n_sources0"]
        r.pop("collapsed", None)
        r["hidden_reason"] = T.hidden_reason(r)
        if r["hidden_reason"] == "supplement" and r["canonical_id"] in unhide_ok:
            r["hidden_reason"] = None
            r["waived"] = "legacy_plan_ingredient"
    n_collapsed = collapse(records, pinned | unhide_ok)
    for r in records:
        r["score"] = R.score(r, pos, n_common, prefs)
    live = [r for r in records if not r["hidden_reason"]]
    # extended-only
    for r in live:
        reasons = list(r["ext_reasons"])
        if r["n_board"] < SPARSE_MIN_BOARD and N.head_key(r["head"]) not in pos:
            reasons.append("sparse_data")
        r["ext_all"] = reasons
    cands = [r for r in live if not r["ext_all"] or r["canonical_id"] in pinned]
    chosen = T.select_everyday(cands, lex.entries, pinned & {r["canonical_id"] for r in cands}, target)
    for r in records:
        if r["hidden_reason"]:
            r["tier"] = "hidden"
        elif r["canonical_id"] in chosen:
            r["tier"] = "everyday"
            r["why"] = chosen[r["canonical_id"]]
        else:
            r["tier"] = "extended"
            r["why"] = ",".join(r.get("ext_all", [])) or "below_everyday_cut"
        r["rank"] = R.to_rank(r["score"], r["tier"]) if r["tier"] != "hidden" else 0
    return {"chosen": chosen, "collapsed": n_collapsed}


def hidden_summary(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        if r["tier"] == "hidden":
            out[r["hidden_reason"]].append(r)
    return out
