"""Discover Seoul-bound Gyeonggi express routes using official APIs only."""
import argparse
import json
import sqlite3
import time
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from datetime import datetime

import collector as c
from location_collection import KST, URL, init_db, reserve


def discover(limit, write_config=False):
    c.load_dotenv()
    config_path = c.ROOT / 'config/collection-routes.json'
    catalog_path = c.ROOT / 'config/route-catalog.json'
    config = json.loads(config_path.read_text(encoding='utf-8'))
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    configured = {**config['public'], **config['private']}
    by_id = {}
    for keyword in ['M', 'G', *map(str, range(1, 10))]:
        try:
            payload = c.fetch_text('https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2',
                                   {'serviceKey': c.service_key(), 'keyword': keyword, 'format': 'xml'})
            rows = c.xml_items(payload, 'busRouteList')
            for route in rows:
                if route.get('routeTypeCd') in ('11', '14', '21') and '서울' in route.get('regionName', ''):
                    by_id[route['routeId']] = route
            print(f'discovery keyword={keyword} matches={len(rows)} express_candidates={len(by_id)}', flush=True)
        except Exception as exc:
            print(f'discovery keyword={keyword} error={type(exc).__name__}', flush=True)
        time.sleep(0.15)
    by_name = defaultdict(list)
    for route in by_id.values():
        by_name[route['routeName']].append(route)
    regions = defaultdict(deque)
    for name, routes in sorted(by_name.items()):
        if name in configured or len(routes) != 1:
            continue
        route = routes[0]
        region = next((s for s in route['regionName'].split(',') if s not in ('서울', '인천')), 'other')
        regions[region].append(route)
    report = []
    priority = set(config.get('pilot_priority', []))
    with sqlite3.connect(c.DB_PATH, timeout=15) as conn:
        init_db(conn)
        while len(config['private']) < limit and any(regions.values()):
            for routes in regions.values():
                if not routes or len(config['private']) >= limit:
                    continue
                route = routes.popleft()
                name, route_id = route['routeName'], route['routeId']
                try:
                    info = c.xml_items(c.fetch_text('https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteInfoItemv2',
                        {'serviceKey': c.service_key(), 'routeId': route_id, 'format': 'xml'}), 'busRouteInfoItem')
                    if not info or info[0].get('routeName') != name:
                        continue
                    stations = c.get_route_stations(route_id)
                    if not stations:
                        continue
                    if not reserve(conn, datetime.now(KST)):
                        raise RuntimeError('Location request budget exhausted')
                    payload = c.fetch_text(URL, {'serviceKey': c.service_key(), 'routeId': route_id, 'format': 'xml'})
                    if ET.fromstring(payload).findtext('.//resultCode') not in ('0', '4'):
                        raise RuntimeError('Location API unsuccessful')
                    vehicles = c.xml_items(payload, 'busLocationList')
                    valid = [int(r['remainSeatCnt']) for r in vehicles
                             if r.get('remainSeatCnt', '-1').isdigit()]
                    # Unknown or off-duty vehicles are trial candidates, not proof of low demand.
                    if vehicles and not valid:
                        report.append({'route': name, 'status': 'seat_information_unavailable'})
                        continue
                    if 0 in valid:
                        priority.add(name)
                    config['private'][name] = route_id
                    catalog[name] = {'routeId': route_id, 'updatedAt': datetime.now(KST).replace(tzinfo=None).isoformat(),
                                     'info': info[0], 'stations': stations}
                    row = {'route': name, 'id': route_id, 'region': route['regionName'],
                           'start': info[0].get('startStationName'), 'end': info[0].get('endStationName'),
                           'valid_seats': len(valid), 'full_vehicles': valid.count(0),
                           'status': 'verified_seats' if valid else 'awaiting_peak_trial'}
                    report.append(row)
                    print(json.dumps(row, ensure_ascii=False), flush=True)
                except Exception as exc:
                    print(f'discovery route={name} error={type(exc).__name__}', flush=True)
                time.sleep(0.15)
    config['pilot_priority'] = sorted(priority)
    (c.ROOT / 'data/pilot-discovery-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for name, value in (('pilot-discovery-config.json', config), ('pilot-discovery-catalog.json', catalog)):
        (c.ROOT / 'data' / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    if write_config:
        for path, value in ((catalog_path, catalog), (config_path, config)):
            temporary = path.with_suffix('.json.tmp')
            temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
            temporary.replace(path)
    print(json.dumps({'public': len(config['public']), 'private': len(config['private']),
                      'live_full_candidates': len(priority), 'saved': write_config}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=240, help='Maximum total private candidates.')
    parser.add_argument('--write-config', action='store_true')
    args = parser.parse_args()
    discover(args.limit, args.write_config)
