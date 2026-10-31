"""Load the app's Everyday food bundle (src/data/foods.everyday.json, compact columnar) as plain food dicts.

The plan-builder kit and the Excel template list only the Everyday tier: the foods people actually log, so an AI or a
plan writer picks from them. Same decoding as src/data/loadFoods.ts.
"""
import json
from pathlib import Path

EVERYDAY_JSON = Path(__file__).resolve().parent.parent / "src" / "data" / "foods.everyday.json"


def load_everyday(path: Path = EVERYDAY_JSON) -> list[dict]:
    bundle = json.loads(Path(path).read_text(encoding="utf-8"))
    keys, dbs = bundle["keys"], bundle.get("dbs") or []
    foods = []
    for r in bundle["foods"]:
        foods.append({
            "id": r[0], "name": r[1], "category": r[2], "head": r[3], "form": r[4], "rank": r[5],
            "aliases": r[6], "tags": r[7],
            "servings": [{"label": label, "g": g} for label, g in r[8]],
            "src": [{"db": dbs[db] if isinstance(db, int) else db, "ref": ref} for db, ref in r[9]],
            "estimated": r[10],
            "n": {k: v for k, v in zip(keys, r[11]) if v is not None},
        })
    return foods
