"""Hidden / extended rules and the (head, form) everyday selection.

hidden   never shown (reason code kept in the report)
extended searchable, ranked lower
everyday shown first; the plan-writing AI only sees these (~3,000)

Every rule is a named regex so the report can say why a food landed where it did.
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from .adapter import BOARD_KEYS

# ------------------------------------------------------------------ hidden
HIDDEN_RULES: list[tuple[str, re.Pattern]] = [(code, re.compile(rx, re.I)) for code, rx in [
    ("baby_food", r"babyfood|baby food|\binfants?\b|\bformula\b|\btoddler|follow-?on|weaning|\bbaby (?:cereal|biscuit|rusk)"),
    ("supplement", r"meal[- ]replacement|\bsupplements?\b|protein (?:powder|shake|drink|supplement|isolate|concentrate)|"
                   r"\bwhey\b.*\bprotein|\bwhey protein|(?:nutrition(?:al)?|protein|diet|weight[- ]loss) (?:shake|powder|drink|beverage)s?\b|"
                   r"\bensure\b|\bslim-?fast\b|muscle milk|premier protein|\bboost\b|\bglucerna\b|\bherbalife\b|\bisagenix\b|"
                   r"\bshakeology\b|\bmedical food|\benteral\b|tube feeding|energy drink|sports? (?:drink|beverage)|"
                   r"\b(?:gatorade|powerade|red bull|monster energy|rockstar|full throttle|amp energy|vitaminwater)\b|"
                   r"sports? (?:nutrition|bar)|\bgel packs?\b|electrolyte|oral rehydration|pedialyte|\bcreatine\b|\bamino acids?\b "
                   r"(?:supplement|powder)|\bprotein bar\b|sport(?:s)? beverage|\bformulated bar\b|nutrition bar|\bvitamin (?:tablet|capsule)"),
    ("non_food", r"\bbrewer'?s? yeast\b|yeast for brew|\bgelatin capsules?\b|\bcapsules?\b|\bpet foods?\b|\bdog foods?\b|\bcat foods?\b|"
                 r"\bindustrial\b|for food ?service|\bfood ?service\b|household use|\bbulk\b|\bwholesale\b|for further processing|"
                 r"for manufactur|\binstitutional\b|\blab(?:oratory)? sample|test sample|\bplaceholder\b|\bdummy\b|do not use|"
                 r"\bnot a food\b|\bfood additive\b|\bnon-?food\b|\banimal feed\b|\bfeed grade\b|\bfertilizer\b|"
                 r"\bbaking chocolate, unsweetened, liquid\b"),
]]

# ------------------------------------------------------------------ extended-only (never everyday)
EXTENDED_RULES: list[tuple[str, re.Pattern]] = [(code, re.compile(rx, re.I)) for code, rx in [
    ("fast_food", r"\bfast foods?\b|^restaurant\b|\brestaurant[,\s]|\bcarry-?out\b|\btakeout\b"),
    ("heritage_regional", r"alaska(?:n)? native|northern plains|navajo|hopi|apache|shoshone|bannock|\bpima\b|pueblo|inuit|maori|"
                          r"oglala|lakota|sioux|cherokee|\bcree\b|haida|tlingit|yupik|eskimo|aboriginal|pacific northwest|"
                          r"southwest indian|wild plant|nunavut|bush tucker|indigenous|muktuk|akutaq|fry bread|first nations|"
                          r"\bnative\b.*\b(?:indian|american)\b|\bhawaii(?:an)? native\b|\bpoi\b"),
    ("organ_meat", r"\b(?:hearts?|kidneys?|tongue|tripe|brains?|spleen|lungs?|pancreas|thymus|sweetbreads?|intestines?|"
                   r"stomach|testes|gizzards?|giblets?|feet|trotters?|blood|udder|cheeks?|lips?|snout|ears?|heads?|chitterlings?|"
                   r"offal|variety meats?|liver sausage|pate|pâté|foie gras|lard|bone marrow|caul fat|skin only|fat only|"
                   r"bones?|neck bones|oxtail|tail|knuckles?|cartilage)\b"),
    ("game_meat", r"\b(?:game|bison|buffalo|venison|elk|moose|caribou|reindeer|deer|antelope|rabbit|hare|wild boar|boar|"
                  r"squirrel|opossum|possum|beaver|bear|muskrat|raccoon|ostrich|emu|kangaroo|horse|camel|seal|whale|walrus|"
                  r"pheasant|partridge|grouse|pigeon|squab|goose|guinea|snail|frog|alligator|turtle|insect|cricket|"
                  r"ptarmigan|porcupine|woodchuck|wallaby|crocodile|quail|mutton)\b"),
]]
# only these organ meats are allowed (liver is the one the framework wants)
ORGAN_OK = re.compile(r"\bliver\b(?! sausage)|\bliverwurst\b", re.I)

ULTRA_RX = re.compile(
    r"\bsoft drinks?\b|\bcarbonated\b|\bcola\b|\bsoda\b|kool-?aid|\bpunch\b|\bdrink mix|\bimitation\b|non-?dairy creamer|"
    r"whipped topping|toaster pastr|pop-?tarts?|frosted|sugar[- ]coated|cream[- ]filled|\bcandy\b|\bcandies\b|"
    r"\bsnack cake|\bcheese puffs?|\bcheese curls?|corn chips|potato chips|tortilla chips|\bcrisps\b|instant noodles?|"
    r"cup noodles|hot dogs?|\bfrankfurters?\b|bologna|\bspam\b|luncheon meat|\bnuggets?\b|\bfish sticks?\b|\bcorn dogs?\b|"
    r"pizza rolls|\bhot pockets|frozen (?:dinner|entree)|\bTV dinner|\bpudding cups?\b|\bgelatin dessert|\bpopsicle|"
    r"\bsprinkles\b|\bmarshmallow|\bfondant\b|\bicing\b|\bfrosting\b|\bartificial|sweetened with (?:aspartame|saccharin|sucralose)|"
    r"\bchewing gum\b|\bhard candy|\bgummy|\bjelly beans?\b|\bsnack mix\b|\bpretzels?\b|\bmilk ?shake|\bsundae\b|\bdoughnuts?\b|"
    r"\bdonuts?\b|\bsweet roll|\bdanish\b|\bcinnamon roll", re.I)

# ------------------------------------------------------------------ helpers

def count_board(n: dict[str, float]) -> int:
    return sum(1 for k in BOARD_KEYS if n.get(k) is not None)


def hidden_reason(rec: dict[str, Any]) -> str | None:
    """First matching hidden reason code, or None. `rec` needs raw_name, name, food_group, n."""
    if rec["food_group"] == "baby_foods":
        return "baby_food"
    text = f"{rec['raw_name']} | {rec['name']}"
    for code, rx in HIDDEN_RULES:
        if rx.search(text):
            return code
    if rec["n"].get("kcal") is None:
        return "no_kcal"
    return None


def extended_reasons(rec: dict[str, Any]) -> list[str]:
    """Reasons a food may be searched but never shown as everyday. `rec` needs raw_name, name, branded, category, n."""
    out: list[str] = []
    text = f"{rec['raw_name']} | {rec['name']}"
    if rec.get("branded"):
        out.append("branded")
    for code, rx in EXTENDED_RULES:
        m = rx.search(text)
        if not m:
            continue
        if code == "organ_meat":
            if rec["category"] not in {"meat", "poultry", "fish", "other", "prepared"}:
                continue
            # liver is fine; ignore organ words that are just 'liver' (the rule above does not include it)
            stripped = ORGAN_OK.sub("", text)
            if not rx.search(stripped):
                continue
        if code == "game_meat":
            if rec["category"] not in {"meat", "poultry", "fish", "prepared", "other"} and "game" not in text.lower():
                continue
        out.append(code)
    return out


def is_ultra_processed(rec: dict[str, Any]) -> bool:
    return bool(ULTRA_RX.search(f"{rec['raw_name']} | {rec['name']}"))


def duplicate_filter(recs: list[dict[str, Any]]) -> dict[str, str]:
    """Duplicates by clean display name within the same category: keep the higher-ranked one.
    Returns {canonical_id: kept_canonical_id} for the losers."""
    best: dict[tuple[str, str], dict[str, Any]] = {}
    losers: dict[str, str] = {}
    for r in sorted(recs, key=lambda r: (-r["score"], r["canonical_id"])):
        key = (r["name"].lower(), r["category"])
        if key in best:
            losers[r["canonical_id"]] = best[key]["canonical_id"]
        else:
            best[key] = r
    return losers


# ------------------------------------------------------------------ everyday selection
MAX_PER_HEAD = 8
EXTRA_VARIANT_MIN_RANK = 45
EXTRA_VARIANT_KCAL_DIFF = 0.15
EXTRA_VARIANT_MAX_GAP = 10
OTHER_FORM_MIN_SCORE = 38


def select_everyday(cands: list[dict[str, Any]], common: list[Any], pinned: set[str], target: int = 3000
                    ) -> dict[str, str]:
    """cands: records that may be everyday (not hidden, not extended-only). Each has head, form, score, n, canonical_id.
    common: HeadEntry list (head, form). pinned: canonical ids that must be everyday (legacy sample ids).
    Returns {canonical_id: why} for the everyday set.

    1. For each common head: its preferred-form best record; then the best record of every other form whose score is
       >= OTHER_FORM_MIN_SCORE; then, per (head, form), one extra variant when it is materially different
       (kcal differs by >= 15 %) and ranks well. At most MAX_PER_HEAD per head.
    2. Then the top-scored remaining records (each head capped at MAX_PER_HEAD) until `target`."""
    by_head: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in cands:
        by_head[r["head"]].append(r)
    for lst in by_head.values():
        lst.sort(key=lambda r: (-r["score"], r["canonical_id"]))
    chosen: dict[str, str] = {}
    per_head: dict[str, int] = defaultdict(int)

    def take(r: dict[str, Any], why: str) -> bool:
        if r["canonical_id"] in chosen or per_head[r["head"]] >= MAX_PER_HEAD:
            return False
        chosen[r["canonical_id"]] = why
        per_head[r["head"]] += 1
        return True

    by_id = {r["canonical_id"]: r for r in cands}
    for cid in sorted(pinned):
        r = by_id.get(cid)
        if r is not None:
            chosen[cid] = "legacy_pin"
            per_head[r["head"]] += 1

    seen_heads: list[str] = []
    for e in common:
        if e.head not in seen_heads:
            seen_heads.append(e.head)
    entry_form = defaultdict(list)
    for e in common:
        entry_form[e.head].append(e.form)
    for h in seen_heads:
        lst = by_head.get(h, [])
        if not lst:
            continue
        forms_pref = [f for f in entry_form[h] if f]
        # preferred-form records first
        for f in forms_pref:
            for r in lst:
                if r["form"] == f:
                    take(r, "common_preferred_form")
                    break
        if not forms_pref:
            take(lst[0], "common_head")
        # best of each other form
        done_forms = {r["form"] for r in lst if r["canonical_id"] in chosen}
        for r in lst:
            if r["form"] not in done_forms and r["score"] >= OTHER_FORM_MIN_SCORE:
                if take(r, "common_other_form"):
                    done_forms.add(r["form"])
        # one materially different variant per chosen (head, form)
        for r0 in [r for r in lst if r["canonical_id"] in chosen]:
            for r in lst:
                if r["canonical_id"] in chosen or r["form"] != r0["form"] or r["score"] < EXTRA_VARIANT_MIN_RANK:
                    continue
                k0, k1 = r0["n"].get("kcal"), r["n"].get("kcal")
                if k0 and k1 is not None and abs(k1 - k0) / max(k0, 1) >= EXTRA_VARIANT_KCAL_DIFF \
                        and r["score"] >= r0["score"] - EXTRA_VARIANT_MAX_GAP:
                    if take(r, "common_variant"):
                        break
    # fill with the best of the rest
    rest = sorted((r for r in cands if r["canonical_id"] not in chosen), key=lambda r: (-r["score"], r["canonical_id"]))
    for r in rest:
        if len(chosen) >= target:
            break
        if r["head"] in seen_heads:
            continue          # common heads are complete after step 1
        take(r, "top_ranked")
    return chosen
