"""Deterministic 0-100 commonness score.  Higher = shown first.

score = clamp( common-list match + name simplicity + preferred form for the category + preferred / avoided words
               + multi-source bonus + source priority + category prior + nutrient completeness - penalties , 0, 100 )

Everything here is a constant or lives in config/preferred_forms.json, so the report can quote it.  The exported `rank` maps
the score into the tier band: everyday -> 50..100, extended -> 0..49 (so `rank >= 50` in the app means "everyday").
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .names_en import head_key
from .tiers import count_board

CONFIG = Path(__file__).resolve().parent.parent / "config"

W_COMMON_HEAD = 24          # head is on the curated list
W_COMMON_FORM = 10          # ... and the form is the one the list prefers (or the list has no preference)
W_COMMON_OTHER_FORM = 3     # head on the list but not the preferred form
W_COMMON_POSITION = 14      # earlier in the list = more common (linear, 0..14)
W_PREFER = 6                # per "prefer" word / phrase in the name, at most two (config/preferred_forms.json, everyday_heads.txt)
W_AVOID = 8                 # an "avoid" word is in the name (at most two hits count)
PEN_VARIETY = 4             # per qualifier part that is a variety/cultivar rather than a state or generic descriptor
PEN_DISH_FOR_PLAIN_HEAD = 6 # a dish where the head is not itself a dish on the list
SIMPLICITY_MAX = 12         # 12 - 2.5 per comma - 0.5 per word beyond 3 - 4 per variety, floor -8
FORM_BONUS = 6              # first preferred form of the category (or head); second preferred form gets half
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


class Prefs:
    """config/preferred_forms.json + the `prefer` column of everyday_heads.txt."""

    def __init__(self, cfg: dict[str, Any] | None = None, head_prefer: dict[str, list[str]] | None = None):
        cfg = cfg if cfg is not None else json.loads((CONFIG / "preferred_forms.json").read_text(encoding="utf-8"))
        self.category_forms: dict[str, list[str]] = cfg.get("category_forms", {})
        self.category_words: dict[str, dict[str, list[str]]] = cfg.get("category_words", {})
        self.generic_avoid: list[str] = cfg.get("generic_avoid", [])
        self.heads: dict[str, dict[str, Any]] = {head_key(k): v for k, v in cfg.get("heads", {}).items()}
        for h, words in (head_prefer or {}).items():
            d = self.heads.setdefault(head_key(h), {})
            d["prefer"] = list(dict.fromkeys(list(d.get("prefer", [])) + words))
        self._rx: dict[str, re.Pattern] = {}

    def _has(self, name: str, words: list[str]) -> int:
        n = 0
        for w in words:
            rx = self._rx.get(w)
            if rx is None:
                rx = self._rx[w] = re.compile(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", re.I)
            if rx.search(name):
                n += 1
        return n

    def forms_for(self, head: str, category: str) -> list[str]:
        h = self.heads.get(head_key(head), {})
        return h.get("forms") or self.category_forms.get(category, [])

    def word_adjust(self, name: str, head: str, category: str) -> float:
        low = name.lower()
        h = self.heads.get(head_key(head), {})
        cw = self.category_words.get(category, {})
        prefer = list(h.get("prefer", [])) + list(cw.get("prefer", []))
        avoid = list(h.get("avoid", [])) + list(cw.get("avoid", []))
        hk = head_key(head).split()
        avoid += [w for w in self.generic_avoid if head_key(w) not in hk]
        # a word that is part of the head ("pizza dough", "cocoa powder") is never an avoid word for that head
        avoid = [w for w in avoid if head_key(w) not in hk]
        s = 0.0
        if prefer:
            s += W_PREFER * min(2, self._has(low, prefer))
        s -= W_AVOID * min(2, self._has(low, avoid))
        return s


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


def score(rec: dict[str, Any], common_pos: dict[str, tuple[int, set[str]]], n_common: int, prefs: Prefs | None = None) -> float:
    """rec: head, form, name, category, n, n_sources, source_id, ext_reasons, ultra.  common_pos keys are head keys."""
    prefs = prefs or Prefs()
    s = 0.0
    h = rec["head"]
    hk = head_key(h)
    on_list_as_dish = False
    if hk in common_pos:
        pos, forms = common_pos[hk]
        s += W_COMMON_HEAD + W_COMMON_POSITION * (1 - pos / max(1, n_common))
        if not forms or rec["form"] in forms:
            s += W_COMMON_FORM
        else:
            s += W_COMMON_OTHER_FORM
        on_list_as_dish = "dish" in forms
    s += simplicity(rec["name"])
    pf = prefs.forms_for(h, rec["category"])
    if pf and rec["form"] == pf[0]:
        s += FORM_BONUS
    elif len(pf) > 1 and rec["form"] == pf[1]:
        s += FORM_BONUS / 2
    s += prefs.word_adjust(rec["name"], h, rec["category"])
    if rec["form"] == "dish" and rec["category"] not in {"prepared"} and not on_list_as_dish:
        s -= PEN_DISH_FOR_PLAIN_HEAD
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
