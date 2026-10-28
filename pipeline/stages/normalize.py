"""Stage 2 - normalize: raw (value, unit) rows -> canonical units, with plausibility filtering.

Canonical units are the ones in src/engine/nutrients.ts (kcal, g, mg, µg per 100 g).

Conversion policy (the part that is easy to get wrong - read this before changing anything)
-------------------------------------------------------------------------------------------
* kJ -> kcal: divide by 4.184 (thermochemical calorie). "cal" (ambiguous small/large calorie) is unsafe -> null.
* Plain mass units (g, mg, µg/mcg/ug, ng, kg) convert by powers of 1000.
* Vitamin D: IU -> µg by dividing by 40 (1 IU = 0.025 µg), valid for both D2 and D3.
* Vitamin A is SOURCE-DEPENDENT. The canonical unit is µg RAE (retinol activity equivalents).
    - "µg RAE" is taken as-is.
    - IU is ambiguous because the conversion depends on what the IU was computed from:
        IU(retinol)        1 IU = 0.3 µg RAE   (animal foods, retinol-based IU)               exact
        IU(beta_carotene)  1 IU = 0.05 µg RAE  (0.6 µg beta-carotene / 12 for food carotene)   approximate
      Plain "IU", "µg RE" (retinol equivalents: a different carotene factor) and a bare "µg" are NOT convertible
      safely: the value is dropped (reported as unsafe_conversion) and stays NULL. If the same source also gives
      RAE, map that column instead (USDA SR does: Vit_A_RAE). To opt in to an IU conversion, state the basis in
      the source mapping's unit, e.g. "unit": "IU(retinol)".
* Vitamin E is alpha-tocopherol in mg. "mg" is taken as-is. "mg α-TE" (alpha-tocopherol equivalents) is accepted
  as approximately equal (flagged approx, never used to fill other records). IU needs a basis
  (IU(natural) 0.67 mg, IU(synthetic) 0.45 mg) otherwise it is unsafe.
* Folate canonical unit is µg DFE. Foods that are not fortified with folic acid have DFE == food folate, so a plain
  "µg" folate column is treated as DFE. "µg total folate" is accepted but flagged approx (total folate understates DFE
  when folic acid is present). If a source gives food folate AND folic acid, build DFE in the mapping with
  {"sum": [{"column": "food_folate"}, {"column": "folic_acid", "factor": 1.7, "optional": true}]}.
* Niacin: "mg NE" (niacin equivalents, includes tryptophan/60) is NOT niacin -> unsafe -> null.
* Sodium may be given as salt: "g NaCl" -> mg sodium (x 393.4).
* Missing stays missing (NaN). Nothing is ever turned into 0.

Plausibility (values dropped, each with a report row)
-----------------------------------------------------
negative values; any gram-unit nutrient > 100 g per 100 g (small tolerance); kcal > 950; per-nutrient generous
maxima (PLAUSIBLE_MAX); protein+fat+carbs > 110 g; sub-components larger than their parent (sugar > carbs, fatty acid
classes > fat, individual omega fatty acids > PUFA).
"""
from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd

from .report import Log
from .schema import CANONICAL_UNIT, GRAM_KEYS, NUTRIENT_KEYS

KJ_PER_KCAL = 4.184
MASS_G = {"g": 1.0, "mg": 1e-3, "ug": 1e-6, "ng": 1e-9, "kg": 1e3}
CANON_TOKEN = {"g": "g", "mg": "mg", "µg": "ug", "kcal": "kcal"}

# generous upper bounds per 100 g in canonical units (above this the value is a data error, not a food)
PLAUSIBLE_MAX: dict[str, float] = {
    "kcal": 950.0,
    "vitA": 100000.0, "vitC": 5000.0, "vitD": 3000.0, "vitE": 1500.0, "vitK": 5000.0,
    "b1": 50.0, "b2": 60.0, "b3": 200.0, "b5": 60.0, "b6": 60.0, "b7": 1000.0, "folate": 6000.0,
    "b12": 1000.0, "choline": 4000.0,
    "calcium": 20000.0, "iron": 250.0, "magnesium": 2000.0, "phosphorus": 4000.0, "potassium": 25000.0,
    "zinc": 200.0, "copper": 50.0, "manganese": 120.0, "selenium": 4000.0, "iodine": 500000.0, "sodium": 40500.0,
}
G_TOLERANCE = 0.5  # rounding slack for "more than 100 g"
PARENT_TOLERANCE = 0.5
SUBCOMPONENTS = [
    ("sugar", "carbs"), ("satFat", "fat"), ("mufa", "fat"), ("pufa", "fat"),
    ("la", "pufa"), ("ala", "pufa"), ("epa", "pufa"), ("dha", "pufa"),
]

# nutrient -> {unit token: (factor to canonical unit, approx flag)}; None factor = unsafe (null + report)
SPECIAL: dict[str, dict[str, tuple[float | None, bool]]] = {
    "kcal": {"kcal": (1.0, False), "kj": (1.0 / KJ_PER_KCAL, False), "mj": (1000.0 / KJ_PER_KCAL, False),
             "cal": (None, False)},
    "vitA": {"ugrae": (1.0, False), "iu(retinol)": (0.3, False), "iu(betacarotene)": (0.05, True),
             "iu": (None, False), "ugre": (None, False), "ug": (None, False), "mg": (None, False)},
    "vitD": {"iu": (0.025, False)},
    "vitE": {"mgate": (1.0, True), "iu(natural)": (0.67, True), "iu(synthetic)": (0.45, True), "iu": (None, False)},
    "folate": {"ugdfe": (1.0, False), "ugfood": (1.0, False), "ugfoodfolate": (1.0, False),
              "ugtotal": (1.0, True), "ugtotalfolate": (1.0, True)},
    "b3": {"mgne": (None, False)},
    "sodium": {"gnacl": (393.4, False)},
}

_UNIT_WORDS = {
    "kilojoules": "kj", "kilojoule": "kj", "kilocalories": "kcal", "kilocalorie": "kcal", "kcalories": "kcal",
    "gram": "g", "grams": "g", "milligram": "mg", "milligrams": "mg", "microgram": "ug", "micrograms": "ug",
    "gsalt": "gnacl", "gsodiumchloride": "gnacl",
}


def unit_token(u: Any) -> str:
    """'µg RAE' -> 'ugrae', 'mcg' -> 'ug', 'kJ' -> 'kj', 'IU (beta_carotene)' -> 'iu(betacarotene)',
    'mg α-TE' -> 'mgate', 'g NaCl' -> 'gnacl'."""
    if u is None or (isinstance(u, float) and math.isnan(u)):
        return ""
    t = str(u).lower().replace("µ", "u").replace("μ", "u").replace("α", "a")
    t = re.sub(r"(/|per)\s*100\s*g(rams?)?$", "", t)
    t = re.sub(r"[\s_\-.]+", "", t)
    t = t.replace("mcg", "ug")
    return _UNIT_WORDS.get(t, t)


def conversion(nutrient: str, unit: Any) -> tuple[float | None, bool, str]:
    """-> (factor or None, approx, status). status: ok | unsafe_conversion | incompatible_unit | unknown_unit."""
    tok = unit_token(unit)
    canon_tok = CANON_TOKEN[CANONICAL_UNIT[nutrient]]
    if tok == "":
        return 1.0, False, "ok"  # unit absent: ingest already defaulted to canonical; treat as canonical
    sp = SPECIAL.get(nutrient, {})
    if tok in sp:
        f, approx = sp[tok]
        return (f, approx, "ok") if f is not None else (None, False, "unsafe_conversion")
    if tok == canon_tok:
        return 1.0, False, "ok"
    if tok in MASS_G and canon_tok in MASS_G:
        return MASS_G[tok] / MASS_G[canon_tok], False, "ok"
    if tok.startswith("iu"):
        return None, False, "unsafe_conversion"
    if tok in ("kj", "kcal", "mj", "cal") or tok in MASS_G or tok in ("%", "ml"):
        return None, False, "incompatible_unit"
    return None, False, "unknown_unit"


def _drop_rows(dropped: list[pd.DataFrame], rows: pd.DataFrame, reason: str, log: Log) -> None:
    if rows.empty:
        return
    d = pd.DataFrame({
        "source": rows["source"].to_numpy(), "uid": rows["uid"].to_numpy(), "nutrient": rows["nutrient"].to_numpy(),
        "value": rows["value"].to_numpy(), "raw_value": rows["raw_value"].to_numpy(),
        "raw_unit": rows["raw_unit"].to_numpy(), "reason": reason,
    })
    dropped.append(d)
    for (src, nut), n in rows.groupby(["source", "nutrient"]).size().items():
        log.add("normalize", "drop_value", reason, source=src, detail=nut, n=int(n))


NORM_COLUMNS = ["source", "source_id", "uid", "nutrient", "value", "unit", "approx", "raw_value", "raw_unit", "prio"]
DROP_COLUMNS = ["source", "uid", "nutrient", "value", "raw_value", "raw_unit", "reason"]


def normalize(long: pd.DataFrame, log: Log | None = None, plausible_max: dict[str, float] | None = None,
              g_tolerance: float = G_TOLERANCE) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pure: raw long rows -> (canonical long rows, dropped-values table)."""
    log = log or Log()
    pmax = {**PLAUSIBLE_MAX, **(plausible_max or {})}
    dropped: list[pd.DataFrame] = []
    if long.empty:
        return pd.DataFrame(columns=NORM_COLUMNS), pd.DataFrame(columns=DROP_COLUMNS)

    df = long.copy()
    df["raw_value"] = df["value"].astype(float)
    df["raw_unit"] = df["unit"].fillna("").astype(str)
    if "prio" not in df:
        df["prio"] = 0

    # unit conversion (computed once per unique (nutrient, unit) pair)
    pairs = df[["nutrient", "raw_unit"]].drop_duplicates()
    table = {}
    for nut, u in zip(pairs["nutrient"], pairs["raw_unit"]):
        table[(nut, u)] = (None, False, "unknown_nutrient") if nut not in CANONICAL_UNIT else conversion(nut, u)
    keys = list(zip(df["nutrient"], df["raw_unit"]))
    factors = np.array([np.nan if table[k][0] is None else table[k][0] for k in keys], dtype=float)
    status = np.array([table[k][2] for k in keys], dtype=object)
    df["approx"] = np.array([table[k][1] for k in keys], dtype=bool)
    bad = np.isnan(factors)
    if bad.any():
        # a convertible alternative for the same (food, nutrient) makes the unsafe row irrelevant (e.g. RAE present,
        # IU not convertible): count it as info, not as a data loss
        good_keys = set(zip(df["uid"].to_numpy()[~bad], df["nutrient"].to_numpy()[~bad]))
        superseded = np.array([(u, n) in good_keys for u, n in zip(df["uid"].to_numpy(), df["nutrient"].to_numpy())])
        n_sup = int((bad & superseded).sum())
        if n_sup:
            log.add("normalize", "info", "unsafe_rows_superseded_by_alternative_column", n=n_sup)
        real_bad = bad & ~superseded
        for reason in sorted(set(status[real_bad])):
            _drop_rows(dropped, df[real_bad & (status == reason)], reason, log)
    df = df[~bad].copy()
    df["value"] = df["raw_value"].to_numpy() * factors[~bad]
    df["unit"] = df["nutrient"].map(CANONICAL_UNIT)

    # one value per (food, nutrient): lowest prio first, exact before approximate
    df = df[df["value"].notna()]
    df = df.sort_values(["prio", "approx"], kind="stable")
    dup = df.duplicated(["uid", "nutrient"], keep="first")
    if dup.any():
        log.add("normalize", "info", "duplicate_nutrient_rows_ignored", n=int(dup.sum()))
    df = df[~dup]

    # --- plausibility ---
    neg = df["value"] < 0
    _drop_rows(dropped, df[neg], "negative_value", log)
    df = df[~neg]

    over_g = df["nutrient"].isin(GRAM_KEYS) & (df["value"] > 100.0 + g_tolerance)
    _drop_rows(dropped, df[over_g], "exceeds_100g_per_100g", log)
    df = df[~over_g]

    cap = df["nutrient"].map(pmax)
    over = cap.notna() & (df["value"] > cap)
    _drop_rows(dropped, df[over], "implausible_magnitude", log)
    df = df[~over]

    # protein + fat + carbs cannot exceed ~100 g
    macro = df[df["nutrient"].isin(["protein", "fat", "carbs"])]
    if not macro.empty:
        tot = macro.pivot(index="uid", columns="nutrient", values="value").fillna(0.0).sum(axis=1)
        bad_uids = set(tot[tot > 110.0].index)
        if bad_uids:
            m = df["uid"].isin(bad_uids) & df["nutrient"].isin(["protein", "fat", "carbs"])
            _drop_rows(dropped, df[m], "macro_sum_exceeds_100g", log)
            df = df[~m]

    # sub-component larger than its parent
    for sub, parent in SUBCOMPONENTS:
        s = df[df["nutrient"] == sub].set_index("uid")["value"]
        p = df[df["nutrient"] == parent].set_index("uid")["value"]
        if s.empty or p.empty:
            continue
        j = s.to_frame("s").join(p.rename("p"), how="inner")
        bad_uids = set(j[j["s"] > j["p"] + PARENT_TOLERANCE].index)
        if bad_uids:
            m = (df["nutrient"] == sub) & df["uid"].isin(bad_uids)
            _drop_rows(dropped, df[m], f"{sub}_exceeds_{parent}", log)
            df = df[~m]

    df["value"] = df["value"].round(6)
    out = df[NORM_COLUMNS].reset_index(drop=True)
    drop_df = pd.concat(dropped, ignore_index=True)[DROP_COLUMNS] if dropped else pd.DataFrame(columns=DROP_COLUMNS)
    return out, drop_df


def to_wide(items: pd.DataFrame, long_norm: pd.DataFrame) -> pd.DataFrame:
    """items + canonical long -> one row per item with a float column per NutrientKey (NaN = no data)."""
    if long_norm.empty:
        wide = pd.DataFrame(index=pd.Index([], name="uid"))
    else:
        wide = long_norm.pivot(index="uid", columns="nutrient", values="value")
    wide = wide.reindex(columns=NUTRIENT_KEYS).astype(float)
    out = items.merge(wide, how="left", left_on="uid", right_index=True)
    ap = long_norm[long_norm["approx"]] if not long_norm.empty else long_norm
    amap = ap.groupby("uid")["nutrient"].agg(lambda x: ",".join(sorted(x))).to_dict() if not ap.empty else {}
    out["approx_keys"] = out["uid"].map(lambda u: amap.get(u, ""))
    return out.reset_index(drop=True)
