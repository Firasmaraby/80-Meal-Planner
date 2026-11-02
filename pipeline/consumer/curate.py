"""Orchestration of the consumer layer: records -> enriched -> hidden / extended / everyday -> ranked.

Pure functions over the record dicts produced by adapter.load_records, so build.py and the tests share them.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from . import adapter as AD
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


def borrow_fatty_acids_by_head(records: list[dict[str, Any]]) -> dict[str, int]:
    """Route 2 of the fatty-acid borrowing (route 1, the same canonical cluster, ran in adapter.load_records).
    A live record with fat >= 1 g and a missing sat / mono / poly split takes the proportions of the highest-ranked OTHER live record
    with the same head and category that has a measured split of its own (never one that was itself borrowed). Needs
    tiers and ranks, so it runs after curate. Returns the counts. Records without a donor keep the split missing."""
    live = [r for r in records if r.get("tier") not in (None, "hidden")]
    donors: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in sorted(live, key=lambda r: (-r["rank"], r["canonical_id"])):
        if AD.has_fa_split(r["n"]) and not r.get("fa_borrow"):
            donors[(r["head"], r["category"])].append(r)
    by_route = {"cluster": 0, "head": 0, "none": 0}
    everyday = {"cluster": 0, "head": 0, "none": 0}
    for r in live:
        if r.get("fa_borrow"):
            by_route["cluster"] += 1
            everyday["cluster"] += r["tier"] == "everyday"
            continue
        if not AD.needs_fa_split(r["n"]):
            continue
        cands = [d for d in donors.get((r["head"], r["category"]), []) if d["canonical_id"] != r["canonical_id"]]
        if not cands:
            by_route["none"] += 1
            everyday["none"] += r["tier"] == "everyday"
            continue
        d = cands[0]
        if not AD.borrow_fatty_acids(r["n"], r["estimated"], r["notes"], d["n"], f"{d['name']} [{d['canonical_id']}]",
                                     "same head and category", r.get("food_group")):
            by_route["none"] += 1
            everyday["none"] += r["tier"] == "everyday"
            continue
        r["fa_borrow"] = "head"
        r["fa_donor"] = d["name"]
        by_route["head"] += 1
        everyday["head"] += r["tier"] == "everyday"
    return {"all": by_route, "everyday": everyday}


# --------------------------------------------------------------------------------------------- choline
# Choline is measured for only about half of the foods, and a missing value counts as zero in the app, so plans looked choline-poor
# unless they leaned on eggs. In muscle meat, fish and legumes choline tracks protein closely (lentils: 3.9 mg per g protein dry,
# 3.6 boiled; chickpeas 4.85 and 4.83), so a missing value is estimated from a measured donor's choline per gram of protein.
CHOLINE_CATS = ("meat", "poultry", "fish", "legume", "egg", "dairy")
CHOLINE_FALLBACK_CATS = ("meat", "poultry", "fish", "legume")  # muscle tissue and plain pulses: mg per g protein is tight (pulses: IQR 3.2-4.7); dairy varies too much
# legume foods that aren't plain pulses: sweet pastes and jellies, fried mixes, pulp, pods eaten as vegetables
LEGUME_NOT_PLAIN_RX = re.compile(r"\b(?:sweet\w*|jelly|yokan|paste|an|falafel|okara|green beans?|french beans?|yardlong|winged)\b", re.I)
ORGAN_RX = re.compile(r"\b(?:liver|kidney|heart|giblets?|brain|tongue|tripe|offal|sweetbread|gizzard|roe|caviar|marrow|blood|skin|fat)\b", re.I)
PROCESSED_RX = re.compile(r"\b(?:sausage|salami|bologna|frankfurter|hot dog|nugget|breaded|battered|patty|loaf|spread|pate|pâté|jerky|"
                          r"bacon|ham|luncheon|canned with|in sauce|salad|soup|stew|curry|with)\b", re.I)
CHOLINE_MIN_PROTEIN = 2.0
CHOLINE_FALLBACK_MIN_DONORS = 10


def _choline_ratio(r: dict[str, Any]) -> float | None:
    n = r["n"]
    if n.get("choline") is None or "choline" in r["estimated"] or (n.get("protein") or 0) < CHOLINE_MIN_PROTEIN:
        return None
    return n["choline"] / n["protein"]


def _plain(r: dict[str, Any]) -> bool:
    """A plain muscle food or a plain pulse, the only kind a category median speaks for."""
    name = r["name"]
    if ORGAN_RX.search(name) or PROCESSED_RX.search(name):
        return False
    return not (r["category"] == "legume" and LEGUME_NOT_PLAIN_RX.search(name))


def borrow_choline(records: list[dict[str, Any]]) -> dict[str, int]:
    """Fill a missing choline value on live meat, poultry, fish, egg, dairy and legume records (protein >= 2 g):
    1. same head and category: the highest-ranked measured donor, preferring the same form; choline = donor mg per g protein x own protein;
    2. otherwise, for plain muscle meat, poultry, fish and plain pulses only (no organ meat, no processed food, no sweet bean
       pastes): the category's median ratio over
       its measured plain foods (at least 10 of them).
    The value is marked estimated with a note naming the donor. Returns counts per route."""
    live = [r for r in records if r.get("tier") not in (None, "hidden")]
    donors: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    plain: dict[str, list[float]] = defaultdict(list)
    for r in sorted(live, key=lambda r: (-r["rank"], r["canonical_id"])):
        ratio = _choline_ratio(r)
        if ratio is None or r["category"] not in CHOLINE_CATS:
            continue
        donors[(r["head"], r["category"])].append(r)
        if r["category"] in CHOLINE_FALLBACK_CATS and _plain(r):
            plain[r["category"]].append(ratio)
    medians = {c: sorted(v)[len(v) // 2] for c, v in plain.items() if len(v) >= CHOLINE_FALLBACK_MIN_DONORS}
    out = {"head": 0, "category": 0, "none": 0}
    for r in live:
        n = r["n"]
        if r["category"] not in CHOLINE_CATS or n.get("choline") is not None or (n.get("protein") or 0) < CHOLINE_MIN_PROTEIN:
            continue
        cands = [d for d in donors.get((r["head"], r["category"]), []) if d["canonical_id"] != r["canonical_id"]]
        cands.sort(key=lambda d: d.get("form") != r.get("form"))      # stable: same form first, rank order kept within
        if cands:
            d = cands[0]
            ratio, why = _choline_ratio(d), f"{d['name']} [{d['canonical_id']}]"
            route = "head"
        elif r["category"] in medians and _plain(r):
            ratio, why = medians[r["category"]], f"the median of measured plain {r['category']} foods"
            route = "category"
        else:
            out["none"] += 1
            continue
        n["choline"] = round(ratio * n["protein"], 1)
        r["estimated"].append("choline")
        r["notes"].append(f"choline estimated from {why}: {ratio:.2f} mg per g protein")
        out[route] += 1
    return out
