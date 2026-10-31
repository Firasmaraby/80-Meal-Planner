#!/usr/bin/env python3
"""Independent spot-check: random app foods against the raw foodpipe rows, with its own (re-written, not imported)
nutrient mapping. Values foodpipe or the adapter estimated (borrowed, rescaled, la) are skipped; everything else must
match to rounding.   python3 pipeline/consumer/spot_check.py [n] [seed]"""
import csv
import json
import random
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WIDE = REPO / "pipeline" / "input" / "foodpipe-v1.0" / "foods_wide.csv"
COLS = {"kcal": "energy_kcal", "protein": "protein_g", "fat": "fat_g", "fiber": "fiber_g", "sugar": "sugars_g", "satFat": "sat_fat_g",
        "mufa": "mono_fat_g", "pufa": "poly_fat_g", "ala": "omega3_ala_g", "epa": "omega3_epa_g", "dha": "omega3_dha_g",
        "vitA": "vitamin_a_rae_ug", "vitC": "vitamin_c_mg", "vitD": "vitamin_d_ug", "vitE": "vitamin_e_mg", "b1": "thiamin_b1_mg",
        "b2": "riboflavin_b2_mg", "b3": "niacin_b3_mg", "b5": "pantothenic_acid_b5_mg", "b6": "vitamin_b6_mg", "b7": "biotin_ug",
        "b12": "vitamin_b12_ug", "choline": "choline_mg", "calcium": "calcium_mg", "iron": "iron_mg", "magnesium": "magnesium_mg",
        "phosphorus": "phosphorus_mg", "potassium": "potassium_mg", "zinc": "zinc_mg", "copper": "copper_mg",
        "manganese": "manganese_mg", "selenium": "selenium_ug", "iodine": "iodine_ug", "sodium": "sodium_mg"}


def num(r, c):
    try:
        return float(r.get(c, ""))
    except ValueError:
        return None


def main(n=60, seed=7):
    bundle = json.loads((REPO / "src" / "data" / "foods.everyday.json").read_text(encoding="utf-8"))
    keys, dbs = bundle["keys"], bundle["dbs"]
    wide = {(r["source_citation"], r["food_id"].split(":", 1)[-1]): r for r in csv.DictReader(WIDE.open(encoding="utf-8"))}
    random.seed(seed)
    sample = random.sample([f for f in bundle["foods"] if f[9][0][1] != "gap-fill"], n)
    bad = checked = 0
    for f in sample:
        row = wide.get((dbs[f[9][0][0]], f[9][0][1]))
        if row is None:
            print("no source row:", f[1]); bad += 1; continue
        app = dict(zip(keys, f[11]))
        for k, col in COLS.items():
            if k in f[10]:
                continue                      # estimated / rescaled: not a copy of the source
            v, got = num(row, col), app.get(k)
            if k == "kcal" and v is None and num(row, "energy_kj") is not None:
                v = num(row, "energy_kj") / 4.184
            if k in ("satFat", "mufa", "pufa") and got is None:
                continue                      # dropped as inconsistent with total fat (adapter.reconcile_fatty_acids)
            checked += 1
            if (v is None) != (got is None) or (v is not None and abs(v - got) > max(0.0006 * abs(v), 0.0015)):
                bad += 1
                print(f"{f[1]!r} {k}: source={v} app={got}")
    print(f"{n} foods, {checked} values compared, {bad} mismatches")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(*(int(a) for a in sys.argv[1:3])))
