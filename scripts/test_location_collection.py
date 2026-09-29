import sqlite3
import unittest
from datetime import datetime, timedelta
from location_collection import KST, ingest, init_db, reserve, route_active, evaluate_route_exclusion


class LocationTest(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        init_db(self.conn)
        self.now = datetime(2026, 9, 29, 8, tzinfo=KST)
        self.meta = {"routeId": "r", "stations": [
            {"stationSeq": str(i), "stationId": str(i), "stationName": f"Stop{i}",
             "turnSeq": "6", "x": str(127+i*.001), "y": "37"} for i in range(1, 10)]}

    def tearDown(self):
        self.conn.close()

    def observe(self, seq, code, seats, minute=0, vehicle="v"):
        with self.conn:
            ingest(self.conn, "test", self.meta, {"routeId": "r", "vehId": vehicle,
                "stationSeq": str(seq), "stateCd": str(code), "remainSeatCnt": str(seats)},
                self.now+timedelta(minutes=minute))

    def rows(self):
        return self.conn.execute("select station_seq,remain_seat,evidence from station_passages order by id").fetchall()

    def test_full_after_previous_stop_not_diluted_by_distant_seats(self):
        self.observe(1, 2, 20)
        self.observe(4, 2, 0, 3)
        self.observe(5, 1, 3, 6)
        self.assertIn((5, 0, "previous_departure"), self.rows())
        self.assertNotIn((5, 20, "previous_departure"), self.rows())

    def test_arrival_first_record_is_not_replaced_by_boarding(self):
        self.observe(5, 1, 8)
        self.observe(5, 1, 0, 3)
        self.observe(5, 2, 0, 6)
        self.assertEqual(self.rows(), [(5, 8, "arrival")])

    def test_expired_pending_and_missing_seats(self):
        self.observe(4, 2, 0)
        self.observe(5, 2, -1, 9)
        self.assertEqual(self.rows(), [])

    def test_restarts_reuse_persisted_journey(self):
        self.observe(5, 1, 0)
        # ingest has no process-global state; the same connection models restart.
        self.observe(5, 1, 0, 3)
        self.assertEqual(len(self.rows()), 1)
        self.observe(8, 2, 0, 6)
        self.observe(1, 2, 20, 9)
        self.observe(5, 1, 5, 12)
        self.assertEqual(len([r for r in self.rows() if r[0] == 5]), 2)

    def test_small_reverse_jump_not_new_journey(self):
        self.observe(5, 1, 10)
        self.observe(4, 2, 0, 3)
        self.observe(5, 1, 0, 6)
        self.assertEqual(self.rows(), [(5, 10, "arrival")])

    def test_pass_through_and_long_gap_excluded(self):
        self.meta["stations"][4]["stationName"] = "Stop(미정차)"
        self.observe(4, 2, 0)
        self.observe(5, 1, 0, 3)
        self.assertEqual(self.rows(), [])
        self.assertEqual(self.conn.execute("select count(*) from location_history").fetchone()[0], 1)
        self.assertEqual(self.conn.execute("select count(*) from route_stop_daily").fetchone()[0], 1)
        self.meta["stations"][4]["stationName"] = "Stop5"
        self.meta["stations"][4]["x"] = "128"
        self.observe(4, 2, 0, 0, "other")
        self.observe(5, 2, 0, 3, "other")
        self.assertEqual(self.rows(), [])

    def test_route_monitor_deduplicates_and_preserves_any_zero(self):
        self.observe(5, 2, 8)
        self.observe(5, 2, 0, 3)
        self.assertEqual(self.conn.execute("select remain_seat from route_stop_daily where route_name='test'").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("select count(*) from route_stop_daily where route_name='test'").fetchone()[0], 1)

    def test_budget_counts_attempts_and_next_day_resets(self):
        self.assertTrue(reserve(self.conn, self.now))
        self.conn.execute("update location_api_budget set attempts=9000")
        self.conn.commit()
        self.assertFalse(reserve(self.conn, self.now))
        self.assertTrue(reserve(self.conn, self.now+timedelta(days=1)))

    def test_friday_overnight_uses_friday_schedule(self):
        info = {"downFirstTime": "06:00", "downLastTime": "00:30", "satDownFirstTime": "07:00", "satDownLastTime": "23:00"}
        self.assertTrue(route_active(info, datetime(2026, 9, 26, 0, 15, tzinfo=KST)))
        self.assertFalse(route_active(info, datetime(2026, 9, 26, 5, tzinfo=KST)))

    def test_never_full_exclusion_requires_300_stops_and_three_days(self):
        for day in range(3):
            for stop in range(100):
                self.conn.execute("insert into route_stop_daily (route_name,vehicle_id,service_date,station_seq,remain_seat) values (?,?,?,?,?)",
                    ("candidate", f"v{stop}", f"2026-09-{23+day}", stop, 2))
        self.conn.commit()
        self.assertEqual(evaluate_route_exclusion(self.conn, "candidate", self.now), (300, 3, True))
        self.assertIsNone(evaluate_route_exclusion(self.conn, "candidate", self.now))

    def test_zero_seat_or_insufficient_dates_never_excludes(self):
        for day in range(4):
            for stop in range(50):
                self.conn.execute("insert into route_stop_daily (route_name,vehicle_id,service_date,station_seq,remain_seat) values (?,?,?,?,?)",
                    ("no-full", f"v{stop}", f"2026-09-{20+day}", stop, 0 if day == 0 and stop == 0 else 5))
                self.conn.execute("insert into route_stop_daily (route_name,vehicle_id,service_date,station_seq,remain_seat) values (?,?,?,?,?)",
                    ("thin", f"v{stop}", f"2026-09-{20+day}", stop, 5))
        self.conn.commit()
        self.assertIsNone(evaluate_route_exclusion(self.conn, "no-full", self.now))
        self.assertIsNone(evaluate_route_exclusion(self.conn, "thin", self.now))


if __name__ == "__main__":
    unittest.main()
