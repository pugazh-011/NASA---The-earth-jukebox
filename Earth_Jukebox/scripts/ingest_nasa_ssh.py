#!/usr/bin/env python3
"""Convert a NASA PO.DAAC indicator text file into data/nasa_enso.csv.

IMPORTANT: the exact column layout of NASA_SSH_ENSO_INDICATOR.txt could not be
confirmed while this tool was written. So the script does not guess silently:

  1. Run   --inspect   to look at the raw file.
  2. Tell the script which columns hold the date and the value.
  3. It refuses to write anything it cannot parse unambiguously.

It never changes values. It only reformats dates to YYYY-MM-DD.

Examples
--------
  python scripts/ingest_nasa_ssh.py --input raw/NASA_SSH_ENSO_INDICATOR.txt --inspect
  python scripts/ingest_nasa_ssh.py --input raw/NASA_SSH_ENSO_INDICATOR.txt \
         --date-col 0 --value-col 1 --output data/nasa_enso.csv
  # If the file stores year, month, day in three columns:
  python scripts/ingest_nasa_ssh.py --input raw.txt --date-cols 0 1 2 --value-col 3
"""
from __future__ import annotations

import argparse
import csv
import math
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")
COMMENT_PREFIXES = ("#", "%", "!", ";", "//")


class IngestError(Exception):
    pass


@dataclass
class IngestResult:
    rows: list[tuple[str, float]]
    skipped_header_or_blank: int
    skipped_fill: int
    skipped_unparseable: int


def decimal_year_to_date(x: float) -> date:
    """2020.5 -> a date about mid-2020. Exact to the day."""
    year = int(math.floor(x))
    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    return (start + (end - start) * (x - year)).date()


def split_fields(line: str) -> list[str]:
    return [t for t in re.split(r"[,\s;]+", line.strip()) if t]


def parse_date(tokens: list[str], date_cols: list[int]) -> date:
    if len(date_cols) == 3:
        y, m, d = (int(float(tokens[i])) for i in date_cols)
        return date(y, m, d)
    tok = tokens[date_cols[0]]
    if ISO_RE.match(tok):
        return date.fromisoformat(tok[:10])
    x = float(tok)
    if 1900.0 <= x <= 2200.0:
        return decimal_year_to_date(x)
    raise ValueError(f"Unrecognised date token '{tok}'")


def ingest(
    text: str,
    date_cols: list[int],
    value_col: int,
    fill_values: list[float],
) -> IngestResult:
    rows: list[tuple[str, float]] = []
    skipped_header = skipped_fill = skipped_bad = 0
    needed = max(date_cols + [value_col]) + 1

    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith(COMMENT_PREFIXES):
            skipped_header += 1
            continue
        tokens = split_fields(s)
        if len(tokens) < needed:
            skipped_header += 1  # short line: almost certainly header text
            continue
        try:
            d = parse_date(tokens, date_cols)
            v = float(tokens[value_col])
        except (ValueError, OverflowError):
            # A non-numeric first field is a header line; count it, don't hide it.
            skipped_header += 1
            continue
        if not math.isfinite(v):
            skipped_bad += 1
            continue
        if any(math.isclose(v, f, rel_tol=0, abs_tol=1e-9) for f in fill_values):
            skipped_fill += 1
            continue
        rows.append((d.isoformat(), v))

    if not rows:
        raise IngestError(
            "No data rows could be parsed. Run with --inspect and check "
            "--date-col / --date-cols / --value-col."
        )
    # Sort + reject duplicate dates loudly (do not silently pick one).
    rows.sort(key=lambda r: r[0])
    seen: set[str] = set()
    for d, _ in rows:
        if d in seen:
            raise IngestError(f"Duplicate date {d} in input. Check --date-col; refusing to guess.")
        seen.add(d)
    return IngestResult(rows, skipped_header, skipped_fill, skipped_bad)


def write_csv(path: Path, rows: list[tuple[str, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["date", "value"])
        for d, v in rows:
            w.writerow([d, repr(v)])  # repr keeps full float precision


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", required=True, type=Path, help="Raw NASA text file")
    p.add_argument("--output", type=Path, default=Path("data/nasa_enso.csv"))
    p.add_argument("--date-col", type=int, default=0, help="0-based column of the date (ISO or decimal year)")
    p.add_argument("--date-cols", type=int, nargs=3, metavar=("Y", "M", "D"), help="0-based columns of year, month, day")
    p.add_argument("--value-col", type=int, default=1, help="0-based column of the value")
    p.add_argument("--fill-value", type=float, action="append", default=[], help="Missing-data sentinel to drop (repeatable). Take it from the NASA user guide.")
    p.add_argument("--inspect", action="store_true", help="Print the first lines and exit")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.input.exists():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 2
    text = args.input.read_text(encoding="utf-8", errors="replace")

    if args.inspect:
        for i, line in enumerate(text.splitlines()[:60]):
            print(f"{i:>3}| {line}")
        print("\nNote which columns hold the date and the value, then re-run without --inspect.")
        return 0

    date_cols = list(args.date_cols) if args.date_cols else [args.date_col]
    try:
        result = ingest(text, date_cols, args.value_col, args.fill_value)
    except IngestError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    write_csv(args.output, result.rows)
    first, last = result.rows[0], result.rows[-1]
    print(f"Wrote {len(result.rows)} rows to {args.output}")
    print(f"  first: {first[0]} = {first[1]}")
    print(f"  last : {last[0]} = {last[1]}")
    print(f"  skipped: {result.skipped_header_or_blank} header/blank, "
          f"{result.skipped_fill} fill-value, {result.skipped_unparseable} non-finite")
    print("NEXT: compare 3-5 rows against the NASA source, then update data/metadata.json and DATASET_NOTES.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
