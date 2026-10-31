#!/usr/bin/env python3
"""Propose head_aliases.json entries for the heads on everyday_heads.txt that match no food.

  python3 pipeline/consumer/make_aliases.py --input pipeline/input/foodpipe-v1.0 [--write]

For every unmatched head the rule confirms candidates whose display name contains all the head's key tokens (at most 3 other
tokens, non-branded). Confirmed ones are merged into config/head_aliases.json (manual entries are kept); everything else is
listed with its top-8 token-overlap candidates in pipeline/out/unmatched_candidates.jsonl for review.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
if str(PIPE) not in sys.path:
    sys.path.insert(0, str(PIPE))

from consumer import adapter, aliases as A, curate as C, names_en as N  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(PIPE / "input" / "foodpipe-v1.0"))
    ap.add_argument("--out", default=str(PIPE / "out"))
    ap.add_argument("--write", action="store_true", help="write config/head_aliases.json (default: dry run)")
    args = ap.parse_args()
    records, _ = adapter.load_records(args.input)
    lex = N.Lexicon(N.load_heads())
    for r in records:
        C.enrich(r, lex)
    path = PIPE / "config" / "head_aliases.json"
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    manual = {k: v for k, v in existing.items() if not k.startswith("_")}
    reject_cfg = existing.get("_reject", {})
    skip_heads = set(reject_cfg.get("_heads", []))
    C.prepare(records, lex, manual)
    C.curate(records, lex)
    present = {r["head"] for r in records if r["tier"] != "hidden"}
    unmatched = [h for h in dict.fromkeys(e.head for e in lex.entries) if h not in present]
    new: dict[str, list[str]] = {}
    for h in unmatched:
        if h in skip_heads:
            continue
        ids = A.confirmed(h, [r for r in records if r["tier"] != "hidden"], reject=reject_cfg.get(h))
        if ids:
            new[h] = ids
    print(f"{len(unmatched)} unmatched heads; rule-confirmed aliases for {len(new)}")
    merged = dict(manual)
    for h, ids in new.items():
        merged.setdefault(h, ids)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    left = [h for h in unmatched if h not in merged]
    with (out / "unmatched_candidates.jsonl").open("w", encoding="utf-8") as f:
        for h in left:
            f.write(json.dumps({"head": h, "candidates": A.candidates(h, records)}, ensure_ascii=False) + "\n")
    print(f"{len(left)} heads left for manual labelling -> {out / 'unmatched_candidates.jsonl'}")
    if args.write:
        doc = {"_comment": "head -> canonical food ids (foodpipe canonical_id) that are that head even though their name says it differently. "
                           "Applied in consumer/curate.prepare before tiering and ranking. Rule-confirmed by consumer/make_aliases.py "
                           "(candidate name contains every key token of the head); hand entries are kept on re-run."}
        doc["_reject"] = reject_cfg
        doc.update({h: merged[h] for h in sorted(merged)})
        path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {path} ({len(merged)} heads)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
