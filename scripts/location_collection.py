"""Route-wide snapshots and one near-stop observation per vehicle passage."""
import json
import math
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
URL = "https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2"
MAX_GAP = 360
DAILY_LIMIT = 9000
PLANNED_DAILY_LIMIT = 8500
POLL_TICK = 60
PUBLIC_INTERVAL = 180
PRIVATE_INTERVAL = 600
PRIVATE_WINDOWS = ((6, 10), (17, 21))
WEEKEND_WINDOWS = ((0, 12), (12, 24))
MAX_ACTIVE_PILOTS = 120
EXCLUSION_WINDOW_DAYS = 7
EXCLUSION_MIN_SAMPLES = 300
EXCLUSION_MIN_DAYS = 3


def init_db(conn):
    conn.executescript("""
        create table if not exists location_history (
            id integer primary key autoincrement, collected_at text not null,
            route_name text not null, route_id text not null, vehicle_id text not null,
            station_seq integer not null, state_code integer not null,
            remain_seat integer, trip_id text not null
        );
        create table if not exists location_vehicle_state (
            route_id text not null, vehicle_id text not null, payload text not null,
            primary key(route_id, vehicle_id)
        );
        create table if not exists station_passages (
            id integer primary key autoincrement, collected_at text not null,
            observed_at text not null, service_date text not null,
            day_of_week integer not null, time_hhmm text not null,
            route_id text not null, route_name text not null, vehicle_id text not null,
            trip_id text not null, station_id text not null, station_name text not null,
            station_seq integer not null, remain_seat integer not null,
            source_seq integer not null, evidence text not null,
            unique(route_id, vehicle_id, trip_id, station_seq)
        );
        create index if not exists idx_passage_route_time
            on station_passages(route_name, service_date, station_seq);
        create table if not exists location_api_budget (
            day text primary key, attempts integer not null
        );
        create table if not exists location_route_poll (
            route_id text primary key, last_attempt_at text not null
        );
        create table if not exists pilot_selection (
            service_date text not null, route_name text not null,
            primary key(service_date, route_name)
        );
        create table if not exists route_peak_daily (
            route_name text not null, vehicle_id text not null,
            service_date text not null, station_seq integer not null,
            remain_seat integer not null,
            primary key(route_name, vehicle_id, service_date, station_seq)
        );
        create table if not exists route_peak_checks (
            route_name text not null, service_date text not null,
            period text not null, valid_checks integer not null,
            primary key(route_name, service_date, period)
        );
        create table if not exists route_stop_daily (
            id integer primary key autoincrement, route_name text not null,
            vehicle_id text not null, service_date text not null,
            station_seq integer not null, remain_seat integer not null,
            unique(route_name, vehicle_id, service_date, station_seq)
        );
        create table if not exists route_exclusions (
            route_name text primary key, excluded_at text not null,
            sample_count integer not null, active_days integer not null,
            full_count integer not null, reason text not null
        );
        create table if not exists collector_migrations (
            name text primary key, completed_at text not null
        );
    """)
    migrated = conn.execute("select 1 from collector_migrations where name='route_quality_v1'").fetchone()
    if not migrated:
        # Reuse today's snapshots collected before quality monitoring was enabled.
        conn.execute("""insert or ignore into route_stop_daily
            (route_name,vehicle_id,service_date,station_seq,remain_seat)
            select route_name,vehicle_id,substr(collected_at,1,10),station_seq,min(remain_seat)
            from location_history where remain_seat is not null and remain_seat>=0
            group by route_name,vehicle_id,substr(collected_at,1,10),station_seq""")
        conn.execute("insert into collector_migrations values ('route_quality_v1',datetime('now'))")
    if not conn.execute("select 1 from collector_migrations where name='weekend_screening_v1'").fetchone():
        # Recheck old weekday-only decisions without removing observed history.
        conn.execute("delete from route_exclusions where reason=?", (
            "No zero seats in >=300 rush-hour observations across >=3 weekdays, each covering morning and evening",))
        conn.execute("insert into collector_migrations values ('weekend_screening_v1',datetime('now'))")
    conn.commit()


def reserve(conn, now):
    day = now.date().isoformat()
    with conn:
        conn.execute("begin immediate")
        conn.execute("insert or ignore into location_api_budget values (?,0)", (day,))
        count = conn.execute("select attempts from location_api_budget where day=?", (day,)).fetchone()[0]
        if count >= DAILY_LIMIT:
            return False
        conn.execute("update location_api_budget set attempts=attempts+1 where day=?", (day,))
    return True


def polling_intervals(public_count, private_count):
    return PUBLIC_INTERVAL, PRIVATE_INTERVAL


def pilot_windows(now):
    return WEEKEND_WINDOWS if now.astimezone(KST).weekday() >= 5 else PRIVATE_WINDOWS


def pilot_period(now):
    local = now.astimezone(KST)
    for period, (start, end) in zip(('am', 'pm'), pilot_windows(local)):
        if start <= local.hour < end:
            return period
    return None


def pilot_capacity(public_count, now=None):
    windows = pilot_windows(now) if now is not None else PRIVATE_WINDOWS
    peak_seconds = sum(end-start for start, end in windows) * 3600
    remaining = PLANNED_DAILY_LIMIT - public_count * 86400 / PUBLIC_INTERVAL
    return max(0, min(MAX_ACTIVE_PILOTS, int(remaining // (peak_seconds / PRIVATE_INTERVAL))))


def select_pilot_routes(conn, candidates, now, capacity, priority=()):
    if not pilot_period(now) or capacity <= 0:
        return []
    excluded = {row[0] for row in conn.execute('select route_name from route_exclusions')}
    eligible = set(candidates) - excluded
    today = now.astimezone(KST).date().isoformat()
    selected = [row[0] for row in conn.execute('select route_name from pilot_selection where service_date=? order by rowid', (today,)) if row[0] in eligible][:capacity]
    if len(selected) == capacity:
        return selected
    since = (now.date() - timedelta(days=14)).isoformat()
    observed_full = dict(conn.execute('''select route_name,count(*) from route_stop_daily
        where service_date>=? and remain_seat=0 group by route_name''', (since,)))
    for name in priority:
        observed_full.setdefault(name, 1)
    last_selected = dict(conn.execute('select route_name,max(service_date) from pilot_selection group by route_name'))
    remaining = eligible - set(selected)
    sort_key = lambda name: (last_selected.get(name, ''), -observed_full.get(name, 0), name)
    known = sorted((name for name in remaining if name in observed_full), key=sort_key)
    candidate_order = {name: index for index, name in enumerate(candidates)}
    trial = sorted((name for name in remaining if name not in observed_full),
                   key=lambda name: (last_selected.get(name, ''), candidate_order[name]))
    # Reserve a quarter of daily slots for discovering new crowded routes.
    desired_known = capacity - max(1, capacity // 4)
    existing_known = sum(name in observed_full for name in selected)
    preferred = known[:max(0, desired_known-existing_known)]
    additions = (preferred + trial + known[len(preferred):])[:capacity-len(selected)]
    with conn:
        conn.executemany('insert or ignore into pilot_selection values (?,?)', [(today, name) for name in additions])
    return selected + additions


def poll_due(conn, route_id, now, interval):
    row = conn.execute("select last_attempt_at from location_route_poll where route_id=?", (route_id,)).fetchone()
    # Avoid delaying a whole scheduler tick for sub-second network/timer jitter.
    return not row or (now - datetime.fromisoformat(row[0])).total_seconds() >= interval - 1


def is_service(station):
    return station and not any(x in station["stationName"] for x in ("(경유)", "(미정차)"))


def nearby(a, b):
    try:
        lat1, lat2 = math.radians(float(a["y"])), math.radians(float(b["y"]))
        dlon = math.radians(float(b["x"]) - float(a["x"]))
        value = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return 6371000 * 2 * math.asin(min(1, math.sqrt(value))) <= 1500
    except (KeyError, ValueError):
        return False


def route_active(info, now):
    # After midnight, use the previous service day's overnight timetable too.
    for day in (now.date(), now.date() - timedelta(days=1)):
        prefix = "sat" if day.weekday() == 5 else "sun" if day.weekday() == 6 else ""
        for direction in ("Up", "Down"):
            stem = prefix + direction if prefix else direction.lower()
            start, end = info.get(stem+"FirstTime"), info.get(stem+"LastTime")
            if not start or not end:
                continue
            begin = datetime.fromisoformat(f"{day}T{start}").replace(tzinfo=KST)
            finish = datetime.fromisoformat(f"{day}T{end}").replace(tzinfo=KST)
            if finish < begin:
                finish += timedelta(days=1)
            if begin <= now <= finish:
                return True
    return False


def add_passage(conn, name, route_id, vehicle, trip, station, seats, observed, passed, source_seq, evidence):
    conn.execute("""insert or ignore into station_passages
        (collected_at,observed_at,service_date,day_of_week,time_hhmm,route_id,
         route_name,vehicle_id,trip_id,station_id,station_name,station_seq,
         remain_seat,source_seq,evidence) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (passed.isoformat(), observed.isoformat(), passed.date().isoformat(), passed.weekday(),
         passed.strftime("%H:%M"), route_id, name, vehicle, trip, station["stationId"],
         station["stationName"], int(station["stationSeq"]), seats, source_seq, evidence))


def evaluate_route_exclusion(conn, name, now):
    since = (now.date() - timedelta(days=EXCLUSION_WINDOW_DAYS-1)).isoformat()
    samples, days, full = conn.execute("""select count(*),count(distinct service_date),
        coalesce(sum(remain_seat=0),0) from route_peak_daily
        where route_name=? and service_date>=? and service_date in (
            select service_date from route_peak_checks where route_name=? and valid_checks>=3
            group by service_date having count(distinct period)=2
        )""", (name, since, name)).fetchone()
    samples, days, full = int(samples), int(days), int(full)
    if samples < EXCLUSION_MIN_SAMPLES or days < EXCLUSION_MIN_DAYS or full:
        return None
    covered_dates = conn.execute('''select service_date from route_peak_checks
        where route_name=? and service_date>=? and valid_checks>=3
        group by service_date having count(distinct period)=2''', (name, since)).fetchall()
    if not any(datetime.fromisoformat(day).weekday() >= 5 for (day,) in covered_dates):
        return None
    if conn.execute('select 1 from route_peak_daily where route_name=? and service_date>=? and remain_seat=0 limit 1', (name, since)).fetchone():
        return None
    with conn:
        conn.execute("insert or ignore into route_exclusions values (?,?,?,?,?,?)",
                     (name, now.isoformat(), samples, days, full,
                      "No zero seats in >=300 observations across >=3 days including a weekend, each covering morning and evening"))
    if conn.execute("select changes()").fetchone()[0] != 1:
        return None
    return samples, days, True


def ingest(conn, name, meta, row, now):
    stations = {int(s["stationSeq"]): s for s in meta["stations"]}
    try:
        seq, code = int(row["stationSeq"]), int(row["stateCd"])
        seats = int(row.get("remainSeatCnt", "-1"))
    except (KeyError, ValueError):
        return
    vehicle, route_id = row.get("vehId"), meta["routeId"]
    if not vehicle or seq not in stations or row.get("routeId", route_id) != route_id:
        return
    existing = conn.execute("select payload from location_vehicle_state where route_id=? and vehicle_id=?",
                            (route_id, vehicle)).fetchone()
    previous = json.loads(existing[0]) if existing else None
    turn = int(meta["stations"][0]["turnSeq"])
    if previous:
        gap = (now - datetime.fromisoformat(previous["seen"])).total_seconds()
        reset = gap > 7200 or (seq < turn <= previous["seq"] and previous["seq"]-seq > 3)
        if gap < 0:
            return
        if reset:
            previous = None
        elif seq < previous["seq"]:
            return  # Ignore short backwards jumps, not a new journey.
    state = previous or {"trip": str(uuid.uuid4()), "seq": seq, "pending": None}
    station = stations[seq]
    if row.get("stationId") and row["stationId"] != station["stationId"]:
        return
    if is_service(station):
        conn.execute("""insert into location_history
            (collected_at,route_name,route_id,vehicle_id,station_seq,state_code,remain_seat,trip_id)
            values (?,?,?,?,?,?,?,?)""", (now.isoformat(), name, route_id, vehicle, seq, code,
                                           seats if seats >= 0 else None, state["trip"]))
        if seats >= 0:
            conn.execute("""insert into route_stop_daily
                (route_name,vehicle_id,service_date,station_seq,remain_seat)
                values (?,?,?,?,?) on conflict(route_name,vehicle_id,service_date,station_seq)
                do update set remain_seat=0 where route_stop_daily.remain_seat>0
                and excluded.remain_seat=0""", (name, vehicle, now.date().isoformat(), seq, seats))
            if pilot_period(now):
                conn.execute('''insert into route_peak_daily values (?,?,?,?,?)
                    on conflict(route_name,vehicle_id,service_date,station_seq)
                    do update set remain_seat=0 where route_peak_daily.remain_seat>0 and excluded.remain_seat=0''',
                    (name, vehicle, now.date().isoformat(), seq, seats))
    pending = state.get("pending")
    if pending:
        observed = datetime.fromisoformat(pending["at"])
        age = (now-observed).total_seconds()
        if age > MAX_GAP:
            state["pending"] = None
        elif seq >= pending["target"] and code in (1, 2):
            target = stations.get(pending["target"])
            if is_service(target):
                passed = now if seq == pending["target"] and code == 1 else observed + (now-observed)/2
                add_passage(conn, name, route_id, vehicle, state["trip"], target,
                            pending["seats"], observed, passed, pending["source"], "previous_departure")
            state["pending"] = None
    if code == 1 and seats >= 0 and is_service(station):
        # Keep the first arrival observation; later boarding must not overwrite it.
        add_passage(conn, name, route_id, vehicle, state["trip"], station,
                    seats, now, now, seq, "arrival")
    target = stations.get(seq+1)
    if code == 2 and seats >= 0 and is_service(station) and is_service(target) and nearby(station, target):
        state["pending"] = {"target": seq+1, "source": seq, "seats": seats, "at": now.isoformat()}
    state.update(seq=seq, seen=now.isoformat())
    conn.execute("insert into location_vehicle_state values (?,?,?) on conflict(route_id,vehicle_id) do update set payload=excluded.payload",
                 (route_id, vehicle, json.dumps(state)))
    return seats if seats >= 0 and is_service(station) else None


def collect(conn, api, route_names=None, include_private=True, weather=True):
    init_db(conn)
    config = json.loads((api.ROOT / "config/collection-routes.json").read_text(encoding="utf-8"))
    catalog = json.loads((api.ROOT / "config/route-catalog.json").read_text(encoding="utf-8"))
    selected = {**config["public"], **(config["private"] if include_private else {})}
    if route_names:
        selected = {k: v for k, v in selected.items() if k in route_names or (include_private and k in config["private"])}
    now = datetime.now(KST)
    public_count = sum(name in config['public'] for name in selected)
    candidates = [name for name in selected if name in config['private'] and name in catalog
                  and (now.replace(tzinfo=None)-datetime.fromisoformat(catalog[name]['updatedAt'])).days <= 30]
    pilots = select_pilot_routes(conn, candidates, now, pilot_capacity(public_count, now), config.get('pilot_priority', []))
    selected = {name: route_id for name, route_id in selected.items() if name in config['public'] or name in pilots}
    public_interval, private_interval = polling_intervals(public_count, len(pilots))
    api.log(f"location_schedule routes={len(selected)} candidate_pool={len(candidates)} active_pilots={len(pilots)} peak={pilot_period(now)} public_seconds={public_interval} private_seconds={private_interval}")
    active = False
    for name, route_id in selected.items():
        if name in config["private"]:
            excluded = conn.execute("select 1 from route_exclusions where route_name=?", (name,)).fetchone()
            if excluded:
                continue
        meta = catalog.get(name)
        if not meta or (now.replace(tzinfo=None)-datetime.fromisoformat(meta["updatedAt"])).days > 30:
            api.log(f"location route={name} skipped=refresh_metadata_required")
            continue
        if not route_active(meta["info"], now):
            continue
        attempt_at = datetime.now(KST)
        if name in config['private'] and not pilot_period(attempt_at):
            continue
        active = True
        interval = public_interval if name in config["public"] else private_interval
        if not poll_due(conn, route_id, attempt_at, interval):
            continue
        if not reserve(conn, attempt_at):
            api.log("location skipped=daily_budget_exhausted")
            break
        with conn:
            conn.execute("insert into location_route_poll values (?,?) on conflict(route_id) do update set last_attempt_at=excluded.last_attempt_at",
                         (route_id, attempt_at.isoformat()))
        try:
            payload = api.fetch_text(URL, {"serviceKey": api.service_key(), "routeId": route_id, "format": "xml"})
            import xml.etree.ElementTree as ET
            root = ET.fromstring(payload)
            result = root.findtext(".//resultCode")
            if result not in ("0", "4"):
                raise ValueError("Location API returned unsuccessful result")
            rows = api.xml_items(payload, "busLocationList")
            before = conn.execute("select count(*) from station_passages").fetchone()[0]
            observed = datetime.now(KST)
            valid_observed = False
            with conn:
                for row in rows:
                    valid_observed |= ingest(conn, name, meta, row, observed) is not None
                period = pilot_period(observed)
                if name in config['private'] and period and valid_observed:
                    conn.execute('''insert into route_peak_checks values (?,?,?,1)
                        on conflict(route_name,service_date,period) do update set valid_checks=valid_checks+1''',
                        (name, observed.date().isoformat(), period))
            added = conn.execute("select count(*) from station_passages").fetchone()[0] - before
            api.log(f"location route={name} vehicles={len(rows)} passages={added}")
            if name in config["private"]:
                excluded = evaluate_route_exclusion(conn, name, now)
                if excluded and excluded[2]:
                    api.log(f"location route={name} excluded=zero_full_observations samples={excluded[0]} days={excluded[1]}")
        except Exception as exc:
            api.log(f"location route={name} error={type(exc).__name__}")
    # Weather is hourly; a faster bus loop must not multiply identical weather rows.
    if weather and active:
        last = conn.execute("select max(collected_at) from weather_history").fetchone()[0]
        if not last or (now - datetime.fromisoformat(last).replace(tzinfo=KST)).total_seconds() >= 1800:
            api.collect_weather(conn, now)
