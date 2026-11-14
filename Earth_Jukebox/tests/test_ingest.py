import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import ingest_nasa_ssh as ing  # noqa: E402


class IngestTests(unittest.TestCase):
    def test_decimal_year(self):
        self.assertEqual(ing.decimal_year_to_date(2000.0), date(2000, 1, 1))
        d = ing.decimal_year_to_date(2001.5)
        self.assertEqual((d.year, d.month), (2001, 7))

    def test_iso_dates_with_header_and_comments(self):
        text = "# NASA header\nDate Value\n2000-01-08 1.5\n2000-01-01 -0.5\n\n"
        r = ing.ingest(text, [0], 1, [])
        self.assertEqual(r.rows, [("2000-01-01", -0.5), ("2000-01-08", 1.5)])
        self.assertGreaterEqual(r.skipped_header_or_blank, 3)

    def test_three_column_date(self):
        r = ing.ingest("2000 1 8 0.25\n2000 1 15 0.5\n", [0, 1, 2], 3, [])
        self.assertEqual(r.rows[0], ("2000-01-08", 0.25))

    def test_fill_values_dropped_not_kept(self):
        r = ing.ingest("2000.0 1.0\n2000.1 99999\n2000.2 2.0\n", [0], 1, [99999.0])
        self.assertEqual(len(r.rows), 2)
        self.assertEqual(r.skipped_fill, 1)

    def test_values_unchanged(self):
        r = ing.ingest("2000-01-01,0.123456789012\n", [0], 1, [])
        self.assertEqual(r.rows[0][1], 0.123456789012)

    def test_duplicate_dates_rejected(self):
        with self.assertRaises(ing.IngestError):
            ing.ingest("2000-01-01 1\n2000-01-01 2\n", [0], 1, [])

    def test_nothing_parseable(self):
        with self.assertRaises(ing.IngestError):
            ing.ingest("hello world\nfoo bar\n", [0], 1, [])


if __name__ == "__main__":
    unittest.main()
