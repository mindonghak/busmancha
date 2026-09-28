import unittest
from unittest.mock import patch
import collector as c


PAYLOAD = '''<response><msgHeader><resultCode>0</resultCode></msgHeader><msgBody>
<busArrivalList><routeId>A</routeId><stationId>S</stationId><staOrder>3</staOrder></busArrivalList>
<busArrivalList><routeId>B</routeId><stationId>S</stationId><staOrder>8</staOrder></busArrivalList>
</msgBody></response>'''


class ArrivalCacheTests(unittest.TestCase):
    def setUp(self):
        c._arrival_cache.clear()
        c._station_cache.clear()

    @patch.object(c, 'service_key', return_value='test')
    @patch.object(c, 'reserve')
    @patch.object(c, 'fetch_text', return_value=PAYLOAD)
    def test_shared_station_and_direction(self, fetch, reserve, key):
        self.assertEqual(c.get_arrival('A', 'S', '3')['routeId'], 'A')
        self.assertEqual(c.get_arrival('B', 'S', '8')['routeId'], 'B')
        self.assertIsNone(c.get_arrival('A', 'S', '9'))
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(reserve.call_count, 1)

    @patch.object(c, 'service_key', return_value='test')
    @patch.object(c, 'reserve')
    @patch.object(c, 'fetch_text', return_value='<response><resultCode>22</resultCode></response>')
    def test_quota_error_not_cached(self, fetch, reserve, key):
        with self.assertRaisesRegex(RuntimeError, 'quota exceeded'):
            c.get_arrival('A', 'S', '3')
        self.assertFalse(c._arrival_cache)

    @patch.object(c, 'service_key', return_value='test')
    @patch.object(c, 'reserve')
    @patch.object(c, 'fetch_text', return_value=PAYLOAD)
    def test_expiry(self, fetch, reserve, key):
        c._arrival_cache['S'] = (c.time.monotonic() - 121, [])
        self.assertIsNotNone(c.get_arrival('A', 'S', '3'))
        self.assertEqual(fetch.call_count, 1)

    @patch.object(c, 'service_key', return_value='test')
    @patch.object(c, 'fetch_text', return_value='<response><busRouteStationList><stationId>S</stationId></busRouteStationList></response>')
    def test_route_metadata_cache(self, fetch, key):
        c.get_route_stations('A')
        c.get_route_stations('A')
        self.assertEqual(fetch.call_count, 1)


if __name__ == '__main__':
    unittest.main()
