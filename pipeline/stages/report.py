"""Event log shared by all stages. Every drop / merge / decision lands here and is rendered by export."""
from __future__ import annotations

from typing import Any

import pandas as pd


class Log:
    """Append-only list of events: {stage, kind, reason, source, uid, detail, n}."""

    COLUMNS = ["stage", "kind", "reason", "source", "uid", "detail", "n"]

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.tables: dict[str, pd.DataFrame] = {}

    def add(self, stage: str, kind: str, reason: str, source: str | None = None, uid: str | None = None,
            detail: str = "", n: int = 1) -> None:
        self.events.append(
            {"stage": stage, "kind": kind, "reason": reason, "source": source, "uid": uid, "detail": detail, "n": n}
        )

    def warn(self, stage: str, reason: str, source: str | None = None, detail: str = "", n: int = 1) -> None:
        self.add(stage, "warning", reason, source=source, detail=detail, n=n)

    def table(self, name: str, df: pd.DataFrame) -> None:
        self.tables[name] = df

    def frame(self) -> pd.DataFrame:
        if not self.events:
            return pd.DataFrame(columns=self.COLUMNS)
        return pd.DataFrame(self.events, columns=self.COLUMNS)

    def summary(self, stage: str | None = None, kind: str | None = None) -> pd.DataFrame:
        f = self.frame()
        if stage:
            f = f[f["stage"] == stage]
        if kind:
            f = f[f["kind"] == kind]
        if f.empty:
            return pd.DataFrame(columns=["source", "reason", "n"])
        return f.fillna({"source": ""}).groupby(["source", "reason"], as_index=False)["n"].sum()
