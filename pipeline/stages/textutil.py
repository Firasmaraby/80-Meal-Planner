"""Small text helpers shared by several stages (stdlib only)."""
from __future__ import annotations

import hashlib
import re
import unicodedata

_SINGULAR_KEEP = {
    "molasses", "hummus", "asparagus", "couscous", "swiss", "citrus", "octopus", "lotus", "cactus",
    "grits", "series", "species", "bass", "watercress", "cress", "glass", "brussels", "chives",
    "anise", "hibiscus", "lemongrass", "haggis", "dulce", "papadums",
}
# words where trailing "s" must not be stripped even though the list above does not cover them
_SS = ("ss", "us", "is")


def fold(s: str) -> str:
    """Lower-case and strip accents (NFKD)."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def singular(w: str) -> str:
    """Very small English singulariser used for MATCHING only (never for display)."""
    if w in _SINGULAR_KEEP:
        return w
    if len(w) <= 3 or not w.isalpha():
        return w
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if re.search(r"(ch|sh|x|z|ss)es$", w):
        return w[:-2]
    if w.endswith("oes"):
        return w[:-2]
    if w.endswith(_SS) or not w.endswith("s"):
        return w
    return w[:-1]


_TOKEN_RE = re.compile(r"[a-z0-9%]+(?:[./][0-9]+)?")


def raw_tokens(s: str) -> list[str]:
    return _TOKEN_RE.findall(fold(s).replace("'", ""))


def slugify(s: str, max_len: int = 60) -> str:
    s = fold(s).replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > max_len:
        s = s[:max_len].rsplit("-", 1)[0] or s[:max_len]
    return s or "food"


def short_hash(s: str, n: int = 6) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:n]


def clean_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()
