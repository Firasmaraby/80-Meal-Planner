"""Legacy id map: the 128 hand-made sample foods (src/data/foods.json) -> best new food id.

Match by head / name tokens / form, verify kcal within 15 %.  The sample plans and swap groups reference the old ids, so
the app keeps them resolvable (legacyIdMap.json + FOOD_INDEX.get) and plans.json / swapGroups.json are rewritten to the new ids.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from . import names_en as N

KCAL_TOL = 0.15
GENERIC_WORDS = {"green", "greens", "leaf", "fruit", "root", "fresh", "whole"}


def _toks(s: str) -> set[str]:
    return {N.singular_word(t) for t in re.findall(r"[a-z0-9%]+", N.fold(s)) if t not in {"raw", "and", "with", "of", "the", "a"}}


PROCESSING_WORDS = {"salt", "season", "roast", "fry", "fried", "sweeten", "flavor", "sauce", "mix", "glazed", "coated", "candied",
                    "honey", "smoked", "pickled", "breaded", "battered", "toasted", "oil", "unprepared", "homemade", "restaurant"}


def legacy_form(name: str, cat: str) -> str:
    low = name.lower()
    if cat == "nut_seed" and not re.search(r"roast|butter|oil|salt|season|dry|dried|flour|paste|milk|ground|meal|toasted|fried", low):
        return "raw"
    if re.search(r"\b(boiled|cooked|roasted|baked|braised|grilled|steamed|prepared)\b", low):
        return "cooked"
    if re.search(r"\bdried?\b|\bdry\b", low):
        return "dried"
    if "canned" in low:
        return "canned"
    if "juice" in low:
        return "juice"
    return "raw" if cat in {"fruit", "vegetable"} or "raw" in low else "product"


# words that change the nutrition (iodine in salt, calcium from bones, added vitamins): when the sample food's name has
# one, a candidate without it is the wrong food however close its name is
DEFINING_WORDS = {
    "iodized": re.compile(r"\biodi[sz]ed\b", re.I), "fortified": re.compile(r"\b(?<!un)fortified\b", re.I),
    "enriched": re.compile(r"\b(?<!un)enriched\b", re.I), "bone": re.compile(r"\bbones?\b", re.I),
    "unsweetened": re.compile(r"\bunsweetened\b", re.I), "skinless": re.compile(r"\bskinless\b|\bmeat only\b", re.I),
}


def defining_miss(old_name: str, new_name: str) -> int:
    return sum(1 for rx in DEFINING_WORDS.values() if rx.search(old_name) and not rx.search(new_name))


REGION_BONUS = {"cnf": 1.0, "usda_fdc_sr_legacy": 0.6, "usda_fdc_foundation": 0.6}


def best_match(old: dict[str, Any], recs: list[dict[str, Any]], lex: N.Lexicon, exclude: set[str] | None = None
               ) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Pick the best new record for one legacy food. Returns (record|None, info)."""
    on = old["name"]
    ot = _toks(on)
    ohead = N.build_name(on, "", lex).head
    ohead_t = _toks(ohead)
    okcal = (old.get("n") or {}).get("kcal")
    oform = legacy_form(on, old["category"])
    names = [on.lower()] + [a.lower() for a in old.get("aliases", [])]
    best, best_s = None, -1e9
    for r in recs:
        if exclude and r["canonical_id"] in exclude:
            continue
        if r["category"] != old["category"] and r["head"] != ohead \
                and not (old["category"] in {"fruit", "vegetable"} and r["category"] in {"fruit", "vegetable"}):
            continue
        rt = _toks(r["name"])
        if not rt:
            continue
        inter = len(ot & rt)
        if inter == 0 or not ((ohead_t - GENERIC_WORDS) <= (rt | _toks(" ".join(r.get("aliases", []))) | _toks(r["head"]))):
            continue                 # the legacy head's words must all be in the candidate's name / aliases
        jac = inter / len(ot | rt)
        s = 4.0 * jac
        if r["head"] == ohead:
            s += 3.0
        elif any(r["head"] == a for a in names):
            s += 2.0
        elif r["head"] in ohead or ohead in r["head"]:
            s += 0.5
        else:
            continue
        if r["form"] == oform:
            s += 2.0
        nk = r["n"].get("kcal")
        if okcal is not None and nk is not None:
            if abs(nk - okcal) <= max(KCAL_TOL * okcal, 3.0):
                s += 3.0 - 10 * abs(nk - okcal) / max(okcal, 1.0)
            else:
                continue            # kcal must be within 15% (or 3 kcal for ~0 kcal foods)
        else:
            continue
        extra = {w for w in PROCESSING_WORDS if any(t.startswith(w) for t in rt)} - {w for w in PROCESSING_WORDS if any(t.startswith(w) for t in ot)}
        s -= 1.5 * len(extra)
        s += (r.get("score", 0) / 100.0) * 1.5
        s -= 4.0 * defining_miss(on, r.get("name_en") or r["name"])
        s += REGION_BONUS.get(r.get("source_id"), 0.0)          # owner decision: Canada, then US
        s += 0.8 * min(r.get("n_board", 0), 30) / 30            # a fuller nutrient profile grades plans more truly
        if r.get("ext_reasons"):
            s -= 3.0
        if r.get("hidden"):
            s -= 2.5
        if s > best_s:
            best, best_s = r, s
    info: dict[str, Any] = {"score": round(best_s, 2)}
    if best is None:
        # second chance without the head requirement: same category, >= 2 shared name tokens, kcal and protein close
        for r in recs:
            if (exclude and r["canonical_id"] in exclude) or r["category"] != old["category"]:
                continue
            rt = _toks(r["name"])
            if len(ot & rt) < 2 or r.get("ext_reasons"):
                continue
            nk, nkp = r["n"].get("kcal"), r["n"].get("protein")
            okp = (old.get("n") or {}).get("protein")
            if okcal is None or nk is None or abs(nk - okcal) > max(KCAL_TOL * okcal, 3.0):
                continue
            if okp and nkp is not None and abs(nkp - okp) > max(0.25 * okp, 1.0):
                continue
            s = 2.0 * len(ot & rt) / len(ot | rt) + (r.get("score", 0) / 100.0)
            if s > best_s:
                best, best_s = r, s
        info["fallback"] = best is not None
    if best is not None:
        nk = best["n"].get("kcal")
        info["kcal_old"] = okcal
        info["kcal_new"] = None if nk is None else round(nk, 1)
        info["kcal_diff_pct"] = None if not okcal or nk is None else round(100 * (nk - okcal) / okcal, 1)
        info["within_15pct"] = nk is not None and okcal is not None and abs(nk - okcal) <= max(KCAL_TOL * okcal, 3.0)
    return best, info


def load_legacy(path: str | Path) -> list[dict[str, Any]]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


# the sample data cited databases by short names; the library uses foodpipe's citation strings
LEGACY_DB = {"USDA FDC SR Legacy": "USDA FoodData Central (SR Legacy)",
             "USDA FDC Foundation": "USDA FoodData Central (Foundation Foods)"}


def legacy_record(old: dict[str, Any], lex: N.Lexicon) -> dict[str, Any]:
    """A sample food with no foodpipe equivalent within 15 % kcal stays in the library as it was (same id, same hand-made values)."""
    nr = N.build_name(old["name"], "", lex)
    n = {k: float(v) for k, v in (old.get("n") or {}).items() if v is not None and k in {
        "kcal", "protein", "carbs", "fiber", "sugar", "fat", "satFat", "mufa", "pufa", "ala", "epa", "dha", "la", "vitA", "vitC", "vitD",
        "vitE", "vitK", "b1", "b2", "b3", "b5", "b6", "b7", "folate", "b12", "choline", "calcium", "iron", "magnesium", "phosphorus",
        "potassium", "zinc", "copper", "manganese", "selenium", "iodine", "sodium"}}
    return {
        "canonical_id": "legacy:" + old["id"], "id": old["id"], "food_id": "legacy:" + old["id"], "source_id": "legacy_sample",
        "name_en": old["name"], "raw_name": old["name"], "name": old["name"], "head": nr.head,
        "form": legacy_form(old["name"], old["category"]), "category": old["category"], "food_group": "", "state": "",
        "n": n, "estimated": [], "notes": ["not from the cited DB: hand-made sample food kept as is (no foodpipe equivalent within 15% kcal)"],
        "src": [[LEGACY_DB.get(s["db"], s["db"]), s["ref"]] for s in old.get("src", [])] or [["Eighty sample food", old["id"]]],
        "n_sources": 1, "n_members": 1, "tags": list(old.get("tags", [])), "aliases": [a.lower() for a in old.get("aliases", [])],
        "aliases_out": [a.lower() for a in old.get("aliases", [])][:5], "branded": False, "ext_reasons": [], "ultra": False,
        "tier": "everyday", "why": "legacy_sample_kept", "rank": 70, "score": 70.0, "hidden_reason": None,
        "n_board": sum(1 for k in ("vitA", "vitC", "vitD", "vitE", "vitK", "b1", "b2", "b3", "b5", "b6", "folate", "b12", "choline", "calcium",
                                   "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper", "manganese", "selenium", "iodine", "fiber")
                       if n.get(k) is not None),
        "servings": [dict(s) for s in old.get("servings", [])], "servings_from": "legacy", "gi": old.get("gi"),
    }
