"""Deterministic 0-100 commonness score.  Higher = shown first.

score = clamp( common-list match + name simplicity + good form for the category + multi-source bonus + source priority
               + category prior + nutrient completeness - penalties , 0, 100 )

Everything here is a constant so the report can quote it.  The exported `rank` maps the score into the tier band:
everyday -> 50..100, extended -> 0..49 (so `rank >= 50` in the app means "everyday").
"""
from __future__ import annotations

import re
from typing import Any

from .tiers import count_board

W_COMMON_HEAD = 24          # head is on the curated list
W_COMMON_FORM = 10          # ... and the form is the one the list prefers (or the list has no preference)
W_COMMON_OTHER_FORM = 3     # head on the list but not the preferred form
W_COMMON_POSITION = 14      # earlier in the list = more common (linear, 0..14)
W_PREFER = 8                # the list's "prefer" words appear in the name (e.g. milk -> "whole")
PEN_VARIETY = 4             # per qualifier part that is a variety/cultivar rather than a state or generic descriptor
SIMPLICITY_MAX = 12         # 12 - 3 per comma - 0.5 per word beyond 3, floor -8
FORM_BONUS = 6              # raw for fruit/veg, cooked for meat/grain/legume ...
SOURCE_BONUS_PER_EXTRA = 2  # per additional source in the cluster, up to 4 extra
SOURCE_PRIORITY_BONUS = {"cnf": 5, "usda_fdc_sr_legacy": 5, "usda_fdc_foundation": 4, "ciqual": 2, "cofid": 2, "afcd": 1}
CATEGORY_PRIOR = {"fruit": 10, "vegetable": 10, "legume": 9, "grain": 9, "nut_seed": 9, "dairy": 8, "egg": 9, "meat": 8,
                  "poultry": 9, "fish": 8, "oil_fat": 6, "beverage": 4, "condiment": 3, "sweet": -4, "prepared": -4, "other": 0}
PEN_BRANDED = 30
PEN_FAST_FOOD = 25
PEN_HERITAGE = 25
PEN_ORGAN_GAME = 20
PEN_ULTRA = 10
PEN_LONG_NAME_8 = 4
PEN_LONG_NAME_12 = 8
PEN_DIGITS = 2
PEN_SPARSE_PER_MISSING = 0.7   # per missing board nutrient below 12

GOOD_FORM = {"fruit": {"raw"}, "vegetable": {"raw"}, "meat": {"cooked"}, "poultry": {"cooked"}, "fish": {"cooked", "raw"},
             "grain": {"cooked", "dried"}, "legume": {"cooked"}, "egg": {"raw", "cooked"}, "nut_seed": {"raw", "dried"},
             "dairy": {"product", "raw"}, "oil_fat": {"product"}, "beverage": {"product", "juice"}}


_GENERIC_QUALIFIER = re.compile(
    r"^(?:raw|cooked|boiled|roasted|baked|fried|grilled|broiled|steamed|braised|stewed|simmered|dried|dry|canned|frozen|"
    r"with skin|without skin|skinless|boneless|lean|lean and fat|whole|plain|unsweetened|sweetened|salted|unsalted|"
    r"drained|peeled|unpeeled|sliced|chopped|ground|fresh|ripe|green|red|white|yellow|brown|black|"
    r"dark|light|nonfat|low-fat|reduced fat|regular|flesh|seedless|pitted|shelled|extra virgin|refined|"
    r"stir-fried|pan-fried|deep-fried|toasted|smoked|pickled|unprepared|prepared|homemade|enriched|unenriched|"
    r"whole grain|long-grain|medium-grain|short-grain|boiled/steamed|cooked with water|with salt|"
    r"(?:\d+(?:\.\d+)?%.*)|(?:with|without) .*|(?:no|not) .*)$", re.I)


def varieties(name: str) -> int:
    """Number of qualifier parts after the head that are varieties / cultivars (baby, Granny Smith, mature ...)."""
    parts = [p.strip() for p in name.split(",")][1:]
    return sum(1 for p in parts if p and not _GENERIC_QUALIFIER.match(p))


def simplicity(name: str) -> float:
    commas = name.count(",")
    words = len(name.split())
    return max(-8.0, SIMPLICITY_MAX - 2.5 * commas - 0.5 * max(0, words - 3) - PEN_VARIETY * varieties(name))


def score(rec: dict[str, Any], common_pos: dict[str, tuple[int, set[str]]], n_common: int,
          prefer: dict[str, list[str]] | None = None) -> float:
    """rec: head, form, name, category, n, n_sources, source_id, branded, ext_reasons, ultra."""
    s = 0.0
    h = rec["head"]
    if h in common_pos:
        pos, forms = common_pos[h]
        s += W_COMMON_HEAD + W_COMMON_POSITION * (1 - pos / max(1, n_common))
        if not forms or rec["form"] in forms:
            s += W_COMMON_FORM
        else:
            s += W_COMMON_OTHER_FORM
        words = (prefer or {}).get(h)
        if words and any(w in rec["name"].lower() for w in words):
            s += W_PREFER
    s += simplicity(rec["name"])
    if rec["form"] in GOOD_FORM.get(rec["category"], set()):
        s += FORM_BONUS
    s += SOURCE_BONUS_PER_EXTRA * min(4, max(0, rec["n_sources"] - 1))
    s += SOURCE_PRIORITY_BONUS.get(rec["source_id"], 0)
    s += CATEGORY_PRIOR.get(rec["category"], 0)
    ext = set(rec.get("ext_reasons", []))
    if "branded" in ext:
        s -= PEN_BRANDED
    if "fast_food" in ext:
        s -= PEN_FAST_FOOD
    if "heritage_regional" in ext:
        s -= PEN_HERITAGE
    if ext & {"organ_meat", "game_meat"}:
        s -= PEN_ORGAN_GAME
    if rec.get("ultra"):
        s -= PEN_ULTRA
    w = len(rec["name"].split())
    if w > 12:
        s -= PEN_LONG_NAME_12
    elif w > 8:
        s -= PEN_LONG_NAME_8
    if re.search(r"\d", rec["name"]):
        s -= PEN_DIGITS
    nb = count_board(rec["n"])
    if nb < 12:
        s -= PEN_SPARSE_PER_MISSING * (12 - nb)
    return max(0.0, min(100.0, s))


def to_rank(score_: float, tier: str) -> int:
    """Map the 0-100 score into the tier band (see module docstring)."""
    if tier == "everyday":
        return int(round(50 + score_ * 0.5))
    return int(round(min(49.0, score_ * 0.49)))
