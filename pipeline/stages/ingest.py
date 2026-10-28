"""Stage 1 - ingest: Excel sheets -> long dataframe.

Output of `ingest_frames` (all pure over DataFrames):
  items     one row per source food: uid, source, source_id, raw_name, source_group, alt_names
  long      one row per (food, nutrient) with a non-missing parsed value:
            source, source_id, raw_name, nutrient, value, unit  (+ prio, col, uid)
            `value`/`unit` are RAW (source units). normalize.py converts them.
  portions  household measures if the source gives them: source, source_id, label, grams, seq

Missing values are never turned into 0: unparseable cells and markers like "Tr", "N", "-" are simply absent.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from .report import Log
from .schema import CANONICAL_UNIT, NUTRIENT_KEYS

MISSING_MARKERS = {
    "", "-", "--", "---", "–", "—", "n", "nd", "na", "n/a", "nan", "null", "none", "tr", "trace",
    "?", "x", "*", "..", "...", "<", "nr", "not determined", "not analysed", "not analyzed", "missing",
}

_NUM_RE = re.compile(r"^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$")


def norm_col(s: Any) -> str:
    """Tolerant column-name key: lower-case alphanumerics only ('Energ_Kcal' == 'energ kcal')."""
    return re.sub(r"[^0-9a-zµμ%]+", "", str(s).lower().replace("μ", "µ"))


def as_list(x: Any) -> list:
    if x is None:
        return []
    return list(x) if isinstance(x, (list, tuple)) else [x]


def resolve_column(df: pd.DataFrame, candidates: Any) -> str | None:
    """First candidate that exists in df (tolerant match), else None."""
    index: dict[str, str] = {}
    for c in df.columns:
        index.setdefault(norm_col(c), c)
    for cand in as_list(candidates):
        k = norm_col(cand)
        if k in index:
            return index[k]
    return None


def resolve_sheet(name: str, available: list[str]) -> str | None:
    if name in available:
        return name
    low = {norm_col(a): a for a in available}
    return low.get(norm_col(name))


def id_str(x: Any, pad: int | None = None) -> str | None:
    """Stringify an id cell. 1001.0 -> '1001'; optional zero padding (SR NDB_No is 5 digits)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    s = str(x).strip()
    if not s or s.lower() == "nan":
        return None
    if pad and s.isdigit():
        s = s.zfill(pad)
    return s


def parse_value(x: Any) -> tuple[float, str]:
    """Parse one cell. Returns (value or NaN, status) with status in
    ok | empty | marker | unparseable."""
    if x is None:
        return math.nan, "empty"
    if isinstance(x, bool):
        return math.nan, "unparseable"
    if isinstance(x, (int, float)):
        if isinstance(x, float) and math.isnan(x):
            return math.nan, "empty"
        return float(x), "ok"
    s = str(x).strip()
    low = s.lower()
    if low in MISSING_MARKERS:
        return math.nan, "empty" if low == "" else "marker"
    # estimated values in brackets, e.g. CoFID "[0.5]" or "(0.5)"
    m = re.fullmatch(r"[\[(]\s*(.+?)\s*[\])]", s)
    if m:
        s = m.group(1)
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", s):
        s = s.replace(",", "")
    elif re.fullmatch(r"[-+]?\d+,\d+", s):
        s = s.replace(",", ".")
    if _NUM_RE.match(s):
        return float(s), "ok"
    # "<0.1", "~5", "5 g": censored / annotated values are treated as missing, not guessed
    return math.nan, "unparseable"


def parse_series(s: pd.Series) -> tuple[pd.Series, int]:
    """Vectorised parse_value. Returns (float series, number of unparseable non-marker cells)."""
    num = pd.to_numeric(s, errors="coerce")
    bad = num.isna() & s.notna()
    unparseable = 0
    if bad.any():
        fixed = {}
        for idx, v in s[bad].items():
            val, status = parse_value(v)
            if status == "ok":
                fixed[idx] = val
            elif status == "unparseable":
                unparseable += 1
        if fixed:
            num = num.copy()
            for idx, val in fixed.items():
                num.at[idx] = val
    return num.astype(float), unparseable


@dataclass
class IngestResult:
    items: pd.DataFrame
    long: pd.DataFrame
    portions: pd.DataFrame
    per_source_rows: dict[str, int] = field(default_factory=dict)


LONG_COLUMNS = ["source", "source_id", "raw_name", "nutrient", "value", "unit", "prio", "col", "uid"]
ITEM_COLUMNS = ["uid", "source", "source_id", "raw_name", "source_group", "alt_names", "abbreviated"]
PORTION_COLUMNS = ["source", "source_id", "label", "grams", "seq"]


def _frame(frames: dict, sheet: str, header_row: int, log: Log, source: str) -> pd.DataFrame | None:
    """Look up a parsed sheet. `frames` is keyed by (sheet, header_row) or by plain sheet name."""
    available = sorted({(k[0] if isinstance(k, tuple) else k) for k in frames})
    real = resolve_sheet(sheet, available)
    if real is None:
        log.warn("ingest", "sheet_not_found", source=source, detail=f"{sheet!r}; available: {available}")
        return None
    if (real, header_row) in frames:
        return frames[(real, header_row)]
    if real in frames:
        return frames[real]
    for k, v in frames.items():
        if isinstance(k, tuple) and k[0] == real:
            return v
    return None


def required_sheets(cfg: dict, only: list[str] | None = None) -> list[tuple[str, int]]:
    """(sheet, header_row) pairs the config needs, so the workbook is only parsed for what is used."""
    out: list[tuple[str, int]] = []
    for s in select_sources(cfg, only):
        hdr = int(s.get("header_row", 0))
        out.append((s["sheet"], hdr))
        lg = s.get("long") or {}
        if lg.get("nutrient_lookup"):
            out.append((lg["nutrient_lookup"]["sheet"], int(lg["nutrient_lookup"].get("header_row", 0))))
        nm = s.get("names") or {}
        if nm.get("sheet"):
            out.append((nm["sheet"], int(nm.get("header_row", 0))))
        if nm.get("group_lookup"):
            out.append((nm["group_lookup"]["sheet"], int(nm["group_lookup"].get("header_row", 0))))
        p = s.get("portions") or {}
        if p.get("sheet"):
            out.append((p["sheet"], int(p.get("header_row", 0))))
        if p.get("measure_lookup"):
            out.append((p["measure_lookup"]["sheet"], int(p["measure_lookup"].get("header_row", 0))))
    seen, uniq = set(), []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def select_sources(cfg: dict, only: list[str] | None = None) -> list[dict]:
    srcs = [s for s in cfg["sources"] if s.get("enabled", True)]
    if only:
        want = {norm_col(o) for o in only}
        srcs = [s for s in srcs if norm_col(s["key"]) in want or norm_col(s["sheet"]) in want]
    return srcs


# --------------------------------------------------------------------------- wide layout

def _spec_list(m: Any) -> list[dict]:
    return [m] if isinstance(m, dict) else list(m)


def _wide_values(df: pd.DataFrame, spec: dict, log: Log, source: str, nutrient: str
                 ) -> tuple[pd.Series, str] | None:
    """Evaluate one wide mapping spec -> (float series, label of source column)."""
    factor = float(spec.get("factor", 1.0))
    if "sum" in spec:
        total, any_ok, cols = None, None, []
        required = pd.Series(True, index=df.index)
        have_required = False
        for comp in spec["sum"]:
            col = resolve_column(df, comp["column"])
            if col is None:
                log.warn("ingest", "column_not_found", source=source, detail=f"{nutrient}: {comp['column']}")
                if not comp.get("optional"):
                    return None
                continue
            vals, bad = parse_series(df[col])
            if bad:
                log.warn("ingest", "unparseable_value", source=source, detail=f"{col}", n=bad)
            cols.append(col)
            f = float(comp.get("factor", 1.0))
            if comp.get("optional"):
                part = vals.fillna(0.0) * f
            else:
                part = vals * f
                required &= vals.notna()
                have_required = True
            total = part if total is None else total + part
        if total is None or not have_required:
            return None
        total = total.where(required)
        return total * factor, "+".join(cols)
    col = resolve_column(df, spec.get("column"))
    if col is None:
        log.warn("ingest", "column_not_found", source=source, detail=f"{nutrient}: {spec.get('column')}")
        return None
    vals, bad = parse_series(df[col])
    if bad:
        log.warn("ingest", "unparseable_value", source=source, detail=f"{col}", n=bad)
    return vals * factor, col


def _ingest_wide(src: dict, df: pd.DataFrame, log: Log) -> tuple[pd.DataFrame, pd.DataFrame]:
    key = src["key"]
    id_col = resolve_column(df, src["id_column"])
    name_col = resolve_column(df, src["name_column"])
    if id_col is None or name_col is None:
        log.warn("ingest", "id_or_name_column_not_found", source=key,
                 detail=f"id={src['id_column']} name={src['name_column']}; columns={list(df.columns)[:30]}")
        return pd.DataFrame(columns=ITEM_COLUMNS), pd.DataFrame(columns=LONG_COLUMNS)
    group_col = resolve_column(df, src.get("group_column")) if src.get("group_column") else None
    alias_cols = [c for c in (resolve_column(df, a) for a in as_list(src.get("alias_columns"))) if c]

    pad = src.get("id_pad")
    ids = df[id_col].map(lambda x: id_str(x, pad))
    names = df[name_col].map(lambda x: None if x is None or (isinstance(x, float) and math.isnan(x)) else str(x).strip())
    base = pd.DataFrame({"source_id": ids, "raw_name": names, "_pos": range(len(df))})
    if group_col:
        base["source_group"] = df[group_col].map(lambda x: "" if pd.isna(x) else str(x).strip())
    else:
        base["source_group"] = ""
    if alias_cols:
        def alts(i: int) -> list[str]:
            vals = []
            for c in alias_cols:
                v = df[c].iat[i]
                if pd.notna(v) and str(v).strip():
                    vals.extend([p.strip() for p in re.split(r"[;|]", str(v)) if p.strip()])
            return vals
        base["alt_names"] = [alts(i) for i in range(len(df))]
    else:
        base["alt_names"] = [[] for _ in range(len(df))]

    blank_id = base["source_id"].isna()
    blank_name = base["raw_name"].isna() | (base["raw_name"] == "")
    if blank_id.sum():
        log.add("ingest", "drop", "blank_id", source=key, n=int(blank_id.sum()))
    if (blank_name & ~blank_id).sum():
        log.add("ingest", "drop", "blank_name", source=key, n=int((blank_name & ~blank_id).sum()))
    keep = ~(blank_id | blank_name)
    dup = base["source_id"].duplicated() & keep
    if dup.sum():
        log.add("ingest", "drop", "duplicate_id", source=key, n=int(dup.sum()))
    keep &= ~dup
    base = base[keep]
    sub = df.iloc[base["_pos"].to_numpy()]

    rows = []
    for nutrient, m in src.get("nutrients", {}).items():
        if nutrient not in CANONICAL_UNIT:
            log.warn("ingest", "unknown_nutrient_key", source=key, detail=nutrient)
            continue
        for prio, spec in enumerate(_spec_list(m)):
            res = _wide_values(sub, spec, log, key, nutrient)
            if res is None:
                continue
            vals, col = res
            ok = vals.notna().to_numpy()
            if not ok.any():
                continue
            part = pd.DataFrame({
                "source_id": base["source_id"].to_numpy()[ok],
                "raw_name": base["raw_name"].to_numpy()[ok],
                "nutrient": nutrient,
                "value": vals.to_numpy()[ok],
                "unit": spec.get("unit") or CANONICAL_UNIT[nutrient],
                "prio": prio,
                "col": col,
            })
            rows.append(part)
    long = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=LONG_COLUMNS)
    items = base[["source_id", "raw_name", "source_group", "alt_names"]].reset_index(drop=True)
    return items, long


# --------------------------------------------------------------------------- long layout

def _ingest_long(src: dict, frames: dict, log: Log) -> tuple[pd.DataFrame, pd.DataFrame]:
    key = src["key"]
    hdr = int(src.get("header_row", 0))
    amt = _frame(frames, src["sheet"], hdr, log, key)
    lg = src.get("long") or {}
    nm = src.get("names") or {}
    if amt is None:
        return pd.DataFrame(columns=ITEM_COLUMNS), pd.DataFrame(columns=LONG_COLUMNS)
    id_col = resolve_column(amt, src["id_column"])
    ncol = resolve_column(amt, lg.get("nutrient_column"))
    vcol = resolve_column(amt, lg.get("value_column"))
    ucol = resolve_column(amt, lg.get("unit_column")) if lg.get("unit_column") else None
    if None in (id_col, ncol, vcol):
        log.warn("ingest", "long_columns_not_found", source=key,
                 detail=f"id={src['id_column']} nutrient={lg.get('nutrient_column')} value={lg.get('value_column')}; "
                        f"columns={list(amt.columns)[:30]}")
        return pd.DataFrame(columns=ITEM_COLUMNS), pd.DataFrame(columns=LONG_COLUMNS)

    pad = src.get("id_pad")
    work = pd.DataFrame({
        "source_id": amt[id_col].map(lambda x: id_str(x, pad)),
        "raw_key": amt[ncol].map(lambda x: norm_col(id_str(x) or "")),
    })
    work["value"], bad = parse_series(amt[vcol])
    if bad:
        log.warn("ingest", "unparseable_value", source=key, detail=vcol, n=bad)
    work["row_unit"] = amt[ucol].astype(str).str.strip() if ucol else ""

    match_on = lg.get("match_on", "code" if lg.get("nutrient_lookup") else "raw")
    work["code"] = work["raw_key"]
    work["nname"] = ""
    if lg.get("nutrient_lookup"):
        lk = lg["nutrient_lookup"]
        lkdf = _frame(frames, lk["sheet"], int(lk.get("header_row", 0)), log, key)
        if lkdf is not None:
            lid = resolve_column(lkdf, lk["id_column"])
            lcode = resolve_column(lkdf, lk.get("code_column")) if lk.get("code_column") else None
            lname = resolve_column(lkdf, lk.get("name_column")) if lk.get("name_column") else None
            lunit = resolve_column(lkdf, lk.get("unit_column")) if lk.get("unit_column") else None
            if lid:
                l2 = pd.DataFrame({
                    "raw_key": lkdf[lid].map(lambda x: norm_col(id_str(x) or "")),
                    "lcode": lkdf[lcode].map(lambda x: norm_col(id_str(x) or "")) if lcode else "",
                    "lname": lkdf[lname].map(lambda x: norm_col(x)) if lname else "",
                    "lunit": lkdf[lunit].astype(str).str.strip() if lunit else "",
                }).drop_duplicates("raw_key")
                work = work.merge(l2, on="raw_key", how="left")
                work["code"] = work["lcode"].fillna("")
                work["nname"] = work["lname"].fillna("")
                if lunit:
                    work["row_unit"] = work["row_unit"].where(work["row_unit"].astype(bool), work["lunit"].fillna(""))
    match_col = {"raw": "raw_key", "code": "code", "name": "nname"}[match_on]

    work = work[work["source_id"].notna() & work["value"].notna()]
    rows = []
    for nutrient, m in src.get("nutrients", {}).items():
        if nutrient not in CANONICAL_UNIT:
            log.warn("ingest", "unknown_nutrient_key", source=key, detail=nutrient)
            continue
        for prio, spec in enumerate(_spec_list(m)):
            toks = {norm_col(t) for t in as_list(spec.get("match"))}
            if not toks:
                log.warn("ingest", "long_mapping_without_match", source=key, detail=nutrient)
                continue
            sel = work[work[match_col].isin(toks)]
            if sel.empty:
                continue
            unit = spec.get("unit")
            rows.append(pd.DataFrame({
                "source_id": sel["source_id"].to_numpy(),
                "nutrient": nutrient,
                "value": sel["value"].to_numpy() * float(spec.get("factor", 1.0)),
                "unit": unit if unit else sel["row_unit"].replace("", CANONICAL_UNIT[nutrient]).to_numpy(),
                "prio": prio,
                "col": "|".join(sorted(toks)),
            }))
    long = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=LONG_COLUMNS)

    # names / items
    nm_df = _frame(frames, nm.get("sheet", src["sheet"]), int(nm.get("header_row", 0)), log, key)
    if nm_df is None or not nm:
        log.warn("ingest", "names_sheet_missing", source=key)
        return pd.DataFrame(columns=ITEM_COLUMNS), pd.DataFrame(columns=LONG_COLUMNS)
    nid = resolve_column(nm_df, nm["id_column"])
    nname = resolve_column(nm_df, nm["name_column"])
    if nid is None or nname is None:
        log.warn("ingest", "names_columns_not_found", source=key, detail=str(list(nm_df.columns)[:30]))
        return pd.DataFrame(columns=ITEM_COLUMNS), pd.DataFrame(columns=LONG_COLUMNS)
    items = pd.DataFrame({
        "source_id": nm_df[nid].map(lambda x: id_str(x, pad)),
        "raw_name": nm_df[nname].map(lambda x: "" if pd.isna(x) else str(x).strip()),
    })
    gcol = resolve_column(nm_df, nm.get("group_column")) if nm.get("group_column") else None
    items["source_group"] = nm_df[gcol].map(lambda x: "" if pd.isna(x) else str(x).strip()) if gcol else ""
    gl = nm.get("group_lookup")
    if gl and gcol:
        gdf = _frame(frames, gl["sheet"], int(gl.get("header_row", 0)), log, key)
        if gdf is not None:
            gid, gname = resolve_column(gdf, gl["id_column"]), resolve_column(gdf, gl["name_column"])
            if gid and gname:
                gmap = {id_str(a): str(b) for a, b in zip(gdf[gid], gdf[gname])}
                items["source_group"] = nm_df[gcol].map(lambda x: gmap.get(id_str(x), "") if pd.notna(x) else "")
    acols = [c for c in (resolve_column(nm_df, a) for a in as_list(src.get("alias_columns"))) if c]
    items["alt_names"] = [
        [p.strip() for c in acols for p in re.split(r"[;|]", str(nm_df[c].iat[i])) if pd.notna(nm_df[c].iat[i]) and p.strip()]
        for i in range(len(nm_df))
    ] if acols else [[] for _ in range(len(nm_df))]
    bi = items["source_id"].isna()
    bn = items["raw_name"] == ""
    if bi.sum():
        log.add("ingest", "drop", "blank_id", source=key, n=int(bi.sum()))
    if (bn & ~bi).sum():
        log.add("ingest", "drop", "blank_name", source=key, n=int((bn & ~bi).sum()))
    items = items[~(bi | bn)]
    dup = items["source_id"].duplicated()
    if dup.sum():
        log.add("ingest", "drop", "duplicate_id", source=key, n=int(dup.sum()))
    items = items[~dup].reset_index(drop=True)
    name_by_id = dict(zip(items["source_id"], items["raw_name"]))
    long = long[long["source_id"].isin(name_by_id)].copy()
    long["raw_name"] = long["source_id"].map(name_by_id)
    return items, long


# --------------------------------------------------------------------------- portions

def _fmt_amount(a: float) -> str:
    if a is None or (isinstance(a, float) and math.isnan(a)):
        return ""
    fracs = {0.25: "1/4", 0.5: "1/2", 0.75: "3/4", 0.33: "1/3", 0.67: "2/3", 0.125: "1/8"}
    whole = int(a)
    rem = round(a - whole, 2)
    if rem == 0:
        return str(whole)
    for f, txt in fracs.items():
        if abs(rem - f) < 0.011:
            return f"{whole} {txt}" if whole else txt
    return f"{a:g}"


def make_label(amount: Any, desc: Any) -> str:
    d = re.sub(r"\s+", " ", str(desc if pd.notna(desc) else "")).strip().lower()
    if not d:
        return ""
    if re.match(r"^\d", d):
        return d
    a = ""
    if amount is not None and pd.notna(amount):
        try:
            a = _fmt_amount(float(amount))
        except (TypeError, ValueError):
            a = str(amount).strip()
    return f"{a} {d}".strip()


def _ingest_portions(src: dict, frames: dict, log: Log) -> pd.DataFrame:
    p = src.get("portions")
    if not p:
        return pd.DataFrame(columns=PORTION_COLUMNS)
    key = src["key"]
    pad = src.get("id_pad")
    sheet = p.get("sheet", src["sheet"])
    df = _frame(frames, sheet, int(p.get("header_row", src.get("header_row", 0) if sheet == src["sheet"] else 0)), log, key)
    if df is None:
        return pd.DataFrame(columns=PORTION_COLUMNS)
    idc = resolve_column(df, p.get("id_column", src["id_column"]))
    if idc is None:
        log.warn("ingest", "portion_id_column_not_found", source=key)
        return pd.DataFrame(columns=PORTION_COLUMNS)
    out = []
    if p.get("layout", "long") == "wide_pairs":
        ids = df[idc].map(lambda x: id_str(x, pad))
        for seq, pair in enumerate(p["pairs"], start=1):
            gc, dc = resolve_column(df, pair["grams"]), resolve_column(df, pair["desc"])
            ac = resolve_column(df, pair["amount"]) if pair.get("amount") else None
            if gc is None or dc is None:
                log.warn("ingest", "portion_column_not_found", source=key, detail=str(pair))
                continue
            g, _ = parse_series(df[gc])
            part = pd.DataFrame({
                "source_id": ids,
                "label": [make_label(df[ac].iat[i] if ac else None, df[dc].iat[i]) for i in range(len(df))],
                "grams": g.round(4),
                "seq": seq,
            })
            out.append(part.drop_duplicates(["source_id", "seq"], keep="first"))
    else:
        gc = resolve_column(df, p.get("grams_column")) if p.get("grams_column") else None
        fc = resolve_column(df, p.get("factor_column")) if p.get("factor_column") else None
        dc = resolve_column(df, p.get("desc_column")) if p.get("desc_column") else None
        ac = resolve_column(df, p.get("amount_column")) if p.get("amount_column") else None
        sc = resolve_column(df, p.get("seq_column")) if p.get("seq_column") else None
        mc = resolve_column(df, p.get("measure_id_column")) if p.get("measure_id_column") else None
        if (gc is None and fc is None) or (dc is None and mc is None):
            log.warn("ingest", "portion_columns_not_found", source=key, detail=str(list(df.columns)[:20]))
            return pd.DataFrame(columns=PORTION_COLUMNS)
        if gc is not None:
            grams, _ = parse_series(df[gc])
        else:
            fac, _ = parse_series(df[fc])
            grams = fac * 100.0  # CNF ConversionFactorValue multiplies 100 g
        descs = df[dc] if dc is not None else pd.Series([None] * len(df))
        if mc is not None and p.get("measure_lookup"):
            ml = p["measure_lookup"]
            mdf = _frame(frames, ml["sheet"], int(ml.get("header_row", 0)), log, key)
            if mdf is not None:
                mid, mname = resolve_column(mdf, ml["id_column"]), resolve_column(mdf, ml["name_column"])
                if mid and mname:
                    mmap = {id_str(a): str(b) for a, b in zip(mdf[mid], mdf[mname])}
                    descs = df[mc].map(lambda x: mmap.get(id_str(x), ""))
        part = pd.DataFrame({
            "source_id": df[idc].map(lambda x: id_str(x, pad)),
            "label": [make_label(df[ac].iat[i] if ac else None, descs.iat[i]) for i in range(len(df))],
            "grams": grams,
            "seq": df[sc].map(lambda x: parse_value(x)[0]) if sc else pd.Series(range(len(df))),
        })
        out.append(part)
    if not out:
        return pd.DataFrame(columns=PORTION_COLUMNS)
    res = pd.concat(out, ignore_index=True)
    res["grams"] = res["grams"].round(4)
    res = res[res["source_id"].notna() & (res["label"] != "") & res["grams"].notna() & (res["grams"] > 0)].copy()
    res.insert(0, "source", key)
    return res[PORTION_COLUMNS].reset_index(drop=True)


# --------------------------------------------------------------------------- entry points

def ingest_frames(frames: dict, cfg: dict, log: Log | None = None, only: list[str] | None = None) -> IngestResult:
    """Pure: parsed sheets + config -> IngestResult. `frames` keyed by (sheet, header_row) or sheet name."""
    log = log or Log()
    items_all, long_all, port_all = [], [], []
    counts: dict[str, int] = {}
    for src in select_sources(cfg, only):
        key = src["key"]
        layout = src.get("layout", "wide")
        if layout == "long":
            items, long = _ingest_long(src, frames, log)
        else:
            df = _frame(frames, src["sheet"], int(src.get("header_row", 0)), log, key)
            if df is None:
                continue
            items, long = _ingest_wide(src, df, log)
        items = items.drop(columns=[c for c in ("source", "uid", "abbreviated") if c in items]).copy()
        long = long.drop(columns=[c for c in ("source", "uid") if c in long])
        flag = src.get("name_is_abbreviated", "auto")
        if flag == "auto":
            nm = items["raw_name"].astype(str)
            flag = bool(len(nm)) and float(nm.map(lambda x: x.isupper()).mean()) >= 0.8
        items["abbreviated"] = bool(flag)
        items.insert(0, "source", key)
        items["uid"] = key + ":" + items["source_id"].astype(str)
        long = long.copy()
        long.insert(0, "source", key)
        long["uid"] = key + ":" + long["source_id"].astype(str)
        if "raw_name" not in long.columns:
            long["raw_name"] = ""
        counts[key] = len(items)
        log.add("ingest", "rows_in", "rows_in", source=key, n=len(items))
        log.add("ingest", "values_in", "nutrient_values_in", source=key, n=len(long))
        items_all.append(items[ITEM_COLUMNS])
        long_all.append(long[LONG_COLUMNS])
        pt = _ingest_portions(src, frames, log)
        if not pt.empty:
            pt = pt[pt["source_id"].isin(set(items["source_id"]))]
        if not pt.empty:
            port_all.append(pt)
    items = pd.concat(items_all, ignore_index=True) if items_all else pd.DataFrame(columns=ITEM_COLUMNS)
    long = pd.concat(long_all, ignore_index=True) if long_all else pd.DataFrame(columns=LONG_COLUMNS)
    portions = pd.concat(port_all, ignore_index=True) if port_all else pd.DataFrame(columns=PORTION_COLUMNS)
    return IngestResult(items=items, long=long, portions=portions, per_source_rows=counts)


def read_workbook(path: str, cfg: dict, only: list[str] | None = None, log: Log | None = None) -> dict:
    """Parse only the sheets the config needs. dtype=object keeps ids like '01001' and markers like 'Tr'."""
    log = log or Log()
    frames: dict = {}
    with pd.ExcelFile(path, engine="openpyxl") as xl:
        available = xl.sheet_names
        for sheet, hdr in required_sheets(cfg, only):
            real = resolve_sheet(sheet, available)
            if real is None:
                log.warn("ingest", "sheet_not_found", detail=f"{sheet!r}; available: {available}")
                continue
            if (real, hdr) in frames:
                continue
            frames[(real, hdr)] = xl.parse(real, header=hdr, dtype=object)
    return frames


def ingest(path: str, cfg: dict, log: Log | None = None, only: list[str] | None = None) -> IngestResult:
    log = log or Log()
    return ingest_frames(read_workbook(path, cfg, only, log), cfg, log, only)
