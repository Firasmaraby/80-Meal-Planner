"""Stage 7 - export: foods.json (Food[]), foods_seed.csv (Supabase `foods`), report.md + report.csv, citations.json.

`validate_foods` is the schema gate: it checks every object against the TypeScript `Food` interface
(src/engine/types.ts) - exact key set, valid NutrientKeys, categories, tags, unique ids, non-empty `src`, no NaN/negatives.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any

import pandas as pd

from .names import build_review, review_jsonl
from .report import Log
from .schema import CATEGORIES, FOOD_KEYS, FOOD_KEYS_REQUIRED, NUTRIENT_KEYS, TAGS
from .textutil import short_hash, slugify

SEED_COLUMNS = ["id", "name", "category", "aliases", "tags", "gi", "servings", "nutrients", "sources", "rare", "rank"]


def make_ids(names: list[str], primary_uids: list[str]) -> list[str]:
    """slug(name) + 6-hex hash of the primary source uid. Stable for identical input; unique by construction."""
    ids, used = [], set()
    for name, uid in zip(names, primary_uids):
        base = f"{slugify(name)}-{short_hash(uid)}"
        cand, n = base, 2
        while cand in used:  # a hash collision on the same slug is astronomically unlikely, but never emit duplicates
            cand = f"{base}-{n}"
            n += 1
        used.add(cand)
        ids.append(cand)
    return ids


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def build_foods(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Final DataFrame -> list of Food dicts (sorted by id). Needs name, category, aliases, tags, servings, src, rare,
    rank, food_id + nutrient columns."""
    foods: list[dict[str, Any]] = []
    for r in df.to_dict("records"):
        n = {}
        for k in NUTRIENT_KEYS:
            v = _num(r.get(k))
            if v is not None:
                n[k] = round(v, 3)
        f: dict[str, Any] = {"id": r["food_id"], "name": r["name"], "category": r["category"]}
        al = [a for a in (r.get("aliases") or []) if a and a.lower() != str(r["name"]).lower()]
        if al:
            f["aliases"] = list(dict.fromkeys(al))
        tg = [t for t in (r.get("tags") or []) if t in TAGS]
        if tg:
            f["tags"] = tg
        f["gi"] = None
        sv = r.get("servings") or []
        if sv:
            f["servings"] = [{"label": s["label"], "g": s["g"]} for s in sv]
        f["n"] = n
        f["src"] = [{"db": s["db"], "ref": s["ref"]} for s in r["src"]]
        f["rare"] = bool(r.get("rare", False))
        f["rank"] = int(r.get("rank", 0))
        foods.append(f)
    foods.sort(key=lambda x: x["id"])
    return foods


def validate_foods(foods: list[dict[str, Any]]) -> list[str]:
    """Return a list of schema violations (empty list = valid)."""
    errs: list[str] = []
    seen: set[str] = set()
    if not isinstance(foods, list):
        return ["root is not an array"]
    for i, f in enumerate(foods):
        where = f"[{i}] {f.get('id', '?') if isinstance(f, dict) else '?'}"
        if not isinstance(f, dict):
            errs.append(f"{where}: not an object")
            continue
        extra = set(f) - FOOD_KEYS
        missing = FOOD_KEYS_REQUIRED - set(f)
        if extra:
            errs.append(f"{where}: unknown keys {sorted(extra)}")
        if missing:
            errs.append(f"{where}: missing keys {sorted(missing)}")
        fid = f.get("id")
        if not isinstance(fid, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", fid or ""):
            errs.append(f"{where}: id must be a slug")
        elif fid in seen:
            errs.append(f"{where}: duplicate id")
        else:
            seen.add(fid)
        if not isinstance(f.get("name"), str) or not f.get("name", "").strip():
            errs.append(f"{where}: empty name")
        if f.get("category") not in CATEGORIES:
            errs.append(f"{where}: bad category {f.get('category')!r}")
        if "aliases" in f and not (isinstance(f["aliases"], list) and all(isinstance(a, str) and a for a in f["aliases"])):
            errs.append(f"{where}: aliases must be a list of non-empty strings")
        if "tags" in f and not (isinstance(f["tags"], list) and all(t in TAGS for t in f["tags"])):
            errs.append(f"{where}: bad tags {f.get('tags')}")
        if "gi" in f and f["gi"] is not None and not (isinstance(f["gi"], (int, float)) and 0 <= f["gi"] <= 200):
            errs.append(f"{where}: bad gi")
        if "servings" in f:
            sv = f["servings"]
            if not isinstance(sv, list) or not all(
                    isinstance(s, dict) and set(s) == {"label", "g"} and isinstance(s["label"], str) and s["label"]
                    and isinstance(s["g"], (int, float)) and s["g"] > 0 for s in sv):
                errs.append(f"{where}: bad servings")
        n = f.get("n")
        if not isinstance(n, dict):
            errs.append(f"{where}: n must be an object")
        else:
            for k, v in n.items():
                if k not in NUTRIENT_KEYS:
                    errs.append(f"{where}: invalid nutrient key {k!r}")
                elif v is not None and (not isinstance(v, (int, float)) or isinstance(v, bool) or math.isnan(v)
                                        or math.isinf(v) or v < 0):
                    errs.append(f"{where}: bad value for {k}: {v!r}")
        src = f.get("src")
        if not isinstance(src, list) or not src:
            errs.append(f"{where}: src must be a non-empty array")
        else:
            for s in src:
                if not (isinstance(s, dict) and set(s) == {"db", "ref"} and isinstance(s["db"], str) and s["db"]
                        and isinstance(s["ref"], str) and s["ref"]):
                    errs.append(f"{where}: bad src entry {s!r}")
        if "rare" in f and not isinstance(f["rare"], bool):
            errs.append(f"{where}: rare must be boolean")
        if "rank" in f and not (isinstance(f["rank"], (int, float)) and not isinstance(f["rank"], bool) and 0 <= f["rank"] <= 100):
            errs.append(f"{where}: rank must be 0..100")
    return errs


def pg_array(items: list[str] | None) -> str:
    """Postgres array literal: {"a","b"} with backslash/quote escaping; {} when empty."""
    if not items:
        return "{}"
    esc = [str(x).replace("\\", "\\\\").replace('"', '\\"') for x in items]
    return "{" + ",".join(f'"{e}"' for e in esc) + "}"


def seed_frame(foods: list[dict[str, Any]]) -> pd.DataFrame:
    def js(o: Any) -> str:
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    rows = []
    for f in foods:
        rows.append({
            "id": f["id"], "name": f["name"], "category": f["category"],
            "aliases": pg_array(f.get("aliases")), "tags": pg_array(f.get("tags")),
            "gi": "" if f.get("gi") is None else f["gi"],
            "servings": js(f.get("servings", [])), "nutrients": js(f["n"]), "sources": js(f["src"]),
            "rare": "true" if f.get("rare") else "false", "rank": f.get("rank", 0),
        })
    return pd.DataFrame(rows, columns=SEED_COLUMNS)


def coverage(foods: list[dict[str, Any]]) -> pd.DataFrame:
    n = len(foods)
    nr = [f for f in foods if not f.get("rare")]
    rows = []
    for k in NUTRIENT_KEYS:
        c = sum(1 for f in foods if k in f["n"])
        c2 = sum(1 for f in nr if k in f["n"])
        rows.append({"nutrient": k, "foods_with_value": c, "coverage_pct": round(100 * c / n, 1) if n else 0.0,
                     "coverage_pct_non_rare": round(100 * c2 / len(nr), 1) if nr else 0.0})
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------- report

def _md_table(df: pd.DataFrame, max_rows: int = 60) -> str:
    if df is None or df.empty:
        return "_none_\n"
    d = df.head(max_rows)
    cols = list(d.columns)
    lines = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for row in d.itertuples(index=False):
        lines.append("| " + " | ".join(str(x).replace("|", "\\|").replace("\n", " ") for x in row) + " |")
    if len(df) > max_rows:
        lines.append(f"\n_... {len(df) - max_rows} more rows in the CSV exports_")
    return "\n".join(lines) + "\n"


def build_report(log: Log, foods: list[dict[str, Any]], merges: pd.DataFrame, decisions: pd.DataFrame,
                 review: pd.DataFrame, sources_cfg: list[dict], extra: dict[str, Any] | None = None
                 ) -> tuple[str, pd.DataFrame]:
    """-> (report.md text, report.csv frame)."""
    ev = log.frame()
    sections: list[tuple[str, pd.DataFrame, str]] = []

    rows_in = ev[(ev["stage"] == "ingest") & (ev["kind"] == "rows_in")].groupby("source")["n"].sum()
    vals_in = ev[(ev["stage"] == "ingest") & (ev["kind"] == "values_in")].groupby("source")["n"].sum()
    ing_drop = ev[(ev["stage"] == "ingest") & (ev["kind"] == "drop")].groupby(["source", "reason"])["n"].sum()
    t1 = pd.DataFrame({"source": rows_in.index, "rows_in": rows_in.values})
    t1["nutrient_values_in"] = t1["source"].map(vals_in).fillna(0).astype(int)
    t1["rows_dropped_at_ingest"] = t1["source"].map(ing_drop.groupby(level=0).sum()).fillna(0).astype(int)
    sections.append(("rows_in_per_source", t1, "Rows in per source"))

    warn = ev[ev["kind"] == "warning"].groupby(["stage", "source", "reason"], dropna=False)["n"].sum().reset_index()
    sections.append(("warnings", warn, "Warnings (mapping problems, unparseable cells) - fix these first"))

    nv = ev[(ev["stage"] == "normalize") & (ev["kind"] == "drop_value")].groupby(["source", "reason"])["n"].sum().reset_index()
    sections.append(("dropped_values_by_reason", nv, "Nutrient values dropped (normalize)"))

    cd = ev[(ev["stage"] == "curate") & (ev["kind"] == "drop")].groupby("reason")["n"].sum().reset_index()
    sections.append(("dropped_foods_by_reason", cd, "Foods dropped (curate)"))

    cr = ev[(ev["stage"] == "curate") & (ev["kind"] == "rare")].groupby("reason")["n"].sum().reset_index()
    sections.append(("rare_flagged_by_reason", cr, "Foods marked rare (curate)"))

    dd = ev[(ev["stage"] == "dedupe") & (ev["kind"] == "info")].groupby("reason")["n"].sum().reset_index()
    sections.append(("dedupe_summary", dd, "Dedupe summary"))

    if merges is not None and not merges.empty:
        mm = merges[["name", "category", "n_members", "n_sources", "members"]].sort_values("n_members", ascending=False)
    else:
        mm = pd.DataFrame(columns=["name", "category", "n_members", "n_sources", "members"])
    sections.append(("merged_groups", mm, "Merged groups (every merge is in merges.csv)"))

    nonrare = [f for f in foods if not f.get("rare")]
    cat = pd.Series([f["category"] for f in foods]).value_counts().rename_axis("category").reset_index(name="foods")
    final = pd.DataFrame([
        {"metric": "final_foods", "value": len(foods)},
        {"metric": "searchable_foods (not rare)", "value": len(nonrare)},
        {"metric": "rare_foods", "value": len(foods) - len(nonrare)},
        {"metric": "names_needing_review", "value": 0 if review is None else len(review)},
        {"metric": "foods_with_servings", "value": sum(1 for f in foods if f.get("servings"))},
    ] + [{"metric": k, "value": v} for k, v in (extra or {}).items()])
    sections.append(("final_counts", final, "Final count"))
    sections.append(("foods_by_category", cat, "Foods by category"))
    cov = coverage(foods)
    sections.append(("nutrient_coverage", cov, "Nutrient coverage (% of foods with a value)"))

    md = ["# Eighty food pipeline report\n"]
    csv_rows = []
    for key, df, title in sections:
        md.append(f"## {title}\n")
        md.append(_md_table(df))
        for rec in df.to_dict("records"):
            vals = list(rec.values())
            csv_rows.append({"section": key, "key": vals[0] if vals else "",
                             "subkey": vals[1] if len(vals) > 2 else "", "value": vals[-1] if vals else "",
                             "detail": json.dumps(rec, ensure_ascii=False, default=str)})
    md.append("## Sources and citations\n")
    for s in sources_cfg:
        md.append(f"- **{s['db']}** (`{s['key']}`, mapping status: {s.get('status', 'n/a')}): {s['citation']}")
    md.append("")
    return "\n".join(md), pd.DataFrame(csv_rows, columns=["section", "key", "subkey", "value", "detail"])


def write_outputs(out_dir: str, df: pd.DataFrame, log: Log, merges: pd.DataFrame, decisions: pd.DataFrame,
                  dropped_values: pd.DataFrame, sources_cfg: list[dict], review_threshold: float,
                  extra: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Write everything under out_dir and return the Food list."""
    from pathlib import Path
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    df = df.copy()
    df["food_id"] = make_ids(list(df["name"]), list(df["primary_uid"]))
    foods = build_foods(df)
    errs = validate_foods(foods)
    if errs:
        raise ValueError("schema validation failed:\n" + "\n".join(errs[:20]))
    (out / "foods.json").write_text(json.dumps(foods, ensure_ascii=False, indent=1), encoding="utf-8")
    seed_frame(foods).to_csv(out / "foods_seed.csv", index=False)

    review = build_review(df.assign(uid=df["primary_uid"]), review_threshold)
    review.to_csv(out / "needs_review_names.csv", index=False)
    (out / "needs_review_names.jsonl").write_text(review_jsonl(review), encoding="utf-8")

    md, csv = build_report(log, foods, merges, decisions, review, sources_cfg, extra)
    (out / "report.md").write_text(md, encoding="utf-8")
    csv.to_csv(out / "report.csv", index=False)
    if merges is not None:
        merges.to_csv(out / "merges.csv", index=False)
    decisions.to_csv(out / "curate_log.csv", index=False)
    dropped_values.to_csv(out / "dropped_values.csv", index=False)
    rej = log.tables.get("dedupe_rejected")
    if rej is not None:
        rej.to_csv(out / "dedupe_rejected_pairs.csv", index=False)
    (out / "citations.json").write_text(json.dumps(
        [{"key": s["key"], "db": s["db"], "citation": s["citation"], "mapping_status": s.get("status", "")}
         for s in sources_cfg], ensure_ascii=False, indent=1), encoding="utf-8")
    return foods
