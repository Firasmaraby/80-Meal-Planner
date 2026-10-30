"""Exports: the compact app bundles, the Supabase seed CSV, the review CSV and the notes CSV.

Bundle format (v1, columnar, compact):
  { "v":1, "keys":[...NutrientKey order], "dbs":[<citation strings>],
    "foods":[ [id, name, category, head, form, rank, aliases[], tags[], servings[[label,g]], src[[db,ref]], estimated[], values[]] ] }
`src[i][0]` is an index into `dbs` (a plain string is also accepted by the decoder).  `values` is aligned to `keys`,
`null` = no data, rounded to 4 significant figures.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

_PIPE = Path(__file__).resolve().parent.parent
if str(_PIPE) not in sys.path:
    sys.path.insert(0, str(_PIPE))

from stages.export import SEED_COLUMNS, pg_array  # noqa: E402
from stages.textutil import short_hash, slugify  # noqa: E402

from .adapter import NUTRIENT_KEYS, sig4  # noqa: E402

CATEGORIES = ["fruit", "vegetable", "legume", "grain", "nut_seed", "dairy", "egg", "meat", "poultry", "fish", "oil_fat",
              "beverage", "condiment", "sweet", "prepared", "other"]
TAGS = ["fatty_fish", "leafy_green", "whole_grain", "plant_iron", "fermented", "processed"]


def make_ids(records: list[dict[str, Any]]) -> None:
    """id = slug(display name) + '-' + 6 hex of sha1(canonical_id). Stable for identical input, unique by construction."""
    used: set[str] = set()
    for r in sorted(records, key=lambda r: r["canonical_id"]):
        base = f"{slugify(r['name'])}-{short_hash(r['canonical_id'])}"
        cand, n = base, 2
        while cand in used:
            cand = f"{base}-{n}"
            n += 1
        used.add(cand)
        r["id"] = cand


def _num(v: float | None) -> Any:
    v = sig4(v)
    if v is None:
        return None
    return int(v) if float(v).is_integer() else v


def values_row(n: dict[str, float]) -> list[Any]:
    return [_num(n.get(k)) for k in NUTRIENT_KEYS]


def default_servings(rule_cfg: dict, name: str, category: str, form: str) -> list[dict[str, Any]]:
    """First matching rule of config/servings_defaults.json (same file the older pipeline uses)."""
    states = {form, ""}
    if form == "cooked":
        states |= {"boiled", "cooked", "steamed", "baked"}
    if form in {"product", "dish"}:
        states.add("")
    for r in rule_cfg.get("rules", []):
        if category not in r["categories"]:
            continue
        if "states" in r and not (states & set(r["states"])):
            continue
        if re.search(r["name_pattern"], name, re.I):
            return [dict(x) for x in r["servings"]]
    return []


def head_servings(entries: list[Any]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    """(head, form|'') -> servings, from everyday_heads.txt."""
    out: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for e in entries:
        if e.servings:
            out.setdefault((e.head, e.form), e.servings)
    return out


def pick_servings(rec: dict[str, Any], hs: dict[tuple[str, str], list[dict[str, Any]]], rule_cfg: dict,
                  legacy: dict[str, Any] | None) -> tuple[list[dict[str, Any]], str]:
    if legacy and legacy.get("servings"):
        return [dict(s) for s in legacy["servings"]], "legacy"
    s = hs.get((rec["head"], rec["form"]))
    if s:
        return [dict(x) for x in s], "common_list"
    # a head entry without a form applies to every form of that head
    s = hs.get((rec["head"], ""))
    if s:
        return [dict(x) for x in s], "common_list"
    s = default_servings(rule_cfg, rec["name"], rec["category"], rec["form"])
    return s, "category_default" if s else ""


def build_bundle(records: list[dict[str, Any]]) -> dict[str, Any]:
    dbs: list[str] = []
    idx: dict[str, int] = {}
    for r in records:
        for db, _ in r["src"]:
            if db not in idx:
                idx[db] = len(dbs)
                dbs.append(db)
    rows = []
    for r in sorted(records, key=lambda r: (-r["rank"], r["id"])):
        rows.append([
            r["id"], r["name"], r["category"], r["head"], r["form"], r["rank"], r["aliases_out"], r["tags"],
            [[s["label"], round(float(s["g"]), 1) if not float(s["g"]).is_integer() else int(s["g"])] for s in r["servings"]],
            [[idx[db], ref] for db, ref in r["src"]], r["estimated"], values_row(r["n"]),
        ])
    return {"v": 1, "keys": NUTRIENT_KEYS, "dbs": dbs, "foods": rows}


def write_bundle(path: Path, bundle: dict[str, Any]) -> int:
    text = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def validate_bundle(bundle: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    keys = bundle["keys"]
    if keys != NUTRIENT_KEYS:
        errs.append("keys differ from NutrientKey order")
    ids = set()
    for row in bundle["foods"]:
        fid = row[0]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", fid):
            errs.append(f"{fid}: id is not a slug")
        if fid in ids:
            errs.append(f"{fid}: duplicate id")
        ids.add(fid)
        if row[2] not in CATEGORIES:
            errs.append(f"{fid}: bad category {row[2]}")
        if any(t not in TAGS for t in row[7]):
            errs.append(f"{fid}: bad tag")
        if not row[9]:
            errs.append(f"{fid}: empty src")
        if len(row[11]) != len(keys):
            errs.append(f"{fid}: values length")
        if any(v is not None and (v < 0 or v != v) for v in row[11]):
            errs.append(f"{fid}: negative / NaN value")
        if not (0 <= row[5] <= 100):
            errs.append(f"{fid}: rank out of range")
        if any(k not in keys for k in row[10]):
            errs.append(f"{fid}: bad estimated key")
        if not row[1].strip():
            errs.append(f"{fid}: empty name")
    return errs


def write_seed(path: Path, records: list[dict[str, Any]]) -> None:
    def js(o: Any) -> str:
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SEED_COLUMNS)
        w.writeheader()
        for r in sorted(records, key=lambda r: r["id"]):
            nutrients = {k: _num(r["n"][k]) for k in NUTRIENT_KEYS if r["n"].get(k) is not None}
            w.writerow({
                "id": r["id"], "name": r["name"], "category": r["category"], "aliases": pg_array(r["aliases_out"]),
                "tags": pg_array(r["tags"]), "gi": "" if r.get("gi") is None else r["gi"],
                "servings": js([{"label": s["label"], "g": s["g"]} for s in r["servings"]]),
                "nutrients": js(nutrients), "sources": js([{"db": db, "ref": ref} for db, ref in r["src"]]),
                "rare": "false", "rank": r["rank"],
            })


def write_review(path: Path, records: list[dict[str, Any]]) -> None:
    cols = ["id", "display_name", "head", "form", "category", "rank", "original_name", "source", "why", "canonical_id"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in sorted(records, key=lambda r: (r["category"], r["head"], -r["rank"], r["id"])):
            w.writerow([r["id"], r["name"], r["head"], r["form"], r["category"], r["rank"], r["name_en"], r["source_id"],
                        r.get("why", ""), r["canonical_id"]])


def write_notes(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "tier", "notes", "estimated", "servings_from", "n_sources"])
        for r in sorted(records, key=lambda r: r["id"]):
            w.writerow([r["id"], r["tier"], "; ".join(r["notes"]), " ".join(r["estimated"]), r.get("servings_from", ""), r["n_sources"]])


def write_curation_log(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["canonical_id", "id", "tier", "reason", "score", "rank", "display_name", "head", "form", "category", "original_name",
                    "source", "n_sources", "n_board"])
        for r in sorted(records, key=lambda r: r["canonical_id"]):
            reason = r.get("hidden_reason") or r.get("why", "")
            w.writerow([r["canonical_id"], r.get("id", ""), r["tier"], reason, round(r["score"], 1), r["rank"], r["name"], r["head"],
                        r["form"], r["category"], r["name_en"], r["source_id"], r["n_sources"], r["n_board"]])
