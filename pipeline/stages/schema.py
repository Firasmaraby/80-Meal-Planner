"""Canonical schema, mirrored from src/engine/types.ts and src/engine/nutrients.ts.

tests/test_schema_sync.py parses the TypeScript files and fails if this module drifts from them.
"""
from __future__ import annotations

# Order follows the NutrientKey union in types.ts.
NUTRIENT_KEYS: list[str] = [
    "kcal", "protein", "carbs", "fiber", "sugar", "fat", "satFat", "mufa", "pufa",
    "ala", "epa", "dha", "la",
    "vitA", "vitC", "vitD", "vitE", "vitK",
    "b1", "b2", "b3", "b5", "b6", "b7", "folate", "b12", "choline",
    "calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "copper",
    "manganese", "selenium", "iodine", "sodium",
]

# Canonical unit per nutrient (per 100 g edible portion), from NUTRIENTS[...].unit.
CANONICAL_UNIT: dict[str, str] = {
    "kcal": "kcal",
    **{k: "g" for k in ["protein", "carbs", "fiber", "sugar", "fat", "satFat", "mufa", "pufa", "ala", "epa", "dha", "la"]},
    "vitA": "µg", "vitC": "mg", "vitD": "µg", "vitE": "mg", "vitK": "µg",
    "b1": "mg", "b2": "mg", "b3": "mg", "b5": "mg", "b6": "mg", "b7": "µg",
    "folate": "µg", "b12": "µg", "choline": "mg",
    "calcium": "mg", "iron": "mg", "magnesium": "mg", "phosphorus": "mg", "potassium": "mg",
    "zinc": "mg", "copper": "mg", "manganese": "mg", "selenium": "µg", "iodine": "µg", "sodium": "mg",
}

CATEGORIES: list[str] = [
    "fruit", "vegetable", "legume", "grain", "nut_seed", "dairy", "egg", "meat", "poultry",
    "fish", "oil_fat", "beverage", "condiment", "sweet", "prepared", "other",
]

TAGS: list[str] = ["fatty_fish", "leafy_green", "whole_grain", "plant_iron", "fermented", "processed"]

# Exact set of keys a Food object may carry (types.ts `Food`).
FOOD_KEYS_REQUIRED = {"id", "name", "category", "n", "src"}
FOOD_KEYS_OPTIONAL = {"aliases", "tags", "gi", "servings", "rare", "rank", "head", "form", "tier", "estimated", "legacyIds"}
FOOD_KEYS = FOOD_KEYS_REQUIRED | FOOD_KEYS_OPTIONAL

# Nutrient groups used by plausibility checks (all canonical unit g unless noted).
GRAM_KEYS = [k for k, u in CANONICAL_UNIT.items() if u == "g"]
MACRO_KEYS_FOR_VECTOR = ["kcal", "protein", "carbs", "fat", "fiber"]  # dedupe cosine check
