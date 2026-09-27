import sqlite3
import tempfile
import unittest
from contextlib import closing
from datetime import datetime
from pathlib import Path
from api_budget import reserve, BudgetExhausted
from private_collection import active


class CollectionControlsTest(unittest.TestCase):
    def test_budget_persists_and_reserves_core_capacity(self):
        with tempfile.TemporaryDirectory() as folder:
            db, log = Path(folder) / "db.sqlite", Path(folder) / "log"
            reserve(db, log, True)
            with closing(sqlite3.connect(db)) as c, c:
                self.assertEqual(c.execute("select total, private from api_budget").fetchone(), (1, 1))
                c.execute("update api_budget set private=800")
            with self.assertRaises(BudgetExhausted):
                reserve(db, log, True)
            reserve(db, log)
            with closing(sqlite3.connect(db)) as c, c:
                c.execute("update api_budget set total=9000")
            with self.assertRaises(BudgetExhausted):
                reserve(db, log)

    def test_legacy_calls_are_counted(self):
        with tempfile.TemporaryDirectory() as folder:
            db, log = Path(folder) / "db.sqlite", Path(folder) / "log"
            log.write_text(f"{datetime.now().date()}T08:00 route=M4137 checked=14\n")
            reserve(db, log)
            with closing(sqlite3.connect(db)) as c, c:
                self.assertEqual(c.execute("select total from api_budget").fetchone()[0], 15)

    def test_direction_weekend_and_midnight(self):
        info = {"upFirstTime": "05:00", "upLastTime": "23:00", "downFirstTime": "06:00", "downLastTime": "00:10", "satUpFirstTime": "06:00", "satUpLastTime": "22:00"}
        outward = {"stationSeq": "2", "turnSeq": "10"}
        returning = {"stationSeq": "10", "turnSeq": "10"}
        self.assertTrue(active(info, returning, datetime(2026, 9, 28, 0, 5)))
        self.assertFalse(active(info, returning, datetime(2026, 9, 28, 3)))
        self.assertFalse(active(info, outward, datetime(2026, 9, 26, 5, 30)))
        self.assertTrue(active(info, outward, datetime(2026, 9, 26, 6)))


if __name__ == "__main__":
    unittest.main()
