"""Data access layer: load, validate, filter, resample and summarise the CSV.

Rules this module enforces
--------------------------
* Never invents data. No synthetic fallback, ever.
* Never changes a value except through an explicit, labelled `resample`.
* Reports what it dropped so problems are visible instead of silent.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"date", "value"}
RESAMPLE_RULES = {"none": None, "monthly": "MS", "yearly": "YS"}


class DatasetError(Exception):
    """Raised when the dataset is missing or unusable."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class LoadReport:
    rows_in_file: int
    rows_valid: int
    rows_invalid: int
    rows_duplicate_dates: int


class DatasetRepository:
    """Loads the CSV once and reloads automatically if the file changes."""

    def __init__(self, csv_path: Path):
        self._path = Path(csv_path)
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._df: pd.DataFrame | None = None
        self._report: LoadReport | None = None

    def _read(self) -> tuple[pd.DataFrame, LoadReport]:
        if not self._path.exists():
            raise DatasetError(
                f"Dataset file not found: {self._path.name}. "
                "Create it with scripts/ingest_nasa_ssh.py.",
                status=404,
            )
        try:
            raw = pd.read_csv(self._path)
        except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
            raise DatasetError(f"Could not parse CSV: {exc}") from exc

        missing = REQUIRED_COLUMNS - set(raw.columns)
        if missing:
            raise DatasetError(
                "CSV is missing required column(s): " + ", ".join(sorted(missing))
            )

        df = raw[["date", "value"]].copy()
        # Strict ISO dates (YYYY-MM-DD); anything else becomes NaT and is counted.
        df["date"] = pd.to_datetime(df["date"], format="%Y-%m-%d", errors="coerce")
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        df["value"] = df["value"].replace([np.inf, -np.inf], np.nan)

        valid = df.dropna(subset=["date", "value"])
        n_invalid = len(df) - len(valid)

        valid = valid.sort_values("date")
        n_before = len(valid)
        valid = valid.drop_duplicates(subset="date", keep="last")
        n_dupes = n_before - len(valid)
        valid = valid.reset_index(drop=True)

        if valid.empty:
            raise DatasetError(
                "The CSV has no valid observations. Check the date (YYYY-MM-DD) "
                "and value columns."
            )
        if n_invalid or n_dupes:
            log.warning("Dataset cleaning: %s invalid rows, %s duplicate dates", n_invalid, n_dupes)

        return valid, LoadReport(len(raw), len(valid), n_invalid, n_dupes)

    def _ensure_loaded(self) -> pd.DataFrame:
        with self._lock:
            mtime = self._path.stat().st_mtime if self._path.exists() else None
            if self._df is None or mtime != self._mtime:
                self._df, self._report = self._read()
                self._mtime = mtime
            return self._df

    @property
    def report(self) -> LoadReport | None:
        return self._report

    def coverage(self) -> dict:
        """Facts about the WHOLE dataset (not a filtered window)."""
        df = self._ensure_loaded()
        r = self._report
        return {
            "rows": int(len(df)),
            "first_date": df["date"].iloc[0].strftime("%Y-%m-%d"),
            "last_date": df["date"].iloc[-1].strftime("%Y-%m-%d"),
            "value_min": float(df["value"].min()),
            "value_max": float(df["value"].max()),
            "value_mean": float(df["value"].mean()),
            "rows_dropped_invalid": r.rows_invalid if r else 0,
            "rows_dropped_duplicate_dates": r.rows_duplicate_dates if r else 0,
        }

    def query(
        self,
        start: date | None = None,
        end: date | None = None,
        resample: str = "none",
    ) -> pd.DataFrame:
        if resample not in RESAMPLE_RULES:
            raise DatasetError(
                f"Invalid resample '{resample}'. Use one of: {', '.join(RESAMPLE_RULES)}."
            )
        if start and end and start > end:
            raise DatasetError("'start' must be on or before 'end'.")

        df = self._ensure_loaded()
        if start:
            df = df[df["date"] >= pd.Timestamp(start)]
        if end:
            df = df[df["date"] <= pd.Timestamp(end)]

        rule = RESAMPLE_RULES[resample]
        if rule and not df.empty:
            df = (
                df.set_index("date")["value"]
                .resample(rule)
                .mean()
                .dropna()
                .reset_index()
            )
        return df.reset_index(drop=True)

    @staticmethod
    def summarise(df: pd.DataFrame) -> dict | None:
        if df.empty:
            return None
        v = df["value"].to_numpy(dtype=float)
        return {
            "count": int(v.size),
            "minimum": float(v.min()),
            "maximum": float(v.max()),
            "mean": float(v.mean()),
        }
