"""Orchestration of the consumer layer: records -> enriched -> hidden / extended / everyday -> ranked.

Pure functions over the record dicts produced by adapter.load_records, so build.py and the tests share them.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from . import names_en as N
from . import rank as R
from . import tiers as T
from .adapter import sig4  # noqa: F401  (re-export for convenience)

SPARSE_MIN_BOARD = 6


def enrich(rec: dict[str, Any], lex: N.Lexicon) -> dict[str, Any]:
    """Add name / head / form / category / tags / aliases / flags to a record (in place) and return it."""
    nr = N.build_name(rec["name_en"], rec["source_id"], lex, rec["food_group"])
    cat = N.category_of(rec["food_group"], rec["name_en"] if rec["food_group"] == "meat_poultry" else nr.name)
    rec["raw_name"] = rec["name_en"]
    rec["name"] = nr.name
    rec["head"] = nr.head
    rec["branded"] = nr.branded
    rec["category"] = cat or "other"
    rec["baby"] = cat is None
    rec["form"] = N.form_of(rec["state"], nr.name, rec["category"], nr.parts)
    rec["ultra"] = T.is_ultra_processed(rec)
    rec["ext_reasons"] = T.extended_reasons(rec)
    rec["tags"] = N.tags_of(nr.name, rec["category"], rec["n"].get("iron"), nr.branded, rec["ultra"] and rec["category"] in {"sweet", "prepared", "beverage", "other"})
    rec["aliases"] = N.aliases_for(nr.head, nr.name, N.paren_names(rec["name_en"]), lex)
    rec["n_board"] = T.count_board(rec["n"])
    return rec


def common_positions(lex: N.Lexicon) -> dict[str, tuple[int, set[str]]]:
    pos: dict[str, tuple[int, set[str]]] = {}
    for e in lex.entries:
        if e.head not in pos:
            pos[e.head] = (len(pos), set())
        if e.form:
            pos[e.head][1].add(e.form)
    return pos


def curate(records: list[dict[str, Any]], lex: N.Lexicon, pinned: set[str] | None = None, target: int = 3000,
           unhide_ok: set[str] | None = None) -> dict[str, Any]:
    """Assign tier / reason / score / rank to every record (in place). Returns summary dicts.

    unhide_ok: canonical ids whose 'supplement' hidden reason is waived (legacy sample foods a bundled plan uses)."""
    pinned = pinned or set()
    unhide_ok = unhide_ok or set()
    pos = common_positions(lex)
    n_common = len(pos)
    prefer: dict[str, list[str]] = {}
    for e in lex.entries:
        if e.prefer:
            prefer.setdefault(e.head, []).extend(e.prefer)
    for r in records:
        r["hidden_reason"] = T.hidden_reason(r)
        if r["hidden_reason"] == "supplement" and r["canonical_id"] in unhide_ok:
            r["hidden_reason"] = None
            r["waived"] = "legacy_plan_ingredient"
        r["score"] = R.score(r, pos, n_common, prefer)
    # duplicates (by clean display name within the same category): keep the higher-ranked
    live = [r for r in records if not r["hidden_reason"]]
    losers = T.duplicate_filter(live)
    by_id = {r["canonical_id"]: r for r in records}
    for lid, kept in losers.items():
        if lid in pinned or lid in unhide_ok:
            # keep the pinned one: swap roles
            continue
        by_id[lid]["hidden_reason"] = "duplicate_name"
        by_id[lid]["duplicate_of"] = kept
    live = [r for r in records if not r["hidden_reason"]]
    # extended-only
    for r in live:
        reasons = list(r["ext_reasons"])
        if r["n_board"] < SPARSE_MIN_BOARD and r["head"] not in pos:
            reasons.append("sparse_data")
        r["ext_all"] = reasons
    cands = [r for r in live if not r["ext_all"] or r["canonical_id"] in pinned]
    chosen = T.select_everyday(cands, lex.entries, pinned & {r["canonical_id"] for r in cands}, target)
    for r in records:
        if r["hidden_reason"]:
            r["tier"] = "hidden"
        elif r["canonical_id"] in chosen:
            r["tier"] = "everyday"
            r["why"] = chosen[r["canonical_id"]]
        else:
            r["tier"] = "extended"
            r["why"] = ",".join(r.get("ext_all", [])) or "below_everyday_cut"
        r["rank"] = R.to_rank(r["score"], r["tier"]) if r["tier"] != "hidden" else 0
    return {"chosen": chosen, "losers": losers}


def hidden_summary(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        if r["tier"] == "hidden":
            out[r["hidden_reason"]].append(r)
    return out
