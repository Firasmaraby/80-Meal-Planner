"""Glycaemic index (glucose = 100) for the app's foods, from pipeline/config/gi_values.json.

The file maps food heads (optionally narrowed by a name pattern, a form or a category) to GI values from the International
Tables of Glycemic Index (Atkinson, Foster-Powell and Brand-Miller, Diabetes Care 2008; update: Atkinson et al., AJCN 2021),
with the table entry each value comes from in `src`. Mappings are tried in file order, the first match wins.

A food's GI is decided like this (GI only matters for foods with available carbohydrate = carbs - fibre):
  table      a mapping matched and the food has >= 2 g available carbohydrate per 100 g  -> the table value
  legacy     else the GI the sample foods already carried (the 45 hand-picked ones)
  analogue   else a mapping marked `est` (a close relative in the tables) and >= 5 g available      -> estimated
  default    else >= 5 g available carbohydrate: the category default (starchy vegetables by head list) -> estimated
  none       everything else (no carbohydrate to speak of, or spices / herbs / extracts that are not eaten as carbohydrate)
`gi_est` is True for analogue and default; the app bundle carries it as row index 13.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .names_en import head_key

MIN_AVAIL_TABLE = 2.0       # g available carbohydrate per 100 g for a table value to be applied
MIN_AVAIL_DEFAULT = 5.0     # ... for an estimate (analogue / category default)


class GiTable:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg
        self.defaults: dict[str, float] = cfg["category_defaults"]
        self.starchy = {head_key(h) for h in cfg["starchy_vegetable_heads"]}
        self.maps: list[dict[str, Any]] = []
        for m in cfg["mappings"]:
            heads = m["head"] if isinstance(m["head"], list) else [m["head"]]
            self.maps.append({
                "heads": None if heads == ["*"] else {head_key(h) for h in heads},
                "name": re.compile(m["name"], re.I) if m.get("name") else None,
                "forms": None if not m.get("form") else set(m["form"] if isinstance(m["form"], list) else [m["form"]]),
                "cats": None if not m.get("category") else set(m["category"] if isinstance(m["category"], list) else [m["category"]]),
                "gi": m.get("gi"), "src": m.get("src", ""), "est": bool(m.get("est")), "skip": bool(m.get("skip")),
            })

    def match(self, rec: dict[str, Any]) -> dict[str, Any] | None:
        hk, nm = head_key(rec["head"]), f"{rec['name']} | {rec.get('raw_name', '')}"
        for m in self.maps:
            if m["heads"] is not None and hk not in m["heads"]:
                continue
            if m["forms"] is not None and rec.get("form") not in m["forms"]:
                continue
            if m["cats"] is not None and rec.get("category") not in m["cats"]:
                continue
            if m["name"] is not None and not m["name"].search(nm):
                continue
            return m
        return None


def load_table(path: Path) -> GiTable:
    return GiTable(json.loads(Path(path).read_text(encoding="utf-8")))


def available_carbs(n: dict[str, float]) -> float | None:
    """Carbohydrate that raises blood glucose: total carbohydrate minus fibre (per 100 g)."""
    if n.get("carbs") is None:
        return None
    return max(0.0, n["carbs"] - (n.get("fiber") or 0.0))


def pick_gi(rec: dict[str, Any], table: GiTable, legacy_gi: float | None = None) -> tuple[float | None, str, bool]:
    """(gi, source text, estimated) for one record. See the module docstring for the order."""
    avail = available_carbs(rec["n"])
    m = table.match(rec)
    if m is not None and m["skip"]:
        return (legacy_gi, "legacy sample food", False) if legacy_gi is not None else (None, "", False)
    if m is not None and not m["est"] and avail is not None and avail >= MIN_AVAIL_TABLE:
        return m["gi"], m["src"], False
    if legacy_gi is not None:
        return legacy_gi, "legacy sample food", False
    if avail is None or avail < MIN_AVAIL_DEFAULT:
        return None, "", False
    if m is not None and m["est"]:
        return m["gi"], m["src"], True
    cat = rec["category"]
    if cat == "vegetable" and head_key(rec["head"]) in table.starchy:
        return table.defaults["starchy_vegetable"], "default: starchy vegetable", True
    if cat in table.defaults:
        return table.defaults[cat], f"default: {cat}", True
    return None, "", False


def gi_class(r: dict[str, Any]) -> str:
    if r.get("gi") is None:
        return "none"
    s = r.get("gi_src", "")
    if s.startswith("default"):
        return "default"
    if s.startswith("legacy"):
        return "legacy"
    return "analogue" if r.get("gi_est") else "table"


def summary(live: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for tier in ("everyday", "extended"):
        c: Counter = Counter()
        for r in live:
            if r.get("tier") != tier:
                continue
            avail = available_carbs(r["n"])
            if avail is not None and avail >= MIN_AVAIL_DEFAULT:
                c[gi_class(r)] += 1
                c["total >=5 g"] += 1
            elif r.get("gi") is not None:
                c["below 5 g but with a GI"] += 1
        out[tier] = dict(c)
    return out


def write_assignments(path: Path, live: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "tier", "name", "category", "head", "form", "available_carbs_g", "gi", "class", "source"])
        for r in sorted(live, key=lambda r: r["id"]):
            avail = available_carbs(r["n"])
            if r.get("gi") is None and (avail is None or avail < MIN_AVAIL_DEFAULT):
                continue
            w.writerow([r["id"], r["tier"], r["name"], r["category"], r["head"], r["form"],
                        "" if avail is None else round(avail, 1), "" if r.get("gi") is None else r["gi"], gi_class(r), r.get("gi_src", "")])
