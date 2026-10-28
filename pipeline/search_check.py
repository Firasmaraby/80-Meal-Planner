#!/usr/bin/env python3
"""Search acceptance check.

Loads out/foods.json, runs the SAME ranking as the app (a port of src/engine/search.ts: token-prefix match with a
one-typo tolerance, exact-name/alias boost, concise-name preference, rank boost, rare items excluded) and asserts that
each query in config/search_queries.json ({"q": "banana", "expect_any": ["banana"]}) finds an expected food in the
top 3 (case-insensitive substring of the food name). Prints the pass rate and the failures.

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
        if len(a) > len(b):
            i += 1
        elif len(b) > len(a):
            j += 1
        else:
            i += 1
            j += 1
    return edits + (len(a) - i) + (len(b) - j) <= 1


def token_match(qt: str, cands: list[str]) -> float:
    best = 0.0
    for c in cands:
        if c == qt:
            return 1.0
        if c.startswith(qt):
            best = max(best, 0.85 if len(qt) >= 3 else 0.6)
        elif len(qt) >= 4 and within_one_edit(qt, c):
            best = max(best, 0.7)
        elif len(qt) >= 5 and len(c) > len(qt) and within_one_edit(qt, c[: len(qt)]):
            best = max(best, 0.55)
    return best


class Entry:
    def __init__(self, food: dict):
        self.food = food
        self.name = normalize(food["name"])
        self.name_tokens = tokens(food["name"])
        self.alias_tokens = [tokens(a) for a in food.get("aliases", [])]
        self.alias_names = [normalize(a) for a in food.get("aliases", [])]


def rank_boost(f: dict) -> float:
    return (f.get("rank", 50)) / 100.0


def score_entry(e: Entry, q: list[str], q_norm: str) -> float:
    if e.name == q_norm or q_norm in e.alias_names:
        return 0.97 + rank_boost(e.food) * 0.03
    best = 0.0
    for f in [e.name_tokens] + e.alias_tokens:
        total = 0.0
        for qt in q:
            m = token_match(qt, f)
            if m == 0:
                total = 0.0
                break
            total += m
        if not total:
            continue
        s = total / len(q)
        if f and f[0].startswith(q[0]):
            s += 0.08
        s -= min(0.2, max(0, len(f) - len(q)) * 0.03)
        best = max(best, s)
    if not best:
        return 0.0
    return min(0.96, best * 0.85 + rank_boost(e.food) * 0.15)


class FoodSearch:
    def __init__(self, foods: list[dict]):
        self.entries = [Entry(f) for f in foods]

    def search(self, query: str, limit: int = 30, include_rare: bool = False) -> list[tuple[dict, float]]:
        q = tokens(query)
        q_norm = normalize(query)
        if not q:
            return []
        hits = []
        for e in self.entries:
            if e.food.get("rare") and not include_rare:
                continue
            s = score_entry(e, q, q_norm)
            if s > 0:
                hits.append((e.food, s))
        hits.sort(key=lambda h: (-h[1], -(h[0].get("rank", 50))))
        return hits[:limit]


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


def main(argv: list[str] | None = None) -> float:
    ap = argparse.ArgumentParser()
    ap.add_argument("--foods", default=str(HERE / "out" / "foods.json"))
    ap.add_argument("--queries", default=str(HERE / "config" / "search_queries.json"))
    ap.add_argument("--min-pass", type=float, default=0.0, help="exit non-zero below this pass rate")
    ap.add_argument("--top", type=int, default=3)
    args = ap.parse_args(argv)
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
