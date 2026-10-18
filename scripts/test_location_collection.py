import sqlite3
import unittest
from datetime import datetime, timedelta
from location_collection import KST, ingest, init_db, reserve, route_active, evaluate_route_exclusion, polling_intervals, poll_due, PLANNED_DAILY_LIMIT, pilot_capacity, pilot_period, select_pilot_routes


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

    def test_expansion_stays_within_quota_even_for_24_hour_routes(self):
        self.assertEqual(polling_intervals(5, 240), (180, 600))
        self.assertEqual(pilot_capacity(5), 120)
        weekend = datetime(2026, 10, 18, 12, tzinfo=KST)
        self.assertEqual(pilot_capacity(5, weekend), 42)
        self.assertLessEqual(5 * 86400 / 180 + pilot_capacity(5, weekend) * 86400 / 600, PLANNED_DAILY_LIMIT)
        for public, private in ((5, 240), (5, 100), (10, 200), (0, 100), (0, 0)):
            public_seconds, private_seconds = polling_intervals(public, private)
            selected = min(private, pilot_capacity(public))
            self.assertLessEqual(public * 86400 / public_seconds + selected * 8 * 3600 / private_seconds, PLANNED_DAILY_LIMIT)

    def test_poll_schedule_survives_restart_and_counts_failed_attempts(self):
        self.assertTrue(poll_due(self.conn, 'r', self.now, 360))
        self.conn.execute('insert into location_route_poll values (?,?)', ('r', self.now.isoformat()))
        self.conn.commit()
        self.assertFalse(poll_due(self.conn, 'r', self.now + timedelta(seconds=180), 360))
        self.assertTrue(poll_due(self.conn, 'r', self.now + timedelta(seconds=360), 360))
        self.assertFalse(poll_due(self.conn, 'r', self.now - timedelta(seconds=10), 360))

    def test_friday_overnight_uses_friday_schedule(self):
        info = {"downFirstTime": "06:00", "downLastTime": "00:30", "satDownFirstTime": "07:00", "satDownLastTime": "23:00"}
        self.assertTrue(route_active(info, datetime(2026, 9, 26, 0, 15, tzinfo=KST)))
        self.assertFalse(route_active(info, datetime(2026, 9, 26, 5, tzinfo=KST)))

    def test_never_full_exclusion_requires_300_stops_and_three_days(self):
        for day in range(3):
            for stop in range(100):
                self.conn.execute("insert into route_peak_daily (route_name,vehicle_id,service_date,station_seq,remain_seat) values (?,?,?,?,?)",
                    ("candidate", f"v{stop}", f"2026-09-{25+day}", stop, 2))
            for period in ('am', 'pm'):
                self.conn.execute('insert into route_peak_checks values (?,?,?,3)', ('candidate', f'2026-09-{25+day}', period))
        self.conn.commit()
        self.assertEqual(evaluate_route_exclusion(self.conn, "candidate", self.now), (300, 3, True))
        self.assertIsNone(evaluate_route_exclusion(self.conn, "candidate", self.now))

    def test_weekday_windows_end_exclusive_and_weekends_cover_full_day(self):
        for hour, expected in ((5, None), (6, 'am'), (9, 'am'), (10, None), (16, None), (17, 'pm'), (20, 'pm'), (21, None)):
            self.assertEqual(pilot_period(self.now.replace(hour=hour)), expected)
        for date in (17, 18):
            for hour in (0, 8, 10, 12, 16, 21, 23):
                self.assertEqual(pilot_period(datetime(2026, 10, date, hour, tzinfo=KST)), 'am' if hour < 12 else 'pm')

    def test_weekday_only_coverage_does_not_exclude_weekend_candidates(self):
        for day in (23, 24, 25):
            date = f'2026-09-{day}'
            self.conn.executemany('insert into route_peak_daily values (?,?,?,?,?)',
                [('candidate', f'v{i}', date, i, 5) for i in range(100)])
            for period in ('am', 'pm'):
                self.conn.execute('insert into route_peak_checks values (?,?,?,3)', ('candidate', date, period))
        self.conn.commit()
        self.assertIsNone(evaluate_route_exclusion(self.conn, 'candidate', self.now))

    def test_weekend_zero_seats_prevent_exclusion(self):
        for day in (25, 26, 27):
            date = f'2026-09-{day}'
            self.conn.executemany('insert into route_peak_daily values (?,?,?,?,?)',
                [('candidate', f'v{i}', date, i, 5) for i in range(100)])
            for period in ('am', 'pm'):
                self.conn.execute('insert into route_peak_checks values (?,?,?,3)', ('candidate', date, period))
        self.conn.execute('insert into route_peak_daily values (?,?,?,?,?)', ('candidate', 'full', '2026-09-27', 101, 0))
        self.conn.commit()
        self.assertIsNone(evaluate_route_exclusion(self.conn, 'candidate', self.now))

    def test_old_weekday_only_exclusions_rechecked_once_without_erasing_history(self):
        self.conn.execute("delete from collector_migrations where name='weekend_screening_v1'")
        self.conn.execute('insert into route_exclusions values (?,?,?,?,?,?)', ('candidate', self.now.isoformat(), 300, 3, 0,
            'No zero seats in >=300 rush-hour observations across >=3 weekdays, each covering morning and evening'))
        self.conn.commit()
        self.observe(5, 1, 0)
        init_db(self.conn)
        self.assertEqual(self.conn.execute('select count(*) from route_exclusions').fetchone()[0], 0)
        self.assertEqual(len(self.rows()), 1)

    def test_selection_is_stable_per_day_rotates_and_replaces_exclusions(self):
        candidates = [f'route{i:03d}' for i in range(100)]
        first = select_pilot_routes(self.conn, candidates, self.now, 20)
        self.assertEqual(first, select_pilot_routes(self.conn, candidates, self.now, 20))
        next_day = select_pilot_routes(self.conn, candidates, self.now + timedelta(days=1), 20)
        self.assertFalse(set(first) & set(next_day))
        self.conn.execute('insert into route_exclusions values (?,?,?,?,?,?)', (first[0], self.now.isoformat(), 300, 3, 0, 'test'))
        self.conn.commit()
        replacement = select_pilot_routes(self.conn, candidates, self.now, 20)
        self.assertEqual(len(replacement), 20)
        self.assertNotIn(first[0], replacement)
        self.assertEqual(select_pilot_routes(self.conn, candidates, self.now.replace(hour=12), 20), [])

    def test_known_full_priority_still_reserves_discovery_slots(self):
        known = [f'known{i:03d}' for i in range(100)]
        trial = [f'trial{i:03d}' for i in range(100)]
        chosen = select_pilot_routes(self.conn, known+trial, self.now, 120, known)
        self.assertEqual(sum(name in known for name in chosen), 90)
        self.assertEqual(sum(name in trial for name in chosen), 30)

    def test_ten_minute_pilot_gap_never_becomes_previous_stop_evidence(self):
        self.observe(4, 2, 0)
        self.observe(5, 1, 20, 10)
        self.assertEqual(self.rows(), [(5, 20, 'arrival')])

    def test_incomplete_peak_coverage_does_not_exclude(self):
        for day in range(3):
            date = f'2026-09-{23+day}'
            for stop in range(100):
                self.conn.execute('insert into route_peak_daily values (?,?,?,?,?)', ('candidate', f'v{stop}', date, stop, 2))
            self.conn.execute('insert into route_peak_checks values (?,?,?,3)', ('candidate', date, 'am'))
        self.conn.commit()
        self.assertIsNone(evaluate_route_exclusion(self.conn, 'candidate', self.now))
        for day in range(3):
            self.conn.execute('insert into route_peak_checks values (?,?,?,3)', ('candidate', f'2026-09-{23+day}', 'pm'))
        self.conn.execute('insert into route_peak_daily values (?,?,?,?,?)', ('candidate', 'fullbus', '2026-09-29', 1, 0))
        self.conn.commit()
        self.assertIsNone(evaluate_route_exclusion(self.conn, 'candidate', self.now))

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
