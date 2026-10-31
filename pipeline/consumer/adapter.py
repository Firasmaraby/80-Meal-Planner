"""foodpipe -> app adapter.

* picks ONE display record per canonical cluster (region priority Canada, then US),
* maps foodpipe columns (`protein_g`, `vitamin_a_rae_ug`, ...) to the app's `NutrientKey`s (per 100 g, same units),
* never turns a missing value into 0, records which rule produced carbs / folate / vitK, and which keys are estimated.

Pure functions over dicts so they are unit-testable; `load_records` does the pandas work.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd

EDIBLE_BASIS = "per 100 g edible portion"

# Owner decision 1: display-record priority inside a cluster.
SOURCE_PRIORITY = ["cnf", "usda_fdc_sr_legacy", "usda_fdc_foundation"]

NUTRIENT_KEYS = [
    "kcal", "protein", "carbs", "fiber", "sugar", "fat", "satFat", "mufa", "pufa",
    "ala", "epa", "dha", "la",
    "vitA", "vitC", "vitD", "vitE", "vitK",
    "b1", "b2", "b3", "b5", "b6", "b7", "folate", "b12", "choline",
    "calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper",
    "manganese", "selenium", "iodine", "sodium",
]

# 1:1 column mappings (app key -> foodpipe column)
DIRECT = {
    "protein": "protein_g", "fat": "fat_g", "fiber": "fiber_g", "sugar": "sugars_g",
    "satFat": "sat_fat_g", "mufa": "mono_fat_g", "pufa": "poly_fat_g",
    "ala": "omega3_ala_g", "epa": "omega3_epa_g", "dha": "omega3_dha_g",
    "vitC": "vitamin_c_mg", "vitD": "vitamin_d_ug", "vitE": "vitamin_e_mg",
    "b1": "thiamin_b1_mg", "b2": "riboflavin_b2_mg", "b3": "niacin_b3_mg", "b5": "pantothenic_acid_b5_mg",
    "b6": "vitamin_b6_mg", "b7": "biotin_ug", "b12": "vitamin_b12_ug", "choline": "choline_mg",
    "vitA": "vitamin_a_rae_ug",  # RAE only. Never RE.
    "calcium": "calcium_mg", "iron": "iron_mg", "magnesium": "magnesium_mg", "phosphorus": "phosphorus_mg",
    "potassium": "potassium_mg", "zinc": "zinc_mg", "copper": "copper_mg", "manganese": "manganese_mg",
    "selenium": "selenium_ug", "iodine": "iodine_ug", "sodium": "sodium_mg",
}
NUTRIENT_COLUMNS = sorted(set(DIRECT.values()) | {
    "energy_kcal", "energy_kj", "carbs_by_difference_g", "carbs_available_g", "carbs_available_monosaccharide_g",
    "vitamin_k1_ug", "vitamin_k_total_ug", "folate_dfe_ug", "folate_total_ug", "folic_acid_ug",
})

BOARD_KEYS = ["vitA", "vitC", "vitD", "vitE", "vitK", "b1", "b2", "b3", "b5", "b6", "folate", "b12", "choline",
              "calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper", "manganese",
              "selenium", "iodine", "fiber"]


def num(v: Any) -> float | None:
    """foodpipe cell -> float or None. Empty / NaN / non-numeric / negative -> None (missing, never 0)."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        if v == "":
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f) or f < 0:
        return None
    return f


def sig4(v: float | None) -> float | None:
    """Round to 4 significant figures."""
    if v is None:
        return None
    if v == 0:
        return 0.0
    r = float(f"{v:.4g}")
    return r


FATTY_ACIDS = ("satFat", "mufa", "pufa")
FA_DETAIL = ("ala", "epa", "dha")
FA_SUM_MAX = 1.0      # sat + mono + poly is ~0.85-0.95 of total fat (glycerol, sterols); above 1.0 is impossible
FA_SUM_IMPLAUSIBLE = 1.5
FA_SCALE_TO = 0.93    # borrowed fatty acids are rescaled to this share of the food's own total fat


def reconcile_fatty_acids(n: dict[str, float], est: list[str], notes: list[str]) -> None:
    """Keep the fatty-acid split consistent with the food's own total fat (the sat-fat and omega pillars depend on it).
    - borrowed / estimated split (gap-filled from another source with a different fat content): rescale it to this food's fat;
    - measured split that is impossible (sum > 1.5 x fat, or saturated fat alone > fat): drop sat / mono / poly - missing beats wrong;
    - measured split slightly over (1.0 - 1.5 x, analytical spread): kept as published."""
    fat = n.get("fat")
    if fat is None:
        return
    fas = [k for k in FATTY_ACIDS if n.get(k) is not None]
    if not fas:
        return
    total = sum(n[k] for k in fas)
    sat_over = n.get("satFat") is not None and n["satFat"] > fat + 0.05
    if total <= fat * FA_SUM_MAX + 0.05 and not sat_over:
        return
    if all(k in est for k in fas) and total > 0:
        f = fat * FA_SCALE_TO / total
        for k in fas + [k for k in FA_DETAIL if n.get(k) is not None and k in est]:
            n[k] = sig4(n[k] * f)
        notes.append(f"fatty acids: borrowed split rescaled x{f:.2f} to this food's total fat")
    elif sat_over or total > fat * FA_SUM_IMPLAUSIBLE + 0.05:
        # measured omega-3s (ala / epa / dha) are reported on their own and kept
        for k in fas:
            n.pop(k)
            if k in est:
                est.remove(k)
        notes.append("fatty acids: sat / mono / poly dropped, the source's split is inconsistent with its total fat")


def map_nutrients(row: dict[str, Any], est_cols: set[str] | None = None) -> tuple[dict[str, float], list[str], list[str]]:
    """Map one foodpipe row (column -> raw value) to (n, estimated_keys, notes).

    `est_cols` = foodpipe columns listed in `estimated_nutrients` or `filled_nutrients` (borrowed / estimated by foodpipe).
    A key is "estimated" when the column(s) its value came from are in that set (or when this function itself estimates).
    """
    est_cols = est_cols or set()
    g = {c: num(row.get(c)) for c in NUTRIENT_COLUMNS}
    n: dict[str, float] = {}
    est: list[str] = []
    notes: list[str] = []

    def mark(key: str, *cols: str) -> None:
        if any(c in est_cols for c in cols) and key not in est:
            est.append(key)

    # energy
    if g["energy_kcal"] is not None:
        n["kcal"] = g["energy_kcal"]
        mark("kcal", "energy_kcal")
    elif g["energy_kj"] is not None:
        n["kcal"] = g["energy_kj"] / 4.184
        notes.append("kcal from kJ / 4.184")
        mark("kcal", "energy_kj")

    for key, col in DIRECT.items():
        if g[col] is not None:
            n[key] = g[col]
            mark(key, col)

    # carbs: the app's carbs are TOTAL carbohydrate including fibre
    fib = g["fiber_g"] or 0.0
    if g["carbs_by_difference_g"] is not None:
        n["carbs"] = g["carbs_by_difference_g"]
        notes.append("carbs: by difference")
        mark("carbs", "carbs_by_difference_g")
    elif g["carbs_available_g"] is not None:
        n["carbs"] = g["carbs_available_g"] + fib
        notes.append("carbs: available + fiber")
        mark("carbs", "carbs_available_g", *(["fiber_g"] if g["fiber_g"] is not None else []))
    elif g["carbs_available_monosaccharide_g"] is not None:
        n["carbs"] = g["carbs_available_monosaccharide_g"] / 1.05 + fib
        notes.append("carbs: available (monosaccharide) / 1.05 + fiber")
        mark("carbs", "carbs_available_monosaccharide_g", *(["fiber_g"] if g["fiber_g"] is not None else []))

    # vitamin K
    if g["vitamin_k1_ug"] is not None:
        n["vitK"] = g["vitamin_k1_ug"]
        mark("vitK", "vitamin_k1_ug")
    elif g["vitamin_k_total_ug"] is not None:
        n["vitK"] = g["vitamin_k_total_ug"]
        notes.append("vitK: K1+MK-4 total (MEXT definition)")
        mark("vitK", "vitamin_k_total_ug")

    # folate (DFE)
    if g["folate_dfe_ug"] is not None:
        n["folate"] = g["folate_dfe_ug"]
        mark("folate", "folate_dfe_ug")
    elif g["folate_total_ug"] is not None and g["folic_acid_ug"] is not None:
        n["folate"] = max(0.0, g["folate_total_ug"] - g["folic_acid_ug"]) + 1.7 * g["folic_acid_ug"]
        notes.append("folate: DFE computed from total and folic acid")
        mark("folate", "folate_total_ug", "folic_acid_ug")
    elif g["folate_total_ug"] is not None:
        n["folate"] = g["folate_total_ug"]
        notes.append("folate: total folate used as DFE")
        if "folate" not in est:
            est.append("folate")

    reconcile_fatty_acids(n, est, notes)

    # linoleic acid (omega-6) is not in the source: estimate it from PUFA minus the known omega-3s.
    # Fish without EPA / DHA values is skipped: most of its PUFA is omega-3, so the estimate would call it omega-6.
    fish_without_o3 = row.get("food_group") == "fish_seafood" and (n.get("epa") is None or n.get("dha") is None)
    if n.get("pufa") is not None and not fish_without_o3:
        known = sum(n.get(k) or 0.0 for k in ("ala", "epa", "dha"))
        n["la"] = max(0.0, n["pufa"] - known)
        notes.append("la: estimated as pufa - (ala+epa+dha)")
        if "la" not in est:
            est.append("la")

    return n, est, notes


def pick_display(members: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Owner decision 1. Among the cluster's members that are active and on an edible-portion basis choose, in order:
    cnf, usda_fdc_sr_legacy, usda_fdc_foundation, the foodpipe-preferred member, any other member.
    Ties inside one rung: preferred first, then more non-empty nutrient columns, then food_id (deterministic)."""
    elig = [m for m in members if m.get("status") == "active" and m.get("basis") == EDIBLE_BASIS]
    if not elig:
        return None

    def rung(m: dict[str, Any]) -> int:
        s = m.get("source_id")
        if s in SOURCE_PRIORITY:
            return SOURCE_PRIORITY.index(s)
        return len(SOURCE_PRIORITY) if m.get("is_preferred") in (True, "True", "true") else len(SOURCE_PRIORITY) + 1

    def completeness(m: dict[str, Any]) -> int:
        return sum(1 for c in NUTRIENT_COLUMNS if num(m.get(c)) is not None)

    def has_energy(m: dict[str, Any]) -> bool:
        return num(m.get("energy_kcal")) is not None or num(m.get("energy_kj")) is not None

    elig.sort(key=lambda m: (rung(m), m.get("is_preferred") not in (True, "True", "true"), -completeness(m), m["food_id"]))
    # Deviation (documented in the report): a record with no energy value would be hidden as `no_kcal`; if the ladder lands on
    # one while another eligible member has energy, take the first member (still in ladder order) that has it.
    for m in elig:
        if has_energy(m):
            return m
    return elig[0]


def ref_of(food_id: str) -> str:
    """'cnf:2' -> '2' (the id inside the source database)."""
    return food_id.split(":", 1)[1] if ":" in food_id else food_id


def build_src(display: dict[str, Any], members: list[dict[str, Any]], donors: str) -> list[list[str]]:
    """[[db, ref], ...]: display record first, then the other active members, then donors of borrowed values."""
    out: list[list[str]] = [[display["source_citation"], ref_of(display["food_id"])]]
    seen = {(out[0][0], out[0][1])}
    for m in sorted((m for m in members if m["food_id"] != display["food_id"] and m.get("status") == "active"),
                    key=lambda m: m["food_id"]):
        k = (m["source_citation"], ref_of(m["food_id"]))
        if k not in seen:
            seen.add(k)
            out.append([k[0], k[1]])
    have = {db for db, _ in out}
    for d in [x.strip() for x in (donors or "").split(";") if x.strip()]:
        if d not in have:
            have.add(d)
            out.append([d, "gap-fill"])
    return out


def est_columns(row: dict[str, Any]) -> set[str]:
    cols: set[str] = set()
    for f in ("estimated_nutrients", "filled_nutrients"):
        cols.update((row.get(f) or "").split())
    return cols


def load_records(input_dir: str | Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read foodpipe-v1.0 and return (records, stats). One record per canonical cluster that has an eligible member:
    {canonical_id, display (raw row dict), n, estimated, notes, src, n_sources, n_members, name_original, ...}."""
    d = Path(input_dir)
    wide = pd.read_csv(d / "foods_wide.csv", dtype=str, keep_default_na=False)
    mem = pd.read_csv(d / "canonical_members.csv", dtype=str, keep_default_na=False)
    stats: dict[str, Any] = {"wide_rows": len(wide), "member_rows": len(mem)}
    wide_rows = {r["food_id"]: r for r in wide.to_dict("records")}
    mem = mem[mem["food_id"].isin(wide_rows)]
    records: list[dict[str, Any]] = []
    skipped_no_edible = 0
    by_cluster = mem.groupby("canonical_id", sort=True)["food_id"].apply(list)
    for cid, fids in by_cluster.items():
        members = [wide_rows[f] for f in fids]
        disp = pick_display(members)
        if disp is None:
            skipped_no_edible += 1
            continue
        n, est, notes = map_nutrients(disp, est_columns(disp))
        active = [m for m in members if m.get("status") == "active"]
        records.append({
            "canonical_id": cid,
            "food_id": disp["food_id"],
            "source_id": disp["source_id"],
            "name_en": disp["name_en"],
            "name_original": disp["name_original"],
            "food_group": disp["food_group"],
            "state": disp["state"],
            "country": disp["country"],
            "n": n,
            "estimated": est,
            "notes": notes,
            "src": build_src(disp, members, disp.get("filled_from_sources_cite_also", "")),
            "n_sources": len({m["source_id"] for m in active}),
            "n_members": len(active),
        })
    stats["clusters"] = int(by_cluster.shape[0])
    stats["clusters_without_edible_member"] = skipped_no_edible
    stats["records"] = len(records)
    return records, stats


def excluded_clusters(input_dir: str | Path) -> list[dict[str, str]]:
    """Clusters with no active, edible-portion member (reviewer condition): never shown, kept for the report."""
    d = Path(input_dir)
    wide = pd.read_csv(d / "foods_wide.csv", dtype=str, keep_default_na=False)
    mem = pd.read_csv(d / "canonical_members.csv", dtype=str, keep_default_na=False)
    w = wide.set_index("food_id")
    out: list[dict[str, str]] = []
    for cid, fids in mem.groupby("canonical_id", sort=True)["food_id"].apply(list).items():
        rows = [w.loc[f] for f in fids if f in w.index]
        if any(r["status"] == "active" and r["basis"] == EDIBLE_BASIS for r in rows):
            continue
        r0 = rows[0]
        why = "not_edible_portion_basis" if any(r["status"] == "active" for r in rows) else "superseded"
        basis = sorted({r["basis"] for r in rows})
        out.append({"canonical_id": cid, "name": r0["name_en"], "source": r0["source_id"], "reason": why, "basis": "; ".join(basis)})
    return out
