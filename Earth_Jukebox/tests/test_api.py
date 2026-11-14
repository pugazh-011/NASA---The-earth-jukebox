"""API + repository tests. Uses tiny SYNTHETIC fixtures that exist only inside
temporary folders during tests. They are never shipped as project data.
Run:  python -m unittest discover -s tests -v
"""
import atexit
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import create_app  # noqa: E402
from app.config import Config  # noqa: E402


_TMP_DIRS = []
atexit.register(lambda: [t.cleanup() for t in _TMP_DIRS])


def make_client(csv_text: str, meta: dict | None = None):
    tmp = tempfile.TemporaryDirectory()
    d = Path(tmp.name)
    (d / "d.csv").write_text(csv_text, encoding="utf-8")
    (d / "m.json").write_text(json.dumps(meta or {"unit": "x", "verification": {"nasa_only_rule_checked": True}}), encoding="utf-8")
    cfg = Config(data_file=d / "d.csv", metadata_file=d / "m.json", frontend_dir=ROOT / "frontend")
    app = create_app(cfg)
    app.config["TESTING"] = True
    client = app.test_client()
    _TMP_DIRS.append(tmp)  # keep alive until interpreter exit
    return client, d


def sample_csv(n_days=120, step=10):
    lines = ["date,value"]
    from datetime import date, timedelta
    d0 = date(2000, 1, 1)
    for i in range(0, n_days, step):
        lines.append(f"{(d0 + timedelta(days=i)).isoformat()},{math.sin(i / 20):.6f}")
    return "\n".join(lines) + "\n"


class ApiTests(unittest.TestCase):
    def test_header_only_csv_waits_for_data(self):
        c, _ = make_client("date,value\n")
        r = c.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["status"], "waiting_for_data")
        r = c.get("/api/data")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json().get("error") is not None, True)

    def test_missing_file_is_404_for_data(self):
        c, d = make_client("date,value\n")
        (d / "d.csv").unlink()
        self.assertEqual(c.get("/api/data").status_code, 404)

    def test_data_roundtrip_preserves_values(self):
        c, _ = make_client("date,value\n2000-01-01,1.5\n2000-01-08,-2.25\n")
        j = c.get("/api/data").get_json()
        self.assertEqual(j["observations"], [
            {"date": "2000-01-01", "value": 1.5},
            {"date": "2000-01-08", "value": -2.25},
        ])
        self.assertEqual(j["summary"]["minimum"], -2.25)
        self.assertEqual(j["summary"]["maximum"], 1.5)

    def test_date_filter_inclusive(self):
        c, _ = make_client(sample_csv())
        j = c.get("/api/data?start=2000-01-11&end=2000-01-31").get_json()
        self.assertEqual([o["date"] for o in j["observations"]],
                         ["2000-01-11", "2000-01-21", "2000-01-31"])

    def test_bad_inputs(self):
        c, _ = make_client(sample_csv())
        self.assertEqual(c.get("/api/data?start=nope").status_code, 400)
        self.assertEqual(c.get("/api/data?start=2001-01-01&end=2000-01-01").status_code, 400)
        self.assertEqual(c.get("/api/data?resample=hourly").status_code, 400)

    def test_invalid_and_duplicate_rows_are_dropped_and_reported(self):
        csv = "date,value\n2000-01-01,1\nnot-a-date,2\n2000-01-02,abc\n2000-01-03,3\n2000-01-03,4\n"
        c, _ = make_client(csv)
        j = c.get("/api/data").get_json()
        self.assertEqual([o["date"] for o in j["observations"]], ["2000-01-01", "2000-01-03"])
        self.assertEqual(j["observations"][1]["value"], 4.0)  # last duplicate wins
        m = c.get("/api/metadata").get_json()
        self.assertEqual(m["rows_dropped_invalid"], 2)
        self.assertEqual(m["rows_dropped_duplicate_dates"], 1)

    def test_missing_column(self):
        c, _ = make_client("when,val\n2000-01-01,1\n")
        r = c.get("/api/data")
        self.assertEqual(r.status_code, 400)
        self.assertIn("missing required", r.get_json()["error"])

    def test_monthly_resample_is_mean(self):
        c, _ = make_client("date,value\n2000-01-01,1\n2000-01-15,3\n2000-02-01,10\n")
        j = c.get("/api/data?resample=monthly").get_json()
        self.assertEqual(j["observations"], [
            {"date": "2000-01-01", "value": 2.0},
            {"date": "2000-02-01", "value": 10.0},
        ])
        self.assertIn("monthly means", j["query"]["note"])

    def test_metadata_has_full_range_and_warnings(self):
        c, _ = make_client(sample_csv(), meta={"unit": None, "source_name": "REPLACE_ME"})
        m = c.get("/api/metadata").get_json()
        self.assertEqual(m["metadata_status"], "incomplete")
        self.assertTrue(any("placeholder" in w for w in m["metadata_warnings"]))
        self.assertTrue(any("Unit" in w for w in m["metadata_warnings"]))
        self.assertTrue(any("provenance" in w for w in m["metadata_warnings"]))
        self.assertTrue(m["dataset_loaded"])
        self.assertLess(m["value_min"], m["value_max"])

    def test_reloads_when_file_changes(self):
        c, d = make_client("date,value\n2000-01-01,1\n")
        self.assertEqual(c.get("/api/health").get_json()["rows"], 1)
        import os, time
        (d / "d.csv").write_text("date,value\n2000-01-01,1\n2000-01-08,2\n")
        st = (d / "d.csv").stat()
        os.utime(d / "d.csv", (st.st_atime, st.st_mtime + 5))
        self.assertEqual(c.get("/api/health").get_json()["rows"], 2)

    def test_index_served(self):
        c, _ = make_client("date,value\n")
        r = c.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"Earth", r.data)
        r.close()


if __name__ == "__main__":
    unittest.main()
