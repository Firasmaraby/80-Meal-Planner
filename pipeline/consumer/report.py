"""CURATION_REPORT.md and the plan calorie check."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

from . import rank as R
from . import tiers as T
from .adapter import NUTRIENT_KEYS, BOARD_KEYS

EXAMPLE_QUERIES = [
    "apple", "banana", "chicken breast", "oats", "rice", "egg", "milk", "greek yogurt", "salmon", "spinach", "lentils",
    "chickpeas", "quinoa", "broccoli", "sweet potato", "avocado", "almonds", "peanut butter", "olive oil", "tofu",
    "black beans", "blueberries", "kiwi", "orange", "strawberries", "bread whole wheat", "pasta", "cheddar", "butter", "honey",
]


def raw_preferred_names(input_dir: str | Path) -> list[str]:
    """Names of the foodpipe-preferred, active, edible-portion rows in file order (what a naive list would show)."""
    w = pd.read_csv(Path(input_dir) / "foods_wide.csv", dtype=str, keep_default_na=False,
                    usecols=["name_en", "is_preferred", "basis", "status"])
    w = w[(w.is_preferred == "True") & (w.basis == "per 100 g edible portion") & (w.status == "active")]
    return list(w.name_en)


def plan_kcal(plans_old: list[dict], plans_new: list[dict], foods_old: dict[str, dict], foods_new: dict[str, dict]) -> list[dict]:
    rows = []
    for po, pn in zip(plans_old, plans_new):
        for do, dn in zip(po["days"], pn["days"]):
            def kcal(day: dict, foods: dict, key: str) -> tuple[float, int]:
                tot, missing = 0.0, 0
                for m in day["meals"]:
                    for ing in m["ingredients"]:
                        f = foods.get(ing["foodId"])
                        v = None if f is None else (f["n"] if key == "old" else f["n"]).get("kcal")
                        if v is None:
                            missing += 1
                        else:
                            tot += v * ing["grams"] / 100.0
                return tot, missing
            ko, mo = kcal(do, foods_old, "old")
            kn, mn = kcal(dn, foods_new, "new")
            lo, hi = po["band"]["min"], po["band"]["max"]
            rows.append({"plan": po["name"], "day": do["day"], "band": f"{lo}-{hi}", "kcal_old": round(ko), "kcal_new": round(kn),
                         "delta_pct": round(100 * (kn - ko) / ko, 1) if ko else None, "in_band_old": lo <= ko <= hi,
                         "in_band_new": lo <= kn <= hi, "missing_new": mn})
    return rows


def grade_plans(repo: Path, legacy_dir: Path) -> dict[str, list[dict[str, str]]] | None:
    """Run scripts/check-plans.mjs on the sample plans with the old foods and with the rebuilt library; keep the summary lines."""
    import subprocess
    out: dict[str, list[dict[str, str]]] = {}
    jobs = {"before": [str(legacy_dir / "plans.json"), str(legacy_dir / "foods.json"), str(legacy_dir / "swapGroups.json")], "after": []}
    for k, extra in jobs.items():
        try:
            r = subprocess.run(["node", str(repo / "scripts" / "check-plans.mjs"), *extra], capture_output=True, text=True, timeout=300, cwd=repo)
        except (OSError, subprocess.TimeoutExpired):
            return None
        plans: list[dict[str, str]] = []
        for ln in r.stdout.splitlines():
            if ln.startswith("== "):
                plans.append({"plan": ln[3:].split("  (")[0], "days": [], "micros": "", "low": ""})
            elif plans and re.match(r"^ D\d", ln):
                plans[-1]["days"].append(ln.split("|")[0].split()[:2] + ["OUT OF BAND" if "OUT OF BAND" in ln else "in band"])
            elif plans and ln.startswith("micros >=80%"):
                plans[-1]["micros"] = ln.split("|")[0].replace("micros >=80% per day (of 23):", "").strip()
            elif plans and ln.startswith("below 80% on average"):
                plans[-1]["low"] = ln.split(":", 1)[1].strip()
        out[k] = plans
    return out


def md_table(headers: list[str], rows: list[list[Any]]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(x).replace("|", "\\|").replace("\n", " ") for x in r) + " |")
    return "\n".join(out) + "\n"


def _ex(r: dict[str, Any]) -> str:
    return f"{r['name_en'][:70]} ({r['source_id']})"


def build_report(*, records: list[dict[str, Any]], lex, astats: dict, excluded: list[dict], sizes: dict[str, int],
                 search_res: dict | None, foods_for_search: list[dict], legacy_rows: list[dict], plan_check: list[dict],
                 waived: set[str], raw_wide_names: list[str], target: int, prep: dict | None = None,
                 collapsed: int = 0, unmatched: list[str] | None = None, plan_grades: dict | None = None) -> str:
    from search_check import FoodSearch
    L: list[str] = []
    A = L.append
    tiers = Counter(r["tier"] for r in records)
    live = [r for r in records if r["tier"] != "hidden"]
    ev = [r for r in records if r["tier"] == "everyday"]
    A("# Eighty food library - curation report\n")
    A("Generated by `python3 pipeline/consumer/build.py`. Input: foodpipe-v1.0 (see its NOTICE.txt / CITATIONS.md; every food keeps "
      "its source citation in `src`). Deterministic: the same input and config give byte-identical output.\n")
    A("## 1. Counts by tier\n")
    A(md_table(["measure", "count"], [
        ["foods_wide rows", astats["wide_rows"]],
        ["canonical clusters", astats["clusters"]],
        ["clusters with an active edible-portion member (display records)", astats["records"]],
        ["clusters with no such member (never shown, section 2)", len(excluded)],
        ["**everyday**", tiers["everyday"]],
        ["**extended**", tiers["extended"]],
        ["**hidden** (of the display records)", tiers["hidden"]],
        ["check: everyday + extended + hidden", tiers["everyday"] + tiers["extended"] + tiers["hidden"]],
    ]))
    A("\n## 2. Hidden, by reason (5 examples each)\n")
    hid = defaultdict(list)
    for r in records:
        if r["tier"] == "hidden":
            hid[r["hidden_reason"]].append(r)
    rows = []
    for reason, lst in sorted(hid.items(), key=lambda kv: -len(kv[1])):
        ex = sorted(lst, key=lambda r: r["canonical_id"])
        if reason == "duplicate_name":
            exs = "; ".join(f"{r['name']} ({r['source_id']}) = dup of {r['duplicate_of']}"[:90] for r in ex[:5])
        else:
            exs = "; ".join(_ex(r) for r in ex[:5])
        rows.append([reason, len(lst), exs])
    by_why = Counter(e["reason"] for e in excluded)
    for why, n in by_why.items():
        exs = "; ".join(f"{e['name'][:60]} ({e['source']}; basis: {e['basis']})" for e in [x for x in excluded if x["reason"] == why][:5])
        rows.append([f"{why} (cluster-level, before any other rule)", n, exs])
    A(md_table(["reason", "count", "examples"], rows))
    if waived:
        A(f"\n_Supplement rule waived for {len(waived)} food(s) that a bundled sample plan uses (whey protein powder): "
          + ", ".join(sorted(r["name"] for r in records if r["canonical_id"] in waived)) + "._\n")
    A("\n## 3. Extended - why it is not everyday\n")
    why = Counter()
    for r in records:
        if r["tier"] == "extended":
            for x in (r.get("ext_all") or ["below_everyday_cut"]):
                why[x] += 1
    A(md_table(["reason (a food can have several)", "foods"], [[k, v] for k, v in why.most_common()]))
    A("\n## 4. Everyday, by category\n")
    cat = Counter(r["category"] for r in ev)
    avg = defaultdict(list)
    for r in ev:
        avg[r["category"]].append(r["rank"])
    A(md_table(["category", "everyday foods", "avg rank"], [[c, n, round(sum(avg[c]) / len(avg[c]), 1)] for c, n in cat.most_common()]))
    A(f"\nTotal everyday: **{len(ev)}** (target about {target}). How they got in: "
      + ", ".join(f"{k} {v}" for k, v in Counter(r['why'] for r in ev).most_common()) + ".\n")
    A("Everyday by display-record source (region priority Canada, then US): "
      + ", ".join(f"{k} {v}" for k, v in Counter(r['source_id'] for r in ev).most_common()) + ".\n")
    A("All non-hidden foods by display-record source: "
      + ", ".join(f"{k} {v}" for k, v in Counter(r['source_id'] for r in live).most_common()) + ".\n")

    # head coverage
    heads_present = defaultdict(set)
    for r in live:
        heads_present[r["head"]].add(r["form"])
    ev_heads = defaultdict(set)
    for r in ev:
        ev_heads[r["head"]].add(r["form"])
    entry_heads = list(dict.fromkeys(e.head for e in lex.entries))
    missing = [h for h in entry_heads if h not in heads_present]
    in_ev = [h for h in entry_heads if h in ev_heads]
    A("\n## 5. The curated heads list (`config/everyday_heads.txt`)\n")
    A(f"{len(entry_heads)} distinct heads ({len(lex.entries)} head|form lines). {len(entry_heads) - len(missing)} match at least one "
      f"food in the source data; {len(in_ev)} have an everyday food. {len(missing)} heads have **no matching food** in foodpipe-v1.0 "
      "(the database is North American and European centred, so many Indian, Southeast Asian and Latin American dishes and "
      "branded condiments are simply not in it). They stay in the file so a future source picks them up.\n")
    A("<details><summary>heads without a match</summary>\n\n" + ", ".join(missing) + "\n\n</details>\n")

    # searches
    A("\n## 6. Search\n")
    if search_res:
        A(f"Real-query acceptance ({search_res['n']} everyday queries in `config/search_queries_real.json`, run through the Python port of the app "
          f"search with head grouping, exact-head priority and everyday-first): **top-1 {search_res['top1']:.1%}** (target 90%), "
          f"**top-3 {search_res['top3']:.1%}** (target 97%).\n")
        if search_res["fail_top1"]:
            A("\nTop-1 failures:\n")
            A(md_table(["query", "expected head/form", "got (top 3 groups)"],
                       [[f["q"], f["expected"], " ; ".join(f["top"])] for f in search_res["fail_top1"]]))
        if search_res["fail_top3"]:
            A("\nTop-3 failures:\n")
            A(md_table(["query", "expected head/form", "got (top 3 groups)"],
                       [[f["q"], f["expected"], " ; ".join(f["top"])] for f in search_res["fail_top3"]]))
    A("\n### 30 example searches, before -> after\n")
    A("_before_ = naive case-insensitive contains-search over the raw foodpipe-preferred names, first three hits in file order "
      "(what a plain food list would show). _after_ = the grouped search (best member of each of the first three heads).\n")
    fs = FoodSearch(foods_for_search)
    low = [n.lower() for n in raw_wide_names]
    rows = []
    for q in EXAMPLE_QUERIES:
        before = [raw_wide_names[i] for i, n in enumerate(low) if q in n][:3]
        after = [h["food"]["name"] for h in fs.search_grouped(q, 3)]
        nb = sum(1 for n in low if q in n)
        rows.append([q, f"{nb} hits: " + " ; ".join(b[:55] for b in before), " ; ".join(after)])
    A(md_table(["query", "before", "after"], rows))

    A("\n## 7. File sizes\n")
    A(md_table(["file", "bytes", "MB"], [[k, f"{v:,}", f"{v / 1e6:.2f}"] for k, v in sizes.items()]))

    # nutrient coverage
    A("\n## 8. Nutrient coverage (share of foods with a value)\n")
    cov_rows = []
    for k in NUTRIENT_KEYS:
        e = sum(1 for r in ev if r["n"].get(k) is not None) / max(1, len(ev))
        x = sum(1 for r in live if r["n"].get(k) is not None) / max(1, len(live))
        est = sum(1 for r in live if k in r["estimated"]) / max(1, len(live))
        cov_rows.append([k, f"{e:.0%}", f"{x:.0%}", f"{est:.0%}"])
    A(md_table(["nutrient", "everyday", "all non-hidden", "of those: estimated/borrowed"], cov_rows))
    notes = Counter()
    for r in live:
        for n in r["notes"]:
            notes[n] += 1
    A("\nMapping rules used (non-hidden foods): " + "; ".join(f"{k}: {v}" for k, v in notes.most_common()) + ".\n")

    odd = [r for r in live if all(r["n"].get(k) is not None for k in ("fat", "satFat", "mufa", "pufa"))
           and r["n"]["satFat"] + r["n"]["mufa"] + r["n"]["pufa"] > r["n"]["fat"] + 1]
    A(f"\n## 8b. Data checks (not changed, only reported)\n\n{len(odd)} non-hidden foods have saturated + mono + poly fat above total fat by more than 1 g "
      "(source rounding or fatty acids borrowed from another record). Examples: " + "; ".join(f"{r['name']} ({r['source_id']})" for r in odd[:5]) + ".\n")

    A("\n## 9. Legacy sample foods -> new ids\n")
    A(md_table(["old id", "new id", "new name", "tier", "kcal old", "kcal new", "diff %", "within 15%"],
               [[r["old_id"], r.get("new_id", ""), r.get("new_name", ""), r.get("tier", ""), r.get("kcal_old", ""), r.get("kcal_new", ""),
                 r.get("kcal_diff_pct", ""), r.get("within_15pct", "")] for r in legacy_rows]))
    kept = [r for r in legacy_rows if r.get("within_15pct") == "kept"]
    if kept:
        A("\n**Kept as hand-made sample data, not from the cited DB** (no foodpipe record within 15% kcal; their citation strings are normalised to "
          "foodpipe's names): " + ", ".join(f"`{r['old_id']}`" for r in kept) + ".\n")
    bad = [r for r in legacy_rows if r.get("within_15pct") not in (True, "kept")]
    A(f"\n{len(legacy_rows) - len(bad)} of {len(legacy_rows)} sample foods map within 15% kcal; {len(bad)} do not (listed above with `False`/empty).\n")

    A("\n## 10. Sample plans: kcal per day, old foods vs new foods (grams unchanged)\n")
    A(md_table(["plan", "day", "band", "kcal old", "kcal new", "delta %", "in band (new)", "ingredients without kcal"],
               [[r["plan"], r["day"], r["band"], r["kcal_old"], r["kcal_new"], r["delta_pct"],
                 "yes" if r["in_band_new"] else "**NO - leaves the band**", r["missing_new"]] for r in plan_check]))
    out_new = [r for r in plan_check if not r["in_band_new"]]
    out_old = [r for r in plan_check if not r["in_band_old"]]
    A(f"\nDays outside their calorie band: before {len(out_old)}, after {len(out_new)}.\n")
    if plan_grades:
        A("\n### Plan re-grade (`scripts/check-plans.mjs`): micronutrient gaps per plan, before vs after\n")
        rows = []
        for b, a in zip(plan_grades["before"], plan_grades["after"]):
            rows.append([b["plan"], b["micros"], a["micros"], b["low"], a["low"]])
        A(md_table(["plan", "micros >=80% per day (of 23), before", "after", "nutrients below 80% on average, before", "after"], rows))
        A("\nNutrient values now come from the display record (Canada first), so a few sample foods changed on purpose "
          "(for example vitamin D in Atlantic mackerel and farmed salmon is lower in CNF than in the hand-made sample data).\n")

    A("\n## 11. Decisions and known limits\n")
    for t in DECISIONS:
        A(f"- {t}")
    A("")
    return "\n".join(L)


DECISIONS = [
    "**One food per cluster**: the display record is the first eligible (active, `per 100 g edible portion`) member in the order cnf, usda_fdc_sr_legacy, "
    "usda_fdc_foundation, foodpipe-preferred, any other. Exception: a candidate with no energy value is skipped when a later member has one "
    "(otherwise the food would be hidden as `no_kcal`). Every other active member is cited in `src` (db = source_citation, ref = source food id); "
    "donors of borrowed values are added with ref `gap-fill`.",
    "**Rank and tier**: score 0-100 (see `rank.py`: common-list match + position, simple name, variety penalty, good form for the category, multi-source, "
    "source priority, category prior, minus branded / fast food / heritage / organ-game / ultra-processed / long-name / sparse penalties). "
    "The exported `rank` maps the score into the tier band: everyday = 50..100, extended = 0..49, so `rank >= 50` in the app means everyday.",
    "**Everyday** = per common head: the preferred-form record, the best record of every other form scoring >= 38, and one materially different variant "
    "per (head, form) (kcal differs by 15% or more, within 10 score points); at most 8 per head. The rest of the target is filled with the top-scored "
    "records. Branded, fast-food, heritage, organ/game and sparse (< 6 of 24 board nutrients, not on the list) records are never everyday.",
    "**Duplicates by clean display name** inside a category: the higher-scored record stays, the other is hidden as `duplicate_name` (its citation is not merged).",
    "**la (omega-6)** is estimated as pufa - (ala+epa+dha), clamped at 0, only when pufa exists; every such food lists `la` in `estimated`.",
    "**Carbs** follow the owner rule (by difference; else available + fiber; else monosaccharide / 1.05 + fiber); the rule used is in `food_notes.csv`. "
    "Folate is DFE, else computed from total and folic acid, else total folate (marked estimated). vitA is RAE only.",
    "**Estimated**: nutrients in foodpipe's `estimated_nutrients` or `filled_nutrients` are kept and listed in the food's `estimated` array.",
    "**Servings**: the source has no portion data. Servings come from the sample foods (hand-checked), then `everyday_heads.txt` (USDA household weights "
    "for about 250 heads), then `servings_defaults.json` category rules. Foods with none get no serving (the app falls back to grams).",
    "**GI**: the 45 sample foods that had a glycemic index keep it (13th column of the bundle row); nothing else has GI data.",
    "Names are rule-based; expect odd names in the extended tier (CoFID / CIQUAL / MEXT phrasing). `everyday_review.csv` is the file to review.",
    "The bundle adds a `dbs` citation table (rows reference it by index) to keep the extended bundle small, and an optional trailing GI column.",
    "Hidden `non_food` and `supplement` rules are regexes on the raw and clean names; see `tiers.py`.",
]
