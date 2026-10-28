#!/usr/bin/env python3
"""Eighty food-data pipeline CLI.

  python3 pipeline/run.py --inspect --input foods.xlsx              # look at the workbook, write mappings
  python3 pipeline/run.py --input foods.xlsx --out pipeline/out     # full run
  python3 pipeline/run.py --input foods.xlsx --sheets "SR Legacy"   # only sources reading these sheets / keys

See pipeline/README.md.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import pandas as pd  # noqa: E402

from stages import curate as curate_stage  # noqa: E402
from stages import dedupe as dedupe_stage  # noqa: E402
from stages import export as export_stage  # noqa: E402
from stages import ingest as ingest_stage  # noqa: E402
from stages import names as names_stage  # noqa: E402
from stages import normalize as normalize_stage  # noqa: E402
from stages import servings as servings_stage  # noqa: E402
from stages.report import Log  # noqa: E402

DEFAULT_CONFIG = HERE / "config" / "sources.json"


def load_config(path: str | Path | None = None) -> dict:
    p = Path(path or DEFAULT_CONFIG).resolve()
    cfg = json.loads(p.read_text(encoding="utf-8"))
    cfg["_dir"] = str(p.parent)
    cfg.setdefault("settings", {})
    return cfg


def _cfg_path(cfg: dict, name: str | None, default: str) -> Path:
    return Path(cfg["_dir"]) / (name or default)


def run_pipeline(input_path: str | None, cfg: dict, out_dir: str, only: list[str] | None = None,
                 dump_stages: bool = False, frames: dict | None = None, verbose: bool = True) -> dict:
    """Run every stage. `frames` lets tests inject parsed sheets instead of reading an xlsx."""
    say = print if verbose else (lambda *a, **k: None)
    log = Log()
    st = cfg.get("settings", {})
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    say("[1/7] ingest")
    if frames is None:
        frames = ingest_stage.read_workbook(input_path, cfg, only, log)
    ing = ingest_stage.ingest_frames(frames, cfg, log, only)
    sources = ingest_stage.select_sources(cfg, only)
    src_db = {s["key"]: s["db"] for s in sources}
    say(f"      {len(ing.items)} foods, {len(ing.long)} nutrient values from {len(sources)} sources "
        f"({time.time() - t0:.1f}s)")

    if ing.items.empty:
        say("      nothing ingested - see warnings (sheet names / column names in config/sources.json?)")
        w = log.frame()
        w = w[w["kind"] == "warning"]
        (out / "report.md").write_text("# Eighty food pipeline report\n\nNothing was ingested.\n\n## Warnings\n\n"
                                       + export_stage._md_table(w[["stage", "source", "reason", "detail"]]), encoding="utf-8")
        return {"foods": [], "log": log, "merges": pd.DataFrame(), "decisions": pd.DataFrame(),
                "dropped_values": pd.DataFrame(), "ingest": ing}

    say("[2/7] normalize")
    long_norm, dropped_vals = normalize_stage.normalize(
        ing.long, log, g_tolerance=st.get("normalize", {}).get("g_tolerance", normalize_stage.G_TOLERANCE))
    say(f"      {len(long_norm)} values kept, {len(dropped_vals)} dropped")

    say("[3/7] names")
    rules = names_stage.load_rules(_cfg_path(cfg, st.get("name_rules"), "name_rules.json"))
    overrides = names_stage.load_overrides(_cfg_path(cfg, st.get("name_overrides"), "name_overrides.jsonl"))
    named = names_stage.clean_names(ing.items, rules, overrides=overrides, log=log)
    wide = normalize_stage.to_wide(named, long_norm)

    say("[4/7] dedupe")
    merged, merges = dedupe_stage.dedupe(wide, st.get("dedupe", {}), cfg.get("source_priority", []), src_db, rules, log)
    say(f"      {len(wide)} records -> {len(merged)} foods ({len(merges)} merged groups)")

    say("[5/7] curate")
    ccfg = json.loads(_cfg_path(cfg, st.get("curate_rules"), "curate_rules.json").read_text(encoding="utf-8"))
    common = curate_stage.load_common(_cfg_path(cfg, st.get("common_foods"), "common_foods.txt"))
    curated, decisions = curate_stage.curate(merged, ccfg, common, rules, log)
    say(f"      {len(curated)} kept ({int(curated['rare'].sum())} rare), {int((decisions['action'] == 'drop').sum())} dropped")

    say("[6/7] servings")
    sdef_path = _cfg_path(cfg, st.get("servings_defaults"), "servings_defaults.json")
    sdef = json.loads(sdef_path.read_text(encoding="utf-8")) if sdef_path.exists() else {}
    final = servings_stage.attach_servings(curated, ing.portions, sdef, st.get("servings", {}).get("max_per_food", 6), log)

    say("[7/7] export")
    foods = export_stage.write_outputs(str(out), final, log, merges, decisions, dropped_vals, sources,
                                       rules.review_threshold)
    if dump_stages:
        d = out / "stages"
        d.mkdir(exist_ok=True)
        ing.long.to_csv(d / "01_ingest_long.csv.gz", index=False)
        long_norm.to_csv(d / "02_normalized_long.csv.gz", index=False)
        wide.drop(columns=["alt_names"], errors="ignore").to_csv(d / "03_names_wide.csv.gz", index=False)
        merged.to_csv(d / "04_merged.csv.gz", index=False)
    say(f"done: {len(foods)} foods -> {out / 'foods.json'} ({time.time() - t0:.1f}s)")
    return {"foods": foods, "log": log, "merges": merges, "decisions": decisions, "dropped_values": dropped_vals,
            "ingest": ing}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Eighty food-data cleaning pipeline")
    ap.add_argument("--input", required=True, help="path to the .xlsx workbook")
    ap.add_argument("--sheets", nargs="*", help="only sources whose sheet name or key is listed")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG), help="sources config (json)")
    ap.add_argument("--out", default=str(HERE / "out"), help="output directory")
    ap.add_argument("--inspect", action="store_true", help="print sheet names, row counts, first rows, columns; no processing")
    ap.add_argument("--no-count", action="store_true", help="with --inspect: skip the (slow) full row count")
    ap.add_argument("--dump-stages", action="store_true", help="also write intermediate tables to out/stages")
    ap.add_argument("--check-search", nargs="?", const="", metavar="QUERIES_JSON",
                    help="after the run, execute search_check.py (default queries: config/search_queries.json)")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    if args.inspect:
        from stages.inspect_wb import inspect_workbook
        inspect_workbook(args.input, cfg, count_rows=not args.no_count)
        return 0

    res = run_pipeline(args.input, cfg, args.out, only=args.sheets, dump_stages=args.dump_stages)
    warnings = res["log"].frame()
    warnings = warnings[warnings["kind"] == "warning"][["stage", "source", "reason", "detail"]]
    if not warnings.empty:
        print("\nWARNINGS (check config/sources.json mappings):")
        print(warnings.to_string(index=False, max_colwidth=100))
    if not res["foods"]:
        return 2
    if args.check_search is not None:
        import search_check
        q = args.check_search or str(HERE / "config" / "search_queries.json")
        rate = search_check.main(["--foods", str(Path(args.out) / "foods.json"), "--queries", q])
        return 0 if rate is not None else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
