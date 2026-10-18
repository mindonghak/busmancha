import json
import sqlite3
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import collector
from location_collection import KST, collect


class PeakScheduleTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        (self.root / 'config').mkdir()
        self.conn = sqlite3.connect(':memory:')
        self.addCleanup(self.conn.close)
        self.calls = []
        self.api = SimpleNamespace(ROOT=self.root, log=lambda message: None,
            service_key=lambda: 'test', fetch_text=self.fetch, xml_items=collector.xml_items)

    def configure(self, private_count=1):
        config = {'public': {'Public': 'public'}, 'private': {f'Trial{i}': f'private{i}' for i in range(private_count)}}
        catalog = {}
        for name, route_id in {**config['public'], **config['private']}.items():
            catalog[name] = {'routeId': route_id, 'updatedAt': '2026-10-18T00:00:00',
                'info': {f'{stem}{edge}Time': time for stem in ('up', 'down', 'satUp', 'satDown', 'sunUp', 'sunDown')
                         for edge, time in (('First', '00:00'), ('Last', '23:59'))},
                'stations': [{'stationId': 's1', 'stationSeq': '1', 'stationName': 'Stop', 'turnSeq': '2'}]}
        (self.root / 'config/collection-routes.json').write_text(json.dumps(config))
        (self.root / 'config/route-catalog.json').write_text(json.dumps(catalog))

    def fetch(self, url, params):
        route_id = params['routeId']
        self.calls.append(route_id)
        return f'''<response><resultCode>0</resultCode><busLocationList>
            <routeId>{route_id}</routeId><vehId>v1</vehId><stationSeq>1</stationSeq>
            <stationId>s1</stationId><stateCd>1</stateCd><remainSeatCnt>10</remainSeatCnt>
            </busLocationList></response>'''

    def run_at(self, moment):
        class Frozen(datetime):
            @classmethod
            def now(cls, tz=None):
                return moment.astimezone(tz) if tz else moment.replace(tzinfo=None)
        with patch('location_collection.datetime', Frozen):
            collect(self.conn, self.api, weather=False)

    def test_private_requests_only_on_weekday_peaks_at_ten_minute_intervals(self):
        self.configure()
        for hour, minute in ((5, 59), (6, 0), (6, 9), (6, 10), (10, 0)):
            self.run_at(datetime(2026, 10, 19, hour, minute, tzinfo=KST))
        self.assertEqual(self.calls.count('private0'), 2)
        self.assertGreater(self.calls.count('public'), 2)
        self.run_at(datetime(2026, 10, 24, 8, tzinfo=KST))
        self.assertEqual(self.calls.count('private0'), 2)

    def test_large_pool_caps_active_routes_and_repeated_ticks_do_not_spend_quota(self):
        self.configure(240)
        moment = datetime(2026, 10, 19, 8, tzinfo=KST)
        self.run_at(moment)
        self.assertEqual(len(self.calls), 121)
        self.run_at(moment)
        self.assertEqual(len(self.calls), 121)
        self.assertEqual(self.conn.execute('select attempts from location_api_budget').fetchone()[0], 121)


if __name__ == '__main__':
    unittest.main()
