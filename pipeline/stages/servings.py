"""Stage 6 - servings: attach household measures (label + grams) to each food.

1. If any contributing source record has portion data (ingest `portions`), use it (primary record first), cleaned and
   de-duplicated, at most `max_per_food`.
2. Otherwise apply the first matching rule of config/servings_defaults.json (category + name + state). Foods that
   match nothing get no servings - we do not guess (e.g. fruit "1 medium" only when the unit weight is known).
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

import pandas as pd

from .report import Log

_BAD_LABEL = re.compile(r"not specified|unspecified|quantity|nfs|^\W*$", re.I)


def _clean_portions(rows: list[tuple[str, float, float]], max_n: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen_labels: set[str] = set()
    for label, grams, _seq in rows:
        label = re.sub(r"\s+", " ", str(label)).strip()
        if not label or _BAD_LABEL.search(label) or not (0 < grams <= 5000):
            continue
        key = label.lower()
        if key in seen_labels:
            continue
        if any(o["label"].split(",")[0].lower() == label.split(",")[0].lower() and abs(o["g"] - grams) / grams < 0.03
               for o in out):
            continue
        seen_labels.add(key)
        out.append({"label": label, "g": round(float(grams), 1)})
        if len(out) >= max_n:
            break
    return out


def attach_servings(foods: pd.DataFrame, portions: pd.DataFrame, defaults: dict | None = None,
                    max_per_food: int = 6, log: Log | None = None) -> pd.DataFrame:
    """Pure: foods (needs `members`, `category`, `name`, `state`) + portions -> foods with `servings`, `servings_from`."""
    by_uid: dict[str, list[tuple[str, float, float]]] = defaultdict(list)
    if portions is not None and not portions.empty:
        p = portions.copy()
        p["uid"] = p["source"] + ":" + p["source_id"].astype(str)
        p = p.sort_values(["uid", "seq"], kind="stable")
        for uid, label, g, seq in zip(p["uid"], p["label"], p["grams"], p["seq"]):
            by_uid[uid].append((label, float(g), float(seq) if pd.notna(seq) else 0.0))
    rules = []
    for r in (defaults or {}).get("rules", []):
        rules.append((r, re.compile(r["name_pattern"], re.I)))

    servings, origin = [], []
    n_src = n_def = 0
    for members, cat, name, state in zip(foods["members"], foods["category"], foods["name"], foods["state"]):
        rows: list[tuple[str, float, float]] = []
        for uid in members:
            rows.extend(by_uid.get(uid, []))
        s = _clean_portions(rows, max_per_food)
        if s:
            servings.append(s)
            origin.append("source")
            n_src += 1
            continue
        got = None
        st = (state or "").split(" | ")[0]
        for r, rx in rules:
            if cat not in r["categories"]:
                continue
            if "states" in r and st not in r["states"]:
                continue
            if rx.search(name):
                got = [dict(x) for x in r["servings"]]
                break
        if got:
            servings.append(got)
            origin.append("default")
            n_def += 1
        else:
            servings.append([])
            origin.append("")
    out = foods.copy()
    out["servings"] = servings
    out["servings_from"] = origin
    if log:
        log.add("servings", "info", "foods_with_source_servings", n=n_src)
        log.add("servings", "info", "foods_with_default_servings", n=n_def)
        log.add("servings", "info", "foods_without_servings", n=len(out) - n_src - n_def)
    return out
