"""Stage 5 - curate: drop junk, flag rare items, compute a 0-100 commonness `rank`. Every decision is logged.

Input: merged foods (one row per final food) with columns from names/dedupe (name, raw_name, core, state,
category, aliases, source_group, n_sources, name_conf + one float column per NutrientKey).
Output: (curated foods with `rare`, `rare_reason`, `rank`; decisions table).

Order of evaluation: drop rules -> rank (commonness, before any rare penalty) -> rare rules (some only fire below a
commonness cut-off, so e.g. "bison" stays visible if it is in config/common_foods.txt) -> final rank (rare capped).

decisions columns: uid, name, action (drop|rare|keep), rule, detail, rank, rank_parts
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

from .names import Rules, key_tokens, load_rules
from .report import Log
from .schema import NUTRIENT_KEYS

BOARD_KEYS = [
    "vitA", "vitC", "vitD", "vitE", "vitK", "b1", "b2", "b3", "b5", "b6", "b7", "folate", "b12", "choline",
    "calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper", "manganese", "selenium", "iodine",
    "fiber",
]


def load_common(path: str | Path | None) -> list[str]:
    if not path or not Path(path).exists():
        return []
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip().lower()
        if line and not line.startswith("#"):
            out.append(line)
    return out


class CommonIndex:
    """Token-set index over the common-foods list for exact / subset matching."""

    def __init__(self, phrases: list[str], rules: Rules):
        self.rules = rules
        self.sets: list[frozenset[str]] = []
        self.by_token: dict[str, list[int]] = {}
        for ph in phrases:
            ts = frozenset(key_tokens(ph, rules))
            if not ts:
                continue
            i = len(self.sets)
            self.sets.append(ts)
            for t in ts:
                self.by_token.setdefault(t, []).append(i)
        self.exact = set(self.sets)

    def score(self, token_sets: list[frozenset[str]]) -> tuple[float, str]:
        """-> (0..1 match strength, matched phrase) over several token sets (core + aliases)."""
        best, why = 0.0, ""
        for ts in token_sets:
            if not ts:
                continue
            if ts in self.exact:
                return 1.0, " ".join(sorted(ts))
            seen: set[int] = set()
            for t in ts:
                seen.update(self.by_token.get(t, ()))
            for i in seen:
                ph = self.sets[i]
                if ph <= ts:
                    ratio = len(ph) / len(ts)
                    if ratio > best:
                        best, why = ratio, " ".join(sorted(ph))
        return best * 0.9, why  # subset matches never reach an exact match's strength


def _compile(rules_cfg: dict) -> dict[str, Any]:
    comp = {"drop": [], "rare": []}
    for r in rules_cfg.get("drop", []):
        comp["drop"].append((r["reason"], re.compile(r["pattern"], re.I)))
    for r in rules_cfg.get("rare", []):
        comp["rare"].append({
            **r,
            "rx": re.compile(r["pattern"], re.I),
            "grx": re.compile(r["source_group_pattern"], re.I) if r.get("source_group_pattern") else None,
        })
    comp["drop_groups"] = [g.lower() for g in rules_cfg.get("drop_source_groups", [])]
    return comp


def compute_rank(row: pd.Series, cidx: CommonIndex, rank_cfg: dict, name_rules: Rules, review_threshold: float
                 ) -> tuple[float, dict[str, float], float]:
    """-> (rank 0..100, parts, commonness_without_penalty)."""
    parts: dict[str, float] = {}
    parts["category"] = float(rank_cfg["category_base"].get(row["category"], 0))
    core_ts = frozenset(key_tokens(row["core"], name_rules))
    head_ts = frozenset(key_tokens(str(row.get("head", "")), name_rules))   # "olive oil" in "Olive oil, salad or cooking"
    strength, phrase = cidx.score([core_ts, head_ts])
    parts["common"] = round(strength * (rank_cfg["common_exact"] if strength >= 0.999 else rank_cfg["common_subset"]), 2)
    n = len(core_ts)
    br = rank_cfg["brevity"]
    parts["brevity"] = float(br.get(str(n), br["default"])) if n >= 1 else 0.0
    ns = int(row.get("n_sources", 1) or 1)
    parts["sources"] = float(min(ns, rank_cfg["max_source_bonus_count"]) - 1) * rank_cfg["per_extra_source"]
    state = str(row.get("state", "") or "")
    if not state:
        parts["state"] = float(rank_cfg["no_state_bonus"])
    elif state.split(" | ")[0] in rank_cfg["good_states"]:
        parts["state"] = float(rank_cfg["good_state_bonus"])
    else:
        parts["state"] = 0.0
    have = sum(1 for k in BOARD_KEYS if pd.notna(row.get(k)))
    parts["coverage"] = round(have / len(BOARD_KEYS) * rank_cfg["board_coverage_weight"], 2)
    commonness = sum(parts.values())
    pen = 0.0
    if float(row.get("name_conf", 1.0)) < review_threshold:
        pen -= rank_cfg["low_name_conf_penalty"]
    if re.search(r"\d", str(row["name"])):
        pen -= rank_cfg["digit_penalty"]
    parts["penalty"] = pen
    return max(0.0, min(100.0, commonness + pen)), parts, commonness


def curate(foods: pd.DataFrame, curate_cfg: dict, common_phrases: list[str], name_rules: Rules | None = None,
           log: Log | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pure: foods -> (kept foods with rare/rank columns, decisions)."""
    name_rules = name_rules or load_rules()
    comp = _compile(curate_cfg)
    rank_cfg = curate_cfg["rank"]
    cidx = CommonIndex(common_phrases, name_rules)
    min_n = int(curate_cfg.get("min_nutrients_for_common", 0))
    sparse_unless = float(curate_cfg.get("sparse_unless_commonness_at_least", 45))
    need_any = curate_cfg.get("require_any_of", ["kcal", "protein"])
    threshold = name_rules.review_threshold

    decisions: list[dict[str, Any]] = []
    keep_idx: list[int] = []
    rare_flags: dict[int, str] = {}
    ranks: dict[int, int] = {}

    for idx, row in foods.iterrows():
        raw = str(row.get("raw_name", ""))
        name = str(row["name"])
        group = str(row.get("source_group", "") or "")
        text = f"{raw} | {name} | {group}"
        text_l = text.lower()
        uid = row["uid"]

        drop_reason, drop_detail = None, ""
        for reason, rx in comp["drop"]:
            m = rx.search(text)
            if m:
                drop_reason, drop_detail = reason, m.group(0)
                break
        if drop_reason is None and any(g in group.lower() for g in comp["drop_groups"] if g):
            drop_reason, drop_detail = "baby_food", f"source group {group!r}"
        if drop_reason is None and need_any and all(pd.isna(row.get(k)) for k in need_any):
            drop_reason, drop_detail = "missing_kcal_and_protein", ""
        if drop_reason:
            decisions.append({"uid": uid, "name": name, "action": "drop", "rule": drop_reason, "detail": drop_detail,
                              "rank": None, "rank_parts": ""})
            if log:
                log.add("curate", "drop", drop_reason, source=row.get("source"), uid=uid, detail=name)
            continue

        rank, parts, commonness = compute_rank(row, cidx, rank_cfg, name_rules, threshold)
        reasons: list[str] = []
        details: list[str] = []
        for r in comp["rare"]:
            cats = r.get("categories")
            if cats and row["category"] not in cats:
                continue
            hit = r["rx"].search(text) if r["pattern"] != "$^" else None
            grp_hit = bool(r["grx"] and r["grx"].search(group))
            if not hit and not grp_hit:
                continue
            if "unless_commonness_at_least" in r and commonness >= r["unless_commonness_at_least"]:
                continue
            if "commonness_below" in r and commonness >= r["commonness_below"]:
                continue
            reasons.append(r["reason"])
            details.append(hit.group(0) if hit else group)
        nn = sum(1 for k in NUTRIENT_KEYS if pd.notna(row.get(k)))
        if min_n and nn < min_n and commonness < sparse_unless:
            reasons.append("sparse_data")
            details.append(f"{nn} nutrients")
        is_rare = bool(reasons)
        if is_rare:
            rank = min(rank, rank_cfg["rare_cap"])
            rare_flags[idx] = ";".join(reasons)
        ranks[idx] = int(round(rank))
        keep_idx.append(idx)
        decisions.append({
            "uid": uid, "name": name, "action": "rare" if is_rare else "keep",
            "rule": ";".join(reasons), "detail": "; ".join(details), "rank": ranks[idx],
            "rank_parts": json.dumps({k: round(v, 2) for k, v in parts.items()}),
        })
        if is_rare and log:
            for rs in reasons:
                log.add("curate", "rare", rs, source=row.get("source"), uid=uid, detail=name)

    out = foods.loc[keep_idx].copy()
    out["rare"] = [i in rare_flags for i in out.index]
    out["rare_reason"] = [rare_flags.get(i, "") for i in out.index]
    out["rank"] = [ranks[i] for i in out.index]
    dec = pd.DataFrame(decisions, columns=["uid", "name", "action", "rule", "detail", "rank", "rank_parts"])
    return out.reset_index(drop=True), dec
