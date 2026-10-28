"""Shared test helpers: puts pipeline/ on sys.path and builds small DataFrames."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
if str(PIPELINE) not in sys.path:
    sys.path.insert(0, str(PIPELINE))
if str(PIPELINE / "fixtures") not in sys.path:
    sys.path.insert(0, str(PIPELINE / "fixtures"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from stages.names import clean_names, load_rules  # noqa: E402
from stages.schema import NUTRIENT_KEYS  # noqa: E402

REPO_ROOT = PIPELINE.parent


def make_foods(rows: list[dict]) -> pd.DataFrame:
    """rows: dict(source, source_id, raw_name, [source_group], [approx_keys], **nutrients) -> per-source foods frame
    as produced by names + normalize.to_wide."""
    items = pd.DataFrame({
        "source": [r["source"] for r in rows],
        "source_id": [str(r["source_id"]) for r in rows],
        "raw_name": [r["raw_name"] for r in rows],
        "source_group": [r.get("source_group", "") for r in rows],
        "alt_names": [[] for _ in rows],
        "abbreviated": False,
    })
    items["uid"] = items["source"] + ":" + items["source_id"]
    named = clean_names(items, load_rules())
    for k in NUTRIENT_KEYS:
        named[k] = [r.get(k, np.nan) for r in rows]
    named["approx_keys"] = [r.get("approx_keys", "") for r in rows]
    return named


def tmpdir() -> tempfile.TemporaryDirectory:
    return tempfile.TemporaryDirectory(prefix="eighty_test_")
