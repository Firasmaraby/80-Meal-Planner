"""Name similarity. Uses rapidfuzz when it is importable (faster), otherwise difflib. Both return 0..1."""
from __future__ import annotations

from difflib import SequenceMatcher

try:  # optional speed-up
    from rapidfuzz import fuzz as _fuzz  # type: ignore

    HAVE_RAPIDFUZZ = True
except Exception:  # pragma: no cover - rapidfuzz is not installed in the dev environment
    _fuzz = None
    HAVE_RAPIDFUZZ = False


def similarity(a: str, b: str) -> float:
    """Normalised edit similarity of two (already normalised, token-sorted) strings."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    if HAVE_RAPIDFUZZ:
        return _fuzz.ratio(a, b) / 100.0
    sm = SequenceMatcher(None, a, b, autojunk=False)
    if sm.real_quick_ratio() < 0.5 or sm.quick_ratio() < 0.5:
        return sm.quick_ratio() * 0.5  # cheap upper bound is already below any sensible threshold
    return sm.ratio()


def jaccard(a: frozenset | set, b: frozenset | set) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)
