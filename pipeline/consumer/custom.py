"""Curated staples and promote-on-use.

1. Curated foods (`config/custom_foods.json`): staples no source database has (sumac, za'atar, gochujang, labneh ...). Each is computed per
   100 g from foods that DO exist in the library, with a written recipe of proportions. Every nutrient it has is marked estimated, and a
   nutrient that cannot be defended is left missing (missing beats wrong):
     * a nutrient is filled only when EVERY component has a value for it (or the component declares `zero_if_missing` for that key, with a reason);
     * `fill` (whitelist) / `omit` (blacklist) remove nutrients the processing would change or the proxy cannot predict;
     * `adjust` multiplies a nutrient after the sum (documented, e.g. lactose lost with the whey in labneh);
     * `kcal: "atwater"` recomputes energy from the final protein / fat / carbohydrate / fibre.
   `components[].g` is grams of that component per 100 g of the finished food, so water lost in reducing, drying or straining is simply a
   component amount above 100 (350 g of pomegranate juice -> 100 g of molasses). Water added (tamarind paste) is not listed.
   Component: {"food": "<library id>"} or {"custom": "<key of an earlier curated food>"}.

2. Promote on use: every food id used by content/families/*.json (files starting with `_` are fixtures and skipped) is pinned to the everyday
   tier, like the legacy sample-plan pins, so a recipe writer may use an extended food and the next build ships it in the everyday bundle.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .adapter import BOARD_KEYS, NUTRIENT_KEYS, sig4

CANONICAL_PREFIX = "eighty:"
SOURCE_ID = "eighty_composite"
DEFAULT_RANK = 80
FA_KEYS = ("satFat", "mufa", "pufa")


class CustomFoodError(ValueError):
    pass


def load_specs(path: Path) -> list[dict[str, Any]]:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    specs = cfg["foods"]
    keys = [s["key"] for s in specs]
    if len(set(keys)) != len(keys):
        raise CustomFoodError("custom_foods.json: duplicate key")
    for s in specs:
        for need in ("key", "name", "head", "form", "category", "components", "recipe"):
            if need not in s:
                raise CustomFoodError(f"{s.get('key', '?')}: missing '{need}'")
        for c in s["components"]:
            if ("food" in c) == ("custom" in c):
                raise CustomFoodError(f"{s['key']}: a component needs exactly one of 'food' or 'custom'")
            if c.get("zero_if_missing") and not c.get("why"):
                raise CustomFoodError(f"{s['key']}: a component with zero_if_missing must say why")
    return specs


def _atwater(n: dict[str, float]) -> float | None:
    if any(n.get(k) is None for k in ("protein", "fat", "carbs")):
        return None
    fib = min(n.get("fiber") or 0.0, n["carbs"])
    return 4.0 * n["protein"] + 9.0 * n["fat"] + 4.0 * (n["carbs"] - fib) + 2.0 * fib


def compute_nutrients(spec: dict[str, Any], resolve) -> tuple[dict[str, float], list[str]]:
    """Per 100 g of the finished food. `resolve(component) -> record dict` (needs 'n'). Returns (n, notes)."""
    comps = [(c, resolve(c)) for c in spec["components"]]
    n: dict[str, float] = {}
    notes: list[str] = []
    for k in NUTRIENT_KEYS:
        total, ok = 0.0, True
        for c, rec in comps:
            v = rec["n"].get(k)
            if v is None and k in (c.get("zero_if_missing") or []):
                v = 0.0
            if v is None:
                ok = False
                break
            total += v * c["g"] / 100.0
        if ok:
            n[k] = total
    fill = spec.get("fill")
    if fill is not None:
        n = {k: v for k, v in n.items() if k in fill}
    for k in spec.get("omit", []):
        n.pop(k, None)
    for k, f in (spec.get("adjust") or {}).items():
        if k in n:
            n[k] *= f
    if spec.get("kcal") == "atwater":
        kc = _atwater(n)
        if kc is None:
            n.pop("kcal", None)
        else:
            n["kcal"] = kc
            notes.append("kcal recomputed from protein, fat and carbohydrate (4/9/4, fibre 2)")
    if all(k in n for k in FA_KEYS) and n.get("fat") is not None and sum(n[k] for k in FA_KEYS) > n["fat"] + 1.0:
        for k in FA_KEYS:
            n.pop(k)
        notes.append("sat / mono / poly dropped: the components' fat splits add up to more than the total fat")
    if "la" in n and "pufa" not in n:
        n.pop("la")
    return n, notes


def build_record(spec: dict[str, Any], resolve, rank: int | None = None) -> dict[str, Any]:
    """A library record (same fields the build uses for every food) for one curated food. No id yet (export_app.make_ids)."""
    n, notes = compute_nutrients(spec, resolve)
    if n.get("kcal") is None:
        raise CustomFoodError(f"{spec['key']}: no energy could be computed")
    comps = [(c, resolve(c)) for c in spec["components"]]
    names = [r["name"] for _, r in comps]
    cite = f"Eighty composite of {', '.join(names)} (foodpipe sources)"
    src: list[list[str]] = [[cite, "composite:" + spec["key"]]]
    seen = {(cite, src[0][1])}
    for _, r in comps:                      # the components' own citations stay, so the numbers can be traced
        for db, ref in r["src"]:
            if str(ref).startswith("composite:") or (db, ref) in seen:
                continue
            seen.add((db, ref))
            src.append([db, ref])
    missing = [k for k in NUTRIENT_KEYS if k not in n]
    notes.append("Eighty composite, all values estimated: " + spec["recipe"])
    if spec.get("limits"):
        notes.append(spec["limits"])
    r = {
        "canonical_id": CANONICAL_PREFIX + spec["key"], "food_id": CANONICAL_PREFIX + spec["key"], "source_id": SOURCE_ID,
        "name_en": spec["name"], "raw_name": spec["name"], "name": spec["name"], "head": spec["head"], "form": spec["form"],
        "category": spec["category"], "food_group": "", "state": "", "n": n, "estimated": [k for k in NUTRIENT_KEYS if k in n],
        "notes": notes, "src": src, "n_sources": len({db for db, _ in src}), "n_members": len(comps), "tags": list(spec.get("tags", [])),
        "aliases": [a.lower() for a in spec.get("aliases", [])], "aliases_out": [a.lower() for a in spec.get("aliases", [])][:5],
        "branded": False, "ext_reasons": [], "ultra": False, "tier": "everyday", "why": "curated_composite",
        "rank": spec.get("rank", rank if rank is not None else DEFAULT_RANK), "score": float(spec.get("rank", rank or DEFAULT_RANK)),
        "hidden_reason": None, "n_board": sum(1 for k in BOARD_KEYS if n.get(k) is not None),
        "servings": [dict(s) for s in spec.get("servings", [])], "servings_from": "custom" if spec.get("servings") else "",
        "missing": missing, "spec": spec,
        "comp_desc": "; ".join(f"{c['g']:g} g {r['name']}" + (f" ({c['note']})" if c.get("note") else "") for c, r in comps),
    }
    for k in list(r["n"]):
        r["n"][k] = sig4(r["n"][k])
    return r


def build_all(specs: list[dict[str, Any]], live_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute every curated food in file order (a later one may use an earlier one). Raises CustomFoodError for an unknown component."""
    done: dict[str, dict[str, Any]] = {}

    def resolve(c: dict[str, Any]) -> dict[str, Any]:
        if "custom" in c:
            if c["custom"] not in done:
                raise CustomFoodError(f"component custom '{c['custom']}' is not defined above its use")
            return done[c["custom"]]
        if c["food"] not in live_by_id:
            raise CustomFoodError(f"component food '{c['food']}' is not a live food in the library")
        return live_by_id[c["food"]]

    out = []
    for s in specs:
        r = build_record(s, resolve)
        done[s["key"]] = r
        out.append(r)
    return out


# ------------------------------------------------------------------------------------------------ promote on use
def family_files(families_dir: Path) -> list[Path]:
    """content/families/*.json, minus fixtures (names starting with `_`)."""
    return sorted(p for p in Path(families_dir).glob("*.json") if not p.name.startswith("_"))


def used_food_ids(families_dir: Path) -> dict[str, list[str]]:
    """food id -> the family files that use it (every recipe ingredient of every non-fixture family file)."""
    used: dict[str, list[str]] = {}
    for p in family_files(families_dir):
        try:
            fam = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue                     # a malformed draft is plan-lab's problem, not the food build's
        for rec in fam.get("recipes", []) if isinstance(fam, dict) else []:
            for ing in rec.get("ingredients", []) if isinstance(rec, dict) else []:
                fid = ing.get("food") if isinstance(ing, dict) else None
                if isinstance(fid, str) and p.stem not in used.setdefault(fid, []):
                    used[fid].append(p.stem)
    return used


def promotions(used: dict[str, list[str]], id_to_canonical: dict[str, str], tier_of: dict[str, str]) -> tuple[set[str], set[str], list[str]]:
    """(canonical ids to pin, the subset that are extended in the baseline build, used ids nobody can resolve).
    `tier_of`: canonical id -> tier of the baseline build."""
    pin: set[str] = set()
    promoted: set[str] = set()
    unknown: list[str] = []
    for fid in sorted(used):
        cid = id_to_canonical.get(fid)
        if cid is not None and cid.startswith(CANONICAL_PREFIX):
            continue                     # a curated staple: always everyday already
        if cid is None or cid not in tier_of:
            unknown.append(fid)
            continue
        pin.add(cid)
        if tier_of[cid] == "extended":
            promoted.add(cid)
    return pin, promoted, unknown


# ------------------------------------------------------------------------------------------------ report
def report_section(customs: list[dict[str, Any]], promo: dict[str, Any] | None, energy_est: list[dict[str, Any]]) -> str:
    L: list[str] = []
    A = L.append
    A("\n## 12. Curated estimates (Eighty composites)\n")
    A(f"{len(customs)} staples that no source database has are computed per 100 g from foods that do exist in the library "
      "(`pipeline/config/custom_foods.json`). **Every value is an estimate** and is listed in the food's `estimated` array; the citation reads "
      "'Eighty composite of <components> (foodpipe sources)' followed by the components' own citations. A nutrient is filled only when every "
      "component has it (or the recipe says why a gap counts as zero); the rest are left missing. They are everyday-tier foods and are not in the "
      "counts of section 1.\n")
    for r in customs:
        s = r["spec"]
        comp = r["comp_desc"]
        n = r["n"]
        A(f"### {r['name']} (`{r.get('id', '')}`)\n")
        A(f"- Recipe per 100 g of the finished food: {comp}.")
        A(f"- Basis: {s['recipe']}")
        if s.get("limits"):
            A(f"- Limits: {s['limits']}")
        macro = ", ".join(f"{k} {n[k]:g}" for k in ("kcal", "protein", "carbs", "fat", "fiber", "sodium") if k in n)
        A(f"- Per 100 g: {macro}.")
        A(f"- Filled ({len(r['estimated'])} of {len(NUTRIENT_KEYS)}): {', '.join(r['estimated'])}.")
        A(f"- Left missing: {', '.join(r['missing']) if r['missing'] else 'none'}.\n")
    if energy_est:
        A("## 13. Spices with an estimated energy value (were hidden as `no_kcal`)\n")
        A("CoFID gives water, protein and fat for these spices but no carbohydrate or energy. Energy is derived as carbohydrate by difference "
          "(100 - water - protein - fat - ash; ash = source value, else 7 % of the dry matter) with Atwater factors, and `kcal` and `carbs` are marked "
          "estimated. Rule: `adapter.estimate_spice_energy`, herbs / spices group only.\n")
        A("| food | tier | kcal | carbs | protein | fat |\n|---|---|---|---|---|---|")
        for r in energy_est:
            n = r["n"]
            A(f"| {r['name']} | {r['tier']} | {n.get('kcal', 0):.0f} | {n.get('carbs', 0):.1f} | {n.get('protein', 0):.1f} | {n.get('fat', 0):.1f} |")
        A("")
    if promo is not None:
        A("## 14. Promote on use\n")
        A(f"{promo['files']} family file(s) read ({', '.join(promo['names']) or 'none'}); {promo['used']} distinct food ids used; "
          f"**{len(promo['promoted'])} extended food(s) promoted to everyday** (pinned like the legacy sample ids; the everyday target is raised by the same number "
          "so no other food is pushed out).")
        if promo["promoted"]:
            A("\n" + "\n".join(f"- `{i}` ({', '.join(fams)})" for i, fams in promo["promoted"]))
        if promo.get("pins"):
            A("\nExplicit everyday pins (`config/everyday_pins.json`):\n\n" + "\n".join(
                f"- {name} (`{cid}`): {why}" + (" - was extended, now everyday" if was_ext else " - already everyday") for cid, name, why, was_ext in promo["pins"]))
        if promo["unknown"]:
            A("\nIds used by a family that are not in the library (typo, or a legacy id): " + ", ".join(f"`{u}`" for u in promo["unknown"]) + ".")
        A("")
    return "\n".join(L)
