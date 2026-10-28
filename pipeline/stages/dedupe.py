"""Stage 4 - dedupe: merge the same food appearing in several sources (or twice in one).

Canonical key
-------------
  name tokens: cleaned core name -> spelling/synonyms folded -> singular -> stop-words removed -> sorted, unique
  state tokens: the preparation state ("raw", "boiled", "roasted", ...) is KEPT as part of the key, and two foods
  with different states are never merged (raw != cooked != boiled != roasted).

Candidates (within the same category and the same state)
--------------------------------------------------------
  * identical canonical key, or
  * name similarity >= name_threshold (difflib on the token-sorted key string; rapidfuzz if installed)
  and the two names must not differ by an identity-changing token (with/without, skin, lean, low, nonfat, salted,
  colours, wild/farmed, digits such as "85% lean", ...).

Confirmation: nutrient-vector check on kcal/protein/carbs/fat/fiber over the keys both records have (>= 3 shared):
  cosine similarity >= cosine_min  AND  kcal within kcal_rel_tol (or kcal_abs_tol for tiny values).
  Identical keys with too little shared data are merged (nothing contradicts them); fuzzy matches need the check.

Merge: groups are built greedily from the most complete record (star clustering, so no A~B~C chaining). The primary
is the member with the most non-null nutrients (ties: source priority, then uid). Missing nutrients are filled from
other members only when the donor value is unit-safe (not flagged approx by normalize). `src` lists ALL contributing
records, primary first. Every merge is returned in the merges table.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd

from .names import Rules, canon_text, key_tokens, load_rules
from .report import Log
from .schema import MACRO_KEYS_FOR_VECTOR, NUTRIENT_KEYS
from .similarity import jaccard, similarity
from .textutil import singular

DEFAULT_DISCRIMINATORS = {
    "with", "without", "no", "skin", "skinless", "lean", "fat", "low", "lowfat", "nonfat", "skim", "reduced", "light",
    "diet", "salted", "unsalted", "salt", "sweetened", "unsweetened", "sugar", "free", "wild", "farmed", "brown",
    "white", "red", "green", "black", "yellow", "orange", "blue", "purple", "pink", "dark", "whole", "enriched",
    "unenriched", "fortified", "unfortified", "refined", "unrefined", "sprouted", "flavored", "organic", "plain",
    "instant", "ground", "boneless", "bone", "trimmed", "regular", "large", "small", "medium", "mini", "extra",
    "virgin", "decaffeinated", "caffeinated", "sodium", "added", "dry", "creamed", "whipped", "condensed",
    "evaporated", "sparkling", "still", "blanched", "peeled", "unpeeled", "seeded", "seedless", "hulled",
    "unhulled", "toasted", "smoked", "sweet", "sour", "hot", "mild", "cooked", "uncooked", "fresh",
}


def _vec_check(a: np.ndarray, b: np.ndarray, kidx: list[int], cfg: dict) -> dict[str, Any]:
    va, vb = a[kidx], b[kidx]
    shared = ~np.isnan(va) & ~np.isnan(vb)
    n = int(shared.sum())
    res: dict[str, Any] = {"shared": n, "cos": None, "kcal_ok": None, "ok": None}
    if np.isfinite(a[0]) and np.isfinite(b[0]):  # kcal is index 0 of kidx order (see MACRO_KEYS_FOR_VECTOR)
        ka, kb = float(a[0]), float(b[0])
        tol = max(cfg["kcal_rel_tol"] * max(ka, kb), cfg["kcal_abs_tol"])
        res["kcal_ok"] = abs(ka - kb) <= tol
    if n >= 3:
        x, y = va[shared], vb[shared]
        nx, ny = float(np.linalg.norm(x)), float(np.linalg.norm(y))
        if nx == 0 and ny == 0:
            cos = 1.0
        elif nx == 0 or ny == 0:
            cos = 0.0
        else:
            cos = float(np.dot(x, y) / (nx * ny))
        res["cos"] = round(cos, 4)
        res["ok"] = cos >= cfg["cosine_min"] and res["kcal_ok"] is not False
    return res


def prepare(foods: pd.DataFrame, rules: Rules) -> pd.DataFrame:
    f = foods.copy()
    f["_tokens"] = [frozenset(key_tokens(c, rules)) for c in f["core"]]
    f["_skey"] = [" ".join(key_tokens(s.replace("|", " "), rules)) if s else "" for s in f["state"]]
    f["_key"] = [" ".join(sorted(t)) for t in f["_tokens"]]
    f["_n"] = f[NUTRIENT_KEYS].notna().sum(axis=1)
    return f


def dedupe(foods: pd.DataFrame, settings: dict, source_priority: list[str], source_db: dict[str, str],
           rules: Rules | None = None, log: Log | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pure: per-source foods -> (merged foods, merges report). Input needs uid, source, source_id, name, core,
    state, category, aliases, tags, approx_keys + nutrient columns."""
    rules = rules or load_rules()
    cfg = {"name_threshold": 0.88, "cosine_min": 0.98, "kcal_rel_tol": 0.10, "kcal_abs_tol": 5.0, "max_posting": 400,
           **(settings or {})}
    disc = set(cfg.get("discriminators") or DEFAULT_DISCRIMINATORS)
    disc = {singular(d) for d in disc}
    prio = {s: i for i, s in enumerate(source_priority)}
    f = prepare(foods, rules).reset_index(drop=True)
    f["_prio"] = f["source"].map(lambda s: prio.get(s, len(prio)))
    order = f.sort_values(["_n", "_prio", "uid"], ascending=[False, True, True], kind="stable").index.tolist()
    X = f[MACRO_KEYS_FOR_VECTOR].to_numpy(dtype=float)  # kcal, protein, carbs, fat, fiber (kcal is column 0)
    kidx = list(range(len(MACRO_KEYS_FOR_VECTOR)))
    # plain python containers: pandas .at in a hot loop is ~100x slower
    recs = f.to_dict("records")
    toks_l = f["_tokens"].tolist()
    key_l = f["_key"].tolist()
    cat_l = f["category"].tolist()
    skey_l = f["_skey"].tolist()
    uid_l = f["uid"].tolist()
    name_l = f["name"].tolist()

    # blocks: same category and same canonical state
    blocks: dict[tuple[str, str], list[int]] = defaultdict(list)
    for idx in order:
        blocks[(cat_l[idx], skey_l[idx])].append(idx)

    assigned: dict[int, int] = {}
    groups: list[list[int]] = []
    group_info: dict[int, dict[str, Any]] = {}
    rejected: list[dict[str, Any]] = []
    n_rej_disc = n_rej_nut = 0

    for (cat, skey), members in blocks.items():
        post: dict[str, list[int]] = defaultdict(list)
        by_key: dict[str, list[int]] = defaultdict(list)
        for idx in members:
            by_key[key_l[idx]].append(idx)
            for t in toks_l[idx]:
                post[t].append(idx)
        for seed in members:
            if seed in assigned:
                continue
            gid = len(groups)
            assigned[seed] = gid
            grp = [seed]
            infos = []
            cands: dict[int, str] = {}
            for o in by_key[key_l[seed]]:
                if o != seed and o not in assigned:
                    cands[o] = "exact_key"
            ts = toks_l[seed]
            for t in ts:
                p = post[t]
                if len(p) > cfg["max_posting"]:
                    continue
                for o in p:
                    if o != seed and o not in assigned and o not in cands:
                        cands[o] = "fuzzy"
            for o, kind in cands.items():
                to = toks_l[o]
                diff = ts ^ to
                if diff and any(d in disc or any(ch.isdigit() for ch in d) for d in diff):
                    if kind == "exact_key" or jaccard(ts, to) >= 0.4:
                        n_rej_disc += 1
                    continue
                if kind == "fuzzy":
                    if jaccard(ts, to) < 0.5:
                        continue
                    la, lb = len(key_l[seed]), len(key_l[o])
                    if 2 * min(la, lb) / (la + lb) < cfg["name_threshold"]:
                        continue  # length alone caps the similarity below the threshold
                    sim = similarity(key_l[seed], key_l[o])
                    if sim < cfg["name_threshold"]:
                        continue
                else:
                    sim = 1.0
                chk = _vec_check(X[seed], X[o], kidx, cfg)
                if chk["ok"] is False:
                    n_rej_nut += 1
                    if len(rejected) < 2000:
                        rejected.append({"a": uid_l[seed], "b": uid_l[o], "a_name": name_l[seed],
                                         "b_name": name_l[o], "sim": round(sim, 3), "cos": chk["cos"],
                                         "kcal_ok": chk["kcal_ok"], "reason": "nutrient_check_failed"})
                    continue
                if chk["ok"] is None and kind != "exact_key":
                    n_rej_nut += 1
                    continue  # fuzzy name match without enough data to confirm
                assigned[o] = gid
                grp.append(o)
                infos.append({"uid": uid_l[o], "kind": kind, "sim": round(sim, 3), "cos": chk["cos"],
                              "kcal_ok": chk["kcal_ok"], "shared": chk["shared"]})
            groups.append(grp)
            group_info[gid] = {"matches": infos}

    # ---- build merged rows
    rows: list[dict[str, Any]] = []
    merges: list[dict[str, Any]] = []
    base_cols = [c for c in f.columns if not c.startswith("_")]
    for gid, grp in enumerate(groups):
        p = grp[0]
        rec = {c: recs[p][c] for c in base_cols}
        rec["primary_uid"] = uid_l[p]
        members = [uid_l[i] for i in grp]
        src_list, seen = [], set()
        for i in grp:
            key = (source_db.get(recs[i]["source"], recs[i]["source"]), recs[i]["source_id"])
            if key not in seen:
                seen.add(key)
                src_list.append({"db": key[0], "ref": str(key[1])})
        rec["src"] = src_list
        rec["members"] = members
        rec["n_sources"] = len({s["db"] for s in src_list})
        filled: dict[str, str] = {}
        if len(grp) > 1:
            for k in NUTRIENT_KEYS:
                if pd.isna(rec[k]):
                    for i in grp[1:]:
                        v = recs[i][k]
                        if pd.notna(v) and k not in set(str(recs[i]["approx_keys"]).split(",")):
                            rec[k] = float(v)
                            filled[k] = uid_l[i]
                            break
            al = list(rec["aliases"]) if isinstance(rec["aliases"], list) else []
            tg = list(rec["tags"]) if isinstance(rec["tags"], list) else []
            for i in grp[1:]:
                for a in (recs[i]["aliases"] if isinstance(recs[i]["aliases"], list) else []):
                    if a not in al:
                        al.append(a)
                nm = str(name_l[i]).lower()
                if key_l[i] != key_l[p] and nm != str(rec["name"]).lower() and nm not in al:
                    al.append(nm)  # a genuinely different wording (not just plural/case/synonym of the primary)
                for t in (recs[i]["tags"] if isinstance(recs[i]["tags"], list) else []):
                    if t not in tg:
                        tg.append(t)
            rec["aliases"] = al[:16]
            rec["tags"] = tg
            ap = set(str(rec["approx_keys"]).split(",")) - set(filled)
            rec["approx_keys"] = ",".join(sorted(x for x in ap if x))
            info = group_info[gid]["matches"]
            merges.append({
                "name": rec["name"], "category": rec["category"], "state": rec["state"], "primary_uid": rec["primary_uid"],
                "members": " ; ".join(members), "member_names": " ; ".join(str(recs[i]["raw_name"]) for i in grp),
                "n_members": len(grp), "n_sources": rec["n_sources"],
                "match_types": ",".join(sorted({m["kind"] for m in info})),
                "min_name_sim": min(m["sim"] for m in info),
                "min_cosine": min((m["cos"] for m in info if m["cos"] is not None), default=None),
                "filled_nutrients": json.dumps(filled, ensure_ascii=False),
            })
        rows.append(rec)
    merged = pd.DataFrame(rows).reset_index(drop=True)
    merges_df = pd.DataFrame(merges)
    if log:
        log.add("dedupe", "info", "records_in", n=len(f))
        log.add("dedupe", "info", "foods_out", n=len(merged))
        log.add("dedupe", "info", "merged_groups", n=len(merges_df))
        log.add("dedupe", "info", "candidates_rejected_by_discriminator", n=n_rej_disc)
        log.add("dedupe", "info", "candidates_rejected_by_nutrients", n=n_rej_nut)
        for m in merges:
            log.add("dedupe", "merge", "merged", uid=m["primary_uid"], detail=f"{m['name']} <- {m['members']}",
                    n=m["n_members"] - 1)
        log.table("dedupe_rejected", pd.DataFrame(rejected))
    return merged, merges_df
