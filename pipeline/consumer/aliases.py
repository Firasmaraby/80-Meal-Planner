"""head_aliases.json: head -> canonical food ids that ARE that head even though their name says it differently
('Sesame butter, tahini' is tahini, 'Yeast, flakes' is nutritional yeast).  Also the candidate generator for the heads
that stay unmatched (written to pipeline/out/unmatched_candidates.jsonl for review).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .names_en import head_key

CONFIG = Path(__file__).resolve().parent.parent / "config"
STOP = {"and", "or", "with", "of", "the", "a", "in", "raw", "cooked"}


def load_aliases(path: str | Path | None = None) -> dict[str, list[str]]:
    p = Path(path) if path else CONFIG / "head_aliases.json"
    if not p.exists():
        return {}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {k: v for k, v in d.items() if not k.startswith("_")}


def apply_aliases(records: list[dict[str, Any]], aliases: dict[str, list[str]]) -> int:
    """Re-head the listed canonical ids. The natural head stays searchable as an alias. Returns how many records changed."""
    by_cid = {r["canonical_id"]: r for r in records}
    n = 0
    for head, cids in aliases.items():
        for cid in cids:
            r = by_cid.get(cid)
            if r is None or r["head"] == head:
                continue
            old = r["head"]
            r["head"] = head
            r["head_alias_of"] = old
            if old not in r["aliases"] and old != head:
                r["aliases"] = ([old] + r["aliases"])[:5]
            n += 1
    return n


_CACHE: dict[str, tuple[str, ...]] = {}


def _toks(s: str) -> tuple[str, ...]:
    t = _CACHE.get(s)
    if t is None:
        t = _CACHE[s] = tuple(w for w in head_key(s).split() if w not in STOP)
    return t


def _rtoks(r: dict[str, Any]) -> tuple[set[str], set[str]]:
    """(name tokens, name+alias+natural-head tokens), cached on the record."""
    c = r.get("_tok")
    if c is None:
        nt = set(_toks(r["name"]))
        c = r["_tok"] = (nt, nt | set(_toks(" ".join(r.get("aliases", [])))) | set(_toks(r["head"])))
    return c


def candidates(head: str, records: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    """Top candidates for an unmatched head by token overlap (name + aliases + natural head), non-hidden foods only."""
    ht = set(_toks(head))
    if not ht:
        return []
    scored = []
    for r in records:
        if r.get("hidden_reason"):
            continue
        nt, rt = _rtoks(r)
        inter = ht & rt
        if not inter:
            continue
        cover = len(inter) / len(ht)
        jac = len(inter) / len(ht | nt)
        scored.append((cover, jac, r.get("score", 0), r))
    scored.sort(key=lambda t: (-t[0], -t[1], -t[2], t[3]["canonical_id"]))
    return [{"id": r["canonical_id"], "name": r["name"], "category": r["category"]} for _, _, _, r in scored[:limit]]


NEUTRAL = {"raw", "cooked", "boiled", "dried", "dry", "canned", "frozen", "unenriched", "enriched", "bleached", "unbleached", "white",
           "whole", "plain", "fresh", "prepared", "unprepared", "unsweetened", "sweetened", "salted", "unsalted", "lean", "fat", "low",
           "reduced", "nonfat", "light", "ready", "serve", "drained", "solid", "liquid", "homemade", "commercial", "roasted", "baked",
           "fried", "grilled", "steamed", "unblanched", "pasteurized", "wheat", "no", "added", "salt", "sugar", "with", "without"}
PRODUCT_WORDS = {"evaporated", "condensed", "goat", "sheep", "human", "strawberry", "chocolate", "harissa", "salami", "cookie", "cake", "pie", "sandwich", "salad", "soup", "sauce", "burrito", "candy", "juice", "drink", "cracker",
                 "chip", "bar", "mix", "dough", "pudding", "puff", "pastry", "snack", "roll", "stuffing", "omelette", "pancake",
                 "dip", "spread", "bread", "stew", "casserole", "dressing", "seasoning", "sour", "sunrise", "liver", "shell"}


def confirmed(head: str, records: list[dict[str, Any]], max_ids: int = 4, reject: list[str] | None = None) -> list[str]:
    """Rule-confirmed candidates: the candidate's display name contains every key token of the head, with at most one other
    token (two when the head has several tokens), none of them a product-type word the head lacks (cookie, sauce, soup ...),
    and at least one head token in the name's first comma part; not branded / heritage / game; the best-scored few."""
    ht = set(_toks(head))
    if not ht:
        return []
    out = []
    limit = 1 if len(ht) == 1 else 2 if len(ht) == 2 else 3
    for r in records:
        if r.get("hidden_reason") or r.get("ext_reasons"):
            continue
        nt = _rtoks(r)[0]
        extra = {t for t in nt - ht if t not in NEUTRAL}
        if not ht <= nt or len(extra) > limit or (extra & PRODUCT_WORDS and not ht & PRODUCT_WORDS):
            continue
        if not (set(_toks(r["name"].split(",")[0])) & ht):
            continue
        if reject and any(x.lower() in r["name"].lower() for x in reject):
            continue
        out.append(r)
    out.sort(key=lambda r: (-r["score"], r["canonical_id"]))
    return [r["canonical_id"] for r in out[:max_ids]]
