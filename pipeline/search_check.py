#!/usr/bin/env python3
"""Search acceptance check.

Loads out/foods.json, runs the SAME ranking as the app (a port of src/engine/search.ts: token-prefix match with a
one-typo tolerance, exact-name/alias boost, concise-name preference, rank boost, rare items excluded) and asserts that
each query in config/search_queries.json ({"q": "banana", "expect_any": ["banana"]}) finds an expected food in the
top 3 (case-insensitive substring of the food name). Prints the pass rate and the failures.

Consumer-layer rules (foods that carry `head` / `tier`, see pipeline/consumer/):
  * HEAD GROUPING   results are grouped by `head`; the best member is shown, the others are returned as `group`.
  * EXACT HEAD      match classes: 4 exact head (query tokens == head tokens), 3 exact name / alias, 2 every query token matches
                    (exact or prefix), 1 the query is merely contained in a head ("apple" in "pineapple"), 0.5 a match that
                    needs a typo (shown only when nothing matches without one).  A better class always wins, so "apple" ranks Apple, raw above Apple pie above Pineapple.
  * EVERYDAY FIRST  inside a class an `everyday` food beats an `extended` one.
Foods without `head` behave exactly as before (every food is its own group, no tier preference).

Real-data check (the consumer layer's 300 everyday queries; expectations are on head / form):
  python3 pipeline/search_check.py --real [--foods-dir src/data] [--queries config/search_queries_real.json]

  python3 pipeline/search_check.py [--foods pipeline/out/foods.json] [--queries config/search_queries.json]
                                   [--min-pass 0.9] [--top 3]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
STOP = {"and", "or", "with", "of", "the", "a", "in", "raw"}


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = re.sub(r"[̀-ͯ]", "", s)
    s = re.sub(r"[^a-z0-9%\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _singular(t: str) -> str:
    if len(t) > 4 and t.endswith("ies"):
        return t[:-3] + "y"
    if len(t) > 3 and t.endswith("es") and re.search(r"(ch|sh|x|o)es$", t):
        return t[:-2]
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        return t[:-1]
    return t


def tokens(s: str) -> list[str]:
    return [_singular(t) for t in normalize(s).split(" ") if t and t not in STOP]


def within_one_edit(a: str, b: str) -> bool:
    if abs(len(a) - len(b)) > 1:
        return False
    i = j = edits = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(a) == len(b) and i + 1 < len(a) and a[i] == b[j + 1] and a[i + 1] == b[j]:
            i += 2     # adjacent swap ("appel" / "apple") counts as one edit
            j += 2
            continue
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    return edits + (len(a) - i) + (len(b) - j) <= 1


TYPO = 0.7
TYPO_PREFIX = 0.55


def token_match(qt: str, cands: list[str]) -> float:
    best = 0.0
    for c in cands:
        if c == qt:
            return 1.0
        if c.startswith(qt):
            best = max(best, 0.85 if len(qt) >= 3 else 0.6)
        elif len(qt) >= 4 and within_one_edit(qt, c):
            best = max(best, TYPO)
        elif len(qt) >= 5 and len(c) > len(qt) and within_one_edit(qt, c[: len(qt)]):
            best = max(best, TYPO_PREFIX)
    return best


class Entry:
    def __init__(self, food: dict):
        self.food = food
        self.name = normalize(food["name"])
        self.name_tokens = tokens(food["name"])
        self.alias_tokens = [tokens(a) for a in food.get("aliases", [])]
        self.alias_names = [normalize(a) for a in food.get("aliases", [])]
        self.head = normalize(food["head"]) if food.get("head") else ""
        self.head_tokens = tokens(food["head"]) if food.get("head") else []
        self.everyday = food.get("tier") == "everyday"
        # composite = a dish, a branded / ultra-processed product or a mix / drink / dough: demoted two classes unless asked for
        self.processed = "processed" in (food.get("tags") or [])
        self.composite = (food.get("form") == "dish" or "processed" in (food.get("tags") or [])
                          or bool(COMPOSITE_RX.search(food["name"])) or bool(MIXED_RX.search(food["name"].split(",")[0])))


COMPOSITE_RX = re.compile(r"\b(?:mix|dough|flavou?red|drink|beverage|punch|cocoa|shake|dessert|pudding|splash|cocktail|imitation|"
                          r"substitute|topping|filling|dressing|sauce|soup|salad|sandwich|pie|cake|cookie|candy|burger|pizza)\b", re.I)


MIXED_RX = re.compile(r"\b(?:with|and)\b", re.I)    # "Corn with red pepper", "Milk and cereal bar": a mixed food


def rank_boost(f: dict) -> float:
    return (f.get("rank", 50)) / 100.0


def score_entry(e: Entry, q: list[str], q_norm: str) -> float:
    return score_entry_cls(e, q, q_norm)[0]


def score_entry_cls(e: Entry, q: list[str], q_norm: str) -> tuple[float, float]:
    """-> (score 0..1, match class 0..4); class 0 = no match.  See the module docstring."""
    # 4: exact head (the query names the head: same tokens, any order)
    if e.head_tokens and sorted(e.head_tokens) == sorted(q):
        return (0.99 if e.head == q_norm else 0.98) + rank_boost(e.food) * 0.01, 4
    # 3: exact name or alias
    if e.name == q_norm or q_norm in e.alias_names or any(sorted(a) == sorted(q) for a in e.alias_tokens if a):
        return 0.97 + rank_boost(e.food) * 0.03, 3
    # 3: a multi-word query that is the start of the name ("skim milk" -> "Skim milk, UHT") beats a scattered token match
    if len(q) >= 2 and (e.name + " ").startswith(q_norm + " "):
        return 0.95 + rank_boost(e.food) * 0.01, 3
    best = 0.0
    cls = 0
    fields = [e.name_tokens] + e.alias_tokens + ([e.head_tokens] if e.head_tokens else [])
    for f in fields:
        total = 0.0
        typo = False
        for qt in q:
            m = token_match(qt, f)
            if m == 0:
                total = 0.0
                break
            if m in (TYPO, TYPO_PREFIX):
                typo = True
            total += m
        if not total:
            continue
        s = total / len(q)
        if f and f[0].startswith(q[0]):
            s += 0.08
        s -= min(0.2, max(0, len(f) - len(q)) * 0.03)
        if s > best:
            best = s
        cls = max(cls, 0.5 if typo else 2)     # 0.5: needed a typo; shown only when nothing else matches
    if not best:
        # 1: the end of a longer word in the head / name ("apple" in "pineapple", not "chia" in "macchiato") - weakest, 4+ letters
        hay = e.head or e.name
        if len(q_norm) >= 4 and " " not in q_norm and any(len(w) > len(q_norm) and w.endswith(q_norm) for w in hay.split(" ")):
            return 0.3 + rank_boost(e.food) * 0.1, 1
        return 0.0, 0
    return min(0.96, best * 0.85 + rank_boost(e.food) * 0.15), cls


class FoodSearch:
    def __init__(self, foods: list[dict]):
        self.entries = [Entry(f) for f in foods]

    def search(self, query: str, limit: int = 30, include_rare: bool = False) -> list[tuple[dict, float]]:
        return [(h["food"], h["score"]) for h in self.search_grouped(query, limit, include_rare)]

    def search_grouped(self, query: str, limit: int = 30, include_rare: bool = False) -> list[dict]:
        """[{food (best member), score, cls, group (all matching members, best first)}] ordered best group first."""
        q = tokens(query)
        q_norm = normalize(query)
        if not q:
            return []
        hits = []
        for e in self.entries:
            if e.food.get("rare") and not include_rare:
                continue
            s, cls = score_entry_cls(e, q, q_norm)
            if s > 0 and cls >= 1 and e.composite and (cls < 4 or e.processed) and not (COMPOSITE_RX.search(query) and COMPOSITE_RX.search(e.food["name"])):
                cls = max(1, cls - 2)     # a plain query must not surface a mix / dough / drink / dish / branded product first
            if s > 0:
                hits.append((cls, 1 if e.everyday else 0, s, e.food.get("rank", 50), e.food))
        # best member first: class, everyday, score, rank
        hits.sort(key=lambda h: (-h[0], -h[1], -h[2], -h[3], h[4].get("id", "")))
        groups: dict[str, dict] = {}
        order: list[str] = []
        for cls, ev, s, rank, food in hits:
            key = ("head:" + food["head"]) if food.get("head") else ("id:" + str(food.get("id", id(food))))
            g = groups.get(key)
            if g is None:
                groups[key] = {"food": food, "score": s, "cls": cls, "everyday": ev, "rank": rank, "group": [food]}
                order.append(key)
            else:
                g["group"].append(food)
        out = [groups[k] for k in order]
        out.sort(key=lambda g: (-g["cls"], -g["everyday"], -g["score"], -g["rank"], g["food"].get("id", "")))
        if out and out[0]["cls"] >= 1:
            out = [g for g in out if g["cls"] >= 1]     # typo matches only when nothing matches without one
        return out[:limit]


def run_checks(foods: list[dict], queries: list[dict], top: int = 3) -> tuple[float, list[dict]]:
    fs = FoodSearch(foods)
    failures = []
    for qd in queries:
        hits = fs.search(qd["q"], limit=top)
        names = [h[0]["name"] for h in hits]
        ok = any(any(x.lower() in n.lower() for x in qd["expect_any"]) for n in names)
        if not ok:
            failures.append({"q": qd["q"], "expect_any": qd["expect_any"], "top": names})
    rate = 1.0 - len(failures) / len(queries) if queries else 1.0
    return rate, failures


def decode_bundle(bundle: dict, tier: str) -> list[dict]:
    """Compact app bundle -> list of food dicts (the fields search needs)."""
    dbs = bundle.get("dbs")
    out = []
    for r in bundle["foods"]:
        out.append({"id": r[0], "name": r[1], "category": r[2], "head": r[3], "form": r[4], "rank": r[5], "aliases": r[6],
                    "tags": r[7], "tier": tier,
                    "n": {k: v for k, v in zip(bundle["keys"], r[11]) if v is not None}})
    return out


def head_key(s: str) -> str:
    """Same idea as consumer.names_en.head_key: singular words, no punctuation (Blueberries == blueberry == Blueberry)."""
    return " ".join(_singular(w) for w in normalize(s).split() if w not in {"style", "type"})


def _as_list(v) -> list[str]:
    return [head_key(x) for x in (v if isinstance(v, list) else [v])]


def run_real_checks(foods: list[dict], queries: list[dict], top: int = 3) -> dict:
    """Queries: {"q": "apple", "head": "apple" | ["apple", ...], "form": "raw" | ["raw","cooked"] (optional)}.
    top-1 passes when the first result's head (and form, if given) is expected; top-N when any of the first N results is."""
    fs = FoodSearch(foods)
    fails1, fails3 = [], []
    ok1 = ok3 = 0
    for qd in queries:
        heads = _as_list(qd["head"])
        forms = [x.lower() for x in (qd["form"] if isinstance(qd["form"], list) else [qd["form"]])] if qd.get("form") else None

        def good(f: dict) -> bool:
            return (head_key(f.get("head", "")) in heads) and (forms is None or f.get("form", "").lower() in forms)
        hits = fs.search_grouped(qd["q"], limit=top)
        got = [f"{h['food']['name']} [{h['food'].get('head')}/{h['food'].get('form')}]" for h in hits]
        if hits and good(hits[0]["food"]):
            ok1 += 1
        else:
            fails1.append({"q": qd["q"], "expected": f"{heads}/{forms or 'any'}", "top": got})
        if any(good(h["food"]) for h in hits):
            ok3 += 1
        else:
            fails3.append({"q": qd["q"], "expected": f"{heads}/{forms or 'any'}", "top": got})
    n = len(queries) or 1
    return {"n": len(queries), "top1": ok1 / n, "top3": ok3 / n, "fail_top1": fails1, "fail_top3": fails3}


def main(argv: list[str] | None = None) -> float:
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", action="store_true", help="run config/search_queries_real.json against src/data/foods.*.json")
    ap.add_argument("--foods-dir", default=str(HERE.parent / "src" / "data"))
    ap.add_argument("--include-extended", action="store_true", default=True)
    ap.add_argument("--foods", default=str(HERE / "out" / "foods.json"))
    ap.add_argument("--queries", default=str(HERE / "config" / "search_queries.json"))
    ap.add_argument("--min-pass", type=float, default=0.0, help="exit non-zero below this pass rate")
    ap.add_argument("--top", type=int, default=3)
    args = ap.parse_args(argv)
    if args.real:
        d = Path(args.foods_dir)
        foods = decode_bundle(json.loads((d / "foods.everyday.json").read_text(encoding="utf-8")), "everyday")
        foods += decode_bundle(json.loads((d / "foods.extended.json").read_text(encoding="utf-8")), "extended")
        qpath = args.queries if args.queries != str(HERE / "config" / "search_queries.json") else str(HERE / "config" / "search_queries_real.json")
        queries = json.loads(Path(qpath).read_text(encoding="utf-8"))
        res = run_real_checks(foods, queries, args.top)
        print(f"real search check: {res['n']} queries, {len(foods)} foods: top-1 {res['top1']:.1%}, top-{args.top} {res['top3']:.1%}")
        for f in res["fail_top1"]:
            print(f"  FAIL top-1 {f['q']!r}: expected {f['expected']}, got {f['top']}")
        return res["top1"]
    foods = json.loads(Path(args.foods).read_text(encoding="utf-8"))
    queries = json.loads(Path(args.queries).read_text(encoding="utf-8"))
    rate, failures = run_checks(foods, queries, args.top)
    print(f"search check: {len(queries) - len(failures)}/{len(queries)} queries found an expected food in the top "
          f"{args.top}  (pass rate {rate:.0%}, {len(foods)} foods)")
    for f in failures:
        print(f"  FAIL {f['q']!r}: expected any of {f['expect_any']}, got {f['top']}")
    if __name__ == "__main__" and rate < args.min_pass:
        sys.exit(1)
    return rate


if __name__ == "__main__":
    main()
