"""Peer outlier check: a value far from what the same kind of food has is more likely a source or unit error than a fact.

For every live (everyday or extended) food and every board nutrient plus kcal, protein and fat, the value is compared with the
median of its peers (other live foods with the same head AND the same form, at least MIN_PEERS of them having that nutrient).
Flagged when it is above 2.5x or below 0.25x the peer median AND the gap is meaningful: at least 20 % of the female
(19-30) RDA / AI for a board nutrient, at least 50 kcal for kcal (protein and fat: the gap x 4 / x 9 kcal).

* board micronutrients: the flagged value is DROPPED (missing beats wrong), an `outlier` note is added, the citation stays;
* kcal, protein, fat and fibre are only listed.
Peers with a median of 0 are skipped (any value would be 'infinitely' above it; fortified vs unfortified is real).
All flags are computed against the original values before anything is dropped, so one drop cannot create another.

Safeguards beyond the rule above (the literal rule flagged 6,437 values and would have dropped 5,055, most of them real:
a measured 0 against peers that carry some, or heads that mix very different foods such as "candy", "cheese", "cereal"):
a board micronutrient is only DROPPED when the value is not 0 and the peers agree among themselves (their upper quartile is
at most 1.5x their lower quartile, lower quartile > 0). Every other flag stays in outliers.csv as `listed` with the reason.
Set STRICT = True to apply the literal rule.
"""
from __future__ import annotations

import csv
import re
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from .adapter import BOARD_KEYS

MIN_PEERS = 3
HIGH, LOW = 2.5, 0.25
RDA_SHARE = 0.20
KCAL_GAP = 50.0
# female 19-30 RDA / AI, the same numbers as src/engine/dri.ts (units of the bundle)
FEMALE_RDA = {
    "vitA": 700, "vitC": 75, "vitD": 15, "vitE": 15, "vitK": 90, "b1": 1.1, "b2": 1.1, "b3": 14, "b5": 5, "b6": 1.3,
    "folate": 400, "b12": 2.4, "choline": 425, "calcium": 1000, "iron": 18, "magnesium": 310, "phosphorus": 700,
    "potassium": 2600, "zinc": 8, "copper": 0.9, "manganese": 1.8, "selenium": 55, "iodine": 150, "fiber": 25,
}
STRICT = False
PEER_SPREAD = 1.5          # Q3 / Q1 of the peers must not exceed this for a value to be dropped
ENRICHMENT_KEYS = {"folate", "b1", "b2", "b3", "b6", "b12", "iron", "calcium", "vitD", "vitA", "zinc"}
DROP_MIN_PEERS = 5         # dropping a value needs a solid peer group
# high values that are real: organ meats are nutrient-dense, fortified foods carry added vitamins and minerals
NATURALLY_HIGH_RX = re.compile(r"\b(?:liver|kidney|heart|giblets?|organ|fortified|enriched|cereal|margarine|spread|bran|germ|"
                               r"yeast|plant-based|soy (?:milk|beverage)|infant|powder|dried|dehydrated|concentrate)\b", re.I)
LIST_ONLY = ("kcal", "protein", "fat", "fiber")
KEYS = ["kcal", "protein", "fat"] + list(BOARD_KEYS)


def _meaningful(key: str, gap: float) -> bool:
    if key == "kcal":
        return gap >= KCAL_GAP
    if key == "protein":
        return gap * 4 >= KCAL_GAP
    if key == "fat":
        return gap * 9 >= KCAL_GAP
    return gap >= RDA_SHARE * FEMALE_RDA[key]


def find_outliers(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    live = [r for r in records if r.get("tier") in ("everyday", "extended")]
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in live:
        groups[(r["head"], r["form"])].append(r)
    flags: list[dict[str, Any]] = []
    for grp in groups.values():
        if len(grp) < MIN_PEERS + 1:
            continue
        for r in grp:
            for k in KEYS:
                v = r["n"].get(k)
                if v is None:
                    continue
                peers = [p["n"][k] for p in grp if p is not r and p["n"].get(k) is not None]
                if len(peers) < MIN_PEERS:
                    continue
                med = statistics.median(peers)
                if med <= 0 or not (v > HIGH * med or v < LOW * med) or not _meaningful(k, abs(v - med)):
                    continue
                action, why = "dropped", ""
                if k in LIST_ONLY:
                    action, why = "listed", "kcal / protein / fat / fibre are never changed"
                elif v < med:
                    action, why = "listed", "low values only list: a missing value counts as zero anyway"
                elif len(peers) < DROP_MIN_PEERS:
                    action, why = "listed", f"fewer than {DROP_MIN_PEERS} peers"
                elif r.get("category") in ("grain", "beverage") and k in ENRICHMENT_KEYS:
                    action, why = "listed", "grains and drinks are often enriched with these"
                elif NATURALLY_HIGH_RX.search(r["name"]):
                    action, why = "listed", "organ meat, fortified or concentrated food: high values are expected"
                elif not STRICT:
                    q = statistics.quantiles(peers, n=4, method="inclusive")
                    if q[0] <= 0 or q[2] > PEER_SPREAD * q[0]:
                        action, why = "listed", "peers disagree"
                flags.append({"rec": r, "key": k, "value": v, "median": med, "peers": len(peers), "action": action, "why": why})
    return flags


def apply_outliers(flags: list[dict[str, Any]]) -> int:
    n = 0
    for f in flags:
        if f["action"] != "dropped":
            continue
        r, k = f["rec"], f["key"]
        r["n"].pop(k, None)
        if k in r["estimated"]:
            r["estimated"].remove(k)
        r["notes"].append(f"outlier: {k} {f['value']:g} dropped (peer median {f['median']:.4g}, {f['peers']} peers); citation kept")
        n += 1
    return n


def write_outliers(path: Path, flags: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["food", "nutrient", "value", "peer median", "n peers", "action", "id", "source", "ratio", "reason"])
        for f in sorted(flags, key=lambda f: (f["action"], -max(f["value"] / f["median"], f["median"] / max(f["value"], 1e-9)), f["rec"]["name"])):
            r = f["rec"]
            w.writerow([r["name"], f["key"], f"{f['value']:g}", f"{f['median']:.4g}", f["peers"], f["action"], r.get("id", ""),
                        r["source_id"], f"{f['value'] / f['median']:.2f}", f["why"]])


def apply_overrides(records: list[dict[str, Any]], overrides: dict[str, Any]) -> int:
    """Hand-reviewed fixes from config/value_overrides.json: {food id: {nutrient: value or null, "_why": reason}}.
    A corrected source value counts as measured; with "_estimated": true (values filled from the literature, not measured
    for this food) the keys are marked estimated."""
    by_id = {r.get("id"): r for r in records if r.get("id")}
    n = 0
    for fid, fix in overrides.items():
        r = by_id.get(fid)
        if fid.startswith("_") or r is None:
            continue
        for k, v in fix.items():
            if k.startswith("_"):
                continue
            if v is None:
                r["n"].pop(k, None)
            else:
                r["n"][k] = v
            if fix.get("_estimated") and v is not None:
                if k not in r["estimated"]:
                    r["estimated"].append(k)
            elif k in r["estimated"]:
                r["estimated"].remove(k)
            r["notes"].append(f"reviewed: {k} {'dropped' if v is None else f'set to {v}'} ({fix.get('_why', '')})")
            n += 1
    return n
