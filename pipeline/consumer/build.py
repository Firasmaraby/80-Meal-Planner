#!/usr/bin/env python3
"""Build the app's curated food library from foodpipe-v1.0.

  python3 pipeline/consumer/build.py --input pipeline/input/foodpipe-v1.0

Writes (all deterministic):
  src/data/foods.everyday.json, src/data/foods.extended.json   compact app bundles
  src/data/legacyIdMap.json, src/data/plans.json, src/data/swapGroups.json   (old sample ids -> new ids)
  pipeline/out/foods_seed.csv, everyday_review.csv, CURATION_REPORT.md, curation_log.csv, food_notes.csv, legacy_id_map.csv
"""
from __future__ import annotations

import argparse
import copy
import csv
import json
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
REPO = PIPE.parent
if str(PIPE) not in sys.path:
    sys.path.insert(0, str(PIPE))

from consumer import adapter, curate as C, export_app as X, legacy as L, names_en as N  # noqa: E402
from consumer import report as REP  # noqa: E402
import search_check as SC  # noqa: E402

LEGACY_DIR = PIPE / "config" / "legacy"


def _load_json(p: Path) -> Any:
    return json.loads(p.read_text(encoding="utf-8"))


def reset(records: list[dict[str, Any]]) -> None:
    for r in records:
        for k in ("hidden_reason", "waived", "duplicate_of", "tier", "why", "rank", "score", "ext_all"):
            r.pop(k, None)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default=str(PIPE / "input" / "foodpipe-v1.0"))
    ap.add_argument("--out", default=str(PIPE / "out"))
    ap.add_argument("--app-data", default=str(REPO / "src" / "data"), help="where the app bundles are written")
    ap.add_argument("--heads", default=str(PIPE / "config" / "everyday_heads.txt"))
    ap.add_argument("--target", type=int, default=3000, help="about how many everyday foods")
    ap.add_argument("--no-app-write", action="store_true", help="do not touch src/data (report/seed only)")
    args = ap.parse_args(argv)
    t0 = time.time()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    app = Path(args.app_data)

    print("reading foodpipe ...", flush=True)
    records, astats = adapter.load_records(args.input)
    lex = N.Lexicon(N.load_heads(args.heads))
    print(f"  {astats['records']} display records from {astats['clusters']} clusters "
          f"({astats['clusters_without_edible_member']} clusters have no edible-portion member)")
    excluded = adapter.excluded_clusters(args.input)

    print("names / heads / forms ...", flush=True)
    for r in records:
        C.enrich(r, lex)

    # legacy sample foods -------------------------------------------------------------------------------
    legacy_foods = _load_json(LEGACY_DIR / "foods.json")
    # pass 1: hidden reasons + scores, so the legacy matcher can see which records are usable
    C.curate(records, lex, target=args.target)
    pool = [r for r in records if r["hidden_reason"] in (None, "supplement")]
    for r in pool:
        r["hidden"] = bool(r["hidden_reason"])
    legacy_match: dict[str, tuple[dict[str, Any] | None, dict[str, Any]]] = {}
    claimed: set[str] = set()
    for old in legacy_foods:            # one new food per old id where possible (two old ids may only share when nothing else fits)
        m, info = L.best_match(old, pool, lex, exclude=claimed)
        if m is None:
            m, info = L.best_match(old, pool, lex)
        legacy_match[old["id"]] = (m, info)
        if m is not None:
            claimed.add(m["canonical_id"])
    pinned = {m["canonical_id"] for m, _ in legacy_match.values() if m is not None}
    waive = {m["canonical_id"] for m, _ in legacy_match.values() if m is not None and m["hidden_reason"] == "supplement"}
    # pass 2: real tiers with the legacy targets pinned to everyday
    reset(records)
    C.curate(records, lex, pinned=pinned, unhide_ok=waive, target=args.target)
    for r in records:
        r.pop("hidden", None)

    live = [r for r in records if r["tier"] != "hidden"]
    X.make_ids(live)
    kept_legacy = [L.legacy_record(old, lex) for old in legacy_foods if legacy_match[old["id"]][0] is None]
    assert not ({r["id"] for r in live} & {r["id"] for r in kept_legacy}), "legacy id collides with a generated id"
    rule_cfg = _load_json(PIPE / "config" / "servings_defaults.json")
    hs = X.head_servings(lex.entries)
    legacy_by_new: dict[str, dict[str, Any]] = {}
    legacy_map: dict[str, str] = {}
    legacy_rows = []
    by_cid = {r["canonical_id"]: r for r in records}
    for old in legacy_foods:
        m, info = legacy_match[old["id"]]
        if m is None:
            legacy_rows.append({"old_id": old["id"], "old_name": old["name"], "new_id": old["id"], "new_name": old["name"] + " (kept as is)",
                                "tier": "everyday", "within_15pct": "kept", **{k: v for k, v in info.items() if k != "within_15pct"}})
            continue
        m = by_cid[m["canonical_id"]]
        legacy_map[old["id"]] = m["id"]
        legacy_by_new.setdefault(m["id"], old)
        legacy_rows.append({"old_id": old["id"], "old_name": old["name"], "new_id": m["id"], "new_name": m["name"],
                            "tier": m["tier"], **info})
    for r in live:
        lg = legacy_by_new.get(r["id"])
        r["servings"], r["servings_from"] = X.pick_servings(r, hs, rule_cfg, lg)
        r["gi"] = lg.get("gi") if lg else None
        r["aliases_out"] = [a for a in r["aliases"] if a != r["name"].lower()]
        if lg:
            for a in lg.get("aliases", []):
                if a.lower() not in r["aliases_out"] and a.lower() != r["head"] and len(r["aliases_out"]) < 5:
                    r["aliases_out"].append(a.lower())
        r["aliases_out"] = r["aliases_out"][:5]

    live += kept_legacy
    everyday = [r for r in live if r["tier"] == "everyday"]
    extended = [r for r in live if r["tier"] == "extended"]
    print(f"tiers: everyday {len(everyday)}, extended {len(extended)}, hidden {len(records) - len(live)}")

    print("writing bundles ...", flush=True)
    be, bx = X.build_bundle(everyday), X.build_bundle(extended)
    # bundles share one db table so a food can move between tiers without re-indexing
    errs = X.validate_bundle(be) + X.validate_bundle(bx)
    if errs:
        raise SystemExit("bundle validation failed:\n" + "\n".join(errs[:20]))
    gi_by_id = {r["id"]: r["gi"] for r in live if r.get("gi") is not None}
    for b in (be, bx):
        for row in b["foods"]:
            if row[0] in gi_by_id:
                row.append(gi_by_id[row[0]])
    sizes = {}
    if not args.no_app_write:
        app.mkdir(parents=True, exist_ok=True)
        sizes["foods.everyday.json"] = X.write_bundle(app / "foods.everyday.json", be)
        sizes["foods.extended.json"] = X.write_bundle(app / "foods.extended.json", bx)
        (app / "legacyIdMap.json").write_text(json.dumps(legacy_map, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    else:
        sizes["foods.everyday.json"] = len(json.dumps(be, ensure_ascii=False, separators=(",", ":")).encode())
        sizes["foods.extended.json"] = len(json.dumps(bx, ensure_ascii=False, separators=(",", ":")).encode())

    # plans + swap groups (always from the pristine copies, so re-runs are idempotent) --------------------
    new_by_id = {r["id"]: r for r in live}
    records_all = records + kept_legacy
    plans_old = _load_json(LEGACY_DIR / "plans.json")
    groups_old = _load_json(LEGACY_DIR / "swapGroups.json")
    plans_new = copy.deepcopy(plans_old)
    for p in plans_new:
        for d in p["days"]:
            for m in d["meals"]:
                for ing in m["ingredients"]:
                    ing["foodId"] = legacy_map.get(ing["foodId"], ing["foodId"])
    # rewrite the text of the pristine files (not a re-serialisation) so only the ids change in the diff
    plans_text = (LEGACY_DIR / "plans.json").read_text(encoding="utf-8")
    plans_text = re.sub(r'("foodId":\s*")([^"]+)(")', lambda m: m.group(1) + legacy_map.get(m.group(2), m.group(2)) + m.group(3), plans_text)
    groups_text = (LEGACY_DIR / "swapGroups.json").read_text(encoding="utf-8")
    groups_text = re.sub(r'("foodIds":\s*\[)([^\]]*)(\])', lambda m: m.group(1) + re.sub(
        r'"([^"]+)"', lambda t: '"' + legacy_map.get(t.group(1), t.group(1)) + '"', m.group(2)) + m.group(3), groups_text)
    groups_text = re.sub(r'("foodIds":\s*\[)([^\]]*)(\])', lambda m: m.group(1) + ", ".join(dict.fromkeys(
        x.strip() for x in m.group(2).split(","))) + m.group(3), groups_text)
    assert json.loads(plans_text) == plans_new
    plan_check = REP.plan_kcal(plans_old, plans_new, {f["id"]: f for f in legacy_foods}, new_by_id)
    if not args.no_app_write:
        (app / "plans.json").write_text(plans_text, encoding="utf-8")
        (app / "swapGroups.json").write_text(groups_text, encoding="utf-8")

    # seed / review / logs ---------------------------------------------------------------------------------
    print("writing seed + review files ...", flush=True)
    X.write_seed(out / "foods_seed.csv", live)
    X.write_review(out / "everyday_review.csv", everyday)
    X.write_notes(out / "food_notes.csv", live)
    for r in records:
        r.setdefault("id", "")
    X.write_curation_log(out / "curation_log.csv", records_all)
    with (out / "legacy_id_map.csv").open("w", newline="", encoding="utf-8") as f:
        cols = ["old_id", "old_name", "new_id", "new_name", "tier", "kcal_old", "kcal_new", "kcal_diff_pct", "within_15pct", "score"]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(legacy_rows)

    # search check -----------------------------------------------------------------------------------------
    foods_for_search = []
    for r in live:
        foods_for_search.append({"id": r["id"], "name": r["name"], "head": r["head"], "form": r["form"], "rank": r["rank"],
                                 "aliases": r["aliases_out"], "tier": r["tier"]})
    qpath = PIPE / "config" / "search_queries_real.json"
    queries = _load_json(qpath) if qpath.exists() else []
    search_res = SC.run_real_checks(foods_for_search, queries, 3) if queries else None
    if search_res:
        print(f"real search: top-1 {search_res['top1']:.1%}, top-3 {search_res['top3']:.1%} ({search_res['n']} queries)")

    print("writing CURATION_REPORT.md ...", flush=True)
    md = REP.build_report(records=records, lex=lex, astats=astats, excluded=excluded, sizes=sizes, search_res=search_res,
                          foods_for_search=foods_for_search, legacy_rows=legacy_rows, plan_check=plan_check,
                          waived=waive, raw_wide_names=REP.raw_preferred_names(args.input), target=args.target)
    (out / "CURATION_REPORT.md").write_text(md, encoding="utf-8")
    print(f"done in {time.time() - t0:.0f}s; sizes: " + ", ".join(f"{k} {v / 1e6:.2f} MB" for k, v in sizes.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
