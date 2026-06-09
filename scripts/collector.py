import argparse
import json
import os
import sqlite3
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "busmancha.sqlite3"
LOG_PATH = ROOT / "data" / "collector.log"

ROUTES = {
    "M4137": "234001622",
    "M4130": "234001577",
    "G6009": "233000322",
    "6002": "233000136",
}

DEFAULT_STATION_LIMITS = {
    "M4137": 12,
    "M4130": 14,
    "G6009": 14,
    "6002": 18,
}

SERVICE_WINDOWS = {
    "M4137": ("05:00", "00:10"),
    "M4130": ("05:00", "00:10"),
    "G6009": ("05:10", "00:00"),
    "6002": ("05:00", "23:55"),
}

WEATHER_POINTS = {
    "dongtan_hwaseong": {"name": "동탄/화성", "nx": 62, "ny": 119},
    "gangnam": {"name": "강남", "nx": 61, "ny": 125},
    "seoul_station": {"name": "서울역", "nx": 60, "ny": 126},
    "jamsil": {"name": "잠실", "nx": 62, "ny": 126},
}

GYEONGGI_ROUTE_STATIONS_URL = "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2"
GYEONGGI_ARRIVAL_URL = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2"
KMA_ULTRA_SHORT_NOWCAST_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"


def load_dotenv() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def service_key() -> str:
    key = os.environ.get("GYEONGGI_SERVICE_KEY", "").strip()
    if not key:
        raise SystemExit("GYEONGGI_SERVICE_KEY is required in .env.")
    return key


def weather_service_key() -> str:
    key = os.environ.get("WEATHER_SERVICE_KEY", "").strip()
    if not key:
        raise SystemExit("WEATHER_SERVICE_KEY is required in .env.")
    return key


def log(message: str) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().isoformat(timespec="seconds")
    LOG_PATH.open("a", encoding="utf-8").write(f"{stamp} {message}\n")
    print(f"{stamp} {message}")


def fetch_text(url: str, params: dict[str, str], timeout: int = 20) -> str:
    query = urllib.parse.urlencode(params, doseq=True, safe="%")
    request = urllib.request.Request(f"{url}?{query}", headers={"User-Agent": "busmancha-collector/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} from API: {body[:500]}") from error


def xml_items(text: str, item_tag: str) -> list[dict[str, str]]:
    root = ET.fromstring(text)
    items = []
    for item in root.iter(item_tag):
        row = {}
        for child in list(item):
            row[child.tag] = (child.text or "").strip()
        if row:
            items.append(row)
    return items


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS seat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collected_at TEXT NOT NULL,
            service_date TEXT NOT NULL,
            day_of_week INTEGER NOT NULL,
            time_hhmm TEXT NOT NULL,
            provider TEXT NOT NULL,
            route_id TEXT NOT NULL,
            route_name TEXT NOT NULL,
            route_type_cd TEXT,
            station_id TEXT NOT NULL,
            station_name TEXT NOT NULL,
            station_seq INTEGER NOT NULL,
            weather_area_key TEXT,
            weather_area_name TEXT,
            vehicle_id TEXT NOT NULL,
            plate_no TEXT,
            arrival_order INTEGER NOT NULL,
            remain_seat INTEGER,
            is_full INTEGER,
            eta_seconds INTEGER,
            raw_flag TEXT
        )
        """
    )
    ensure_column(conn, "seat_history", "weather_area_key", "TEXT")
    ensure_column(conn, "seat_history", "weather_area_name", "TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_collected_at ON seat_history(collected_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_route_station ON seat_history(route_id, station_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_service_time ON seat_history(service_date, time_hhmm)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_weather_area ON seat_history(weather_area_key)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS weather_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            collected_at TEXT NOT NULL,
            observed_at TEXT NOT NULL,
            area_key TEXT NOT NULL,
            area_name TEXT NOT NULL,
            nx INTEGER NOT NULL,
            ny INTEGER NOT NULL,
            base_date TEXT NOT NULL,
            base_time TEXT NOT NULL,
            temperature REAL,
            precipitation_1h REAL,
            humidity INTEGER,
            wind_speed REAL,
            precipitation_type TEXT,
            raw_payload TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_weather_history_observed_at ON weather_history(observed_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_weather_history_area_time ON weather_history(area_key, observed_at)")
    conn.commit()


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, column_type: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table_name})")}
    if column_name not in columns:
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")


def get_route_stations(route_id: str) -> list[dict[str, str]]:
    payload = fetch_text(
        GYEONGGI_ROUTE_STATIONS_URL,
        {"serviceKey": service_key(), "routeId": route_id, "format": "xml"},
    )
    return xml_items(payload, "busRouteStationList")


def get_arrival(route_id: str, station_id: str, station_seq: str) -> dict[str, str] | None:
    payload = fetch_text(
        GYEONGGI_ARRIVAL_URL,
        {
            "serviceKey": service_key(),
            "routeId": route_id,
            "stationId": station_id,
            "staOrder": station_seq,
            "format": "xml",
        },
    )
    rows = xml_items(payload, "busArrivalItem")
    return rows[0] if rows else None


def should_stop_for_quota(exc: Exception) -> bool:
    return "HTTP 429" in str(exc) or "quota exceeded" in str(exc).lower()


def parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        return None


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_precipitation(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    if value in {"강수없음", "0", "0.0"}:
        return 0.0
    if "1mm 미만" in value:
        return 0.5
    number = "".join(ch for ch in value if ch.isdigit() or ch == ".")
    return parse_float(number)


def parse_hhmm(value: str) -> int:
    hour, minute = value.split(":", 1)
    return int(hour) * 60 + int(minute)


def is_within_service_window(route_name: str, now: datetime) -> bool:
    start, end = SERVICE_WINDOWS[route_name]
    start_minute = parse_hhmm(start)
    end_minute = parse_hhmm(end)
    now_minute = now.hour * 60 + now.minute
    if start_minute <= end_minute:
        return start_minute <= now_minute <= end_minute
    return now_minute >= start_minute or now_minute <= end_minute


def is_pass_through_station(station: dict[str, str]) -> bool:
    station_name = station.get("stationName", "")
    return "(경유)" in station_name or "(미정차)" in station_name


def weather_area_for_station(route_name: str, station: dict[str, str]) -> tuple[str, str]:
    station_name = station.get("stationName", "")
    region_name = station.get("regionName", "")

    if any(token in station_name for token in ("잠실",)):
        key = "jamsil"
    elif any(token in station_name for token in ("강남", "양재", "뱅뱅", "매헌", "서초")):
        key = "gangnam"
    elif any(token in station_name for token in ("서울역", "시청", "명동", "신한은행", "국가인권")):
        key = "seoul_station"
    elif region_name == "서울":
        if route_name == "G6009":
            key = "jamsil"
        elif route_name == "6002":
            key = "gangnam"
        else:
            key = "seoul_station"
    else:
        key = "dongtan_hwaseong"

    return key, str(WEATHER_POINTS[key]["name"])


def any_route_in_service(route_names: list[str], now: datetime) -> bool:
    return any(is_within_service_window(route_name, now) for route_name in route_names)


def latest_weather_base(now: datetime) -> tuple[str, str, datetime]:
    base = now - timedelta(minutes=45)
    observed = base.replace(minute=0, second=0, microsecond=0)
    return observed.strftime("%Y%m%d"), observed.strftime("%H%M"), observed


def get_weather_nowcast(area: dict[str, int | str], now: datetime) -> dict:
    base_date, base_time, observed_at = latest_weather_base(now)
    payload = fetch_text(
        KMA_ULTRA_SHORT_NOWCAST_URL,
        {
            "serviceKey": weather_service_key(),
            "pageNo": "1",
            "numOfRows": "100",
            "dataType": "XML",
            "base_date": base_date,
            "base_time": base_time,
            "nx": str(area["nx"]),
            "ny": str(area["ny"]),
        },
    )
    items = xml_items(payload, "item")
    values = {item.get("category", ""): item.get("obsrValue", "") for item in items}
    return {
        "base_date": base_date,
        "base_time": base_time,
        "observed_at": observed_at.isoformat(timespec="seconds"),
        "values": values,
        "items": items,
    }


def collect_weather(conn: sqlite3.Connection, collected_at: datetime) -> int:
    rows = []
    for area_key, area in WEATHER_POINTS.items():
        try:
            result = get_weather_nowcast(area, collected_at)
        except Exception as exc:  # noqa: BLE001 - weather should not stop bus collection.
            log(f"weather area={area_key} error={exc}")
            continue

        values = result["values"]
        rows.append(
            {
                "collected_at": collected_at.isoformat(timespec="seconds"),
                "observed_at": result["observed_at"],
                "area_key": area_key,
                "area_name": area["name"],
                "nx": area["nx"],
                "ny": area["ny"],
                "base_date": result["base_date"],
                "base_time": result["base_time"],
                "temperature": parse_float(values.get("T1H")),
                "precipitation_1h": parse_precipitation(values.get("RN1")),
                "humidity": parse_int(values.get("REH")),
                "wind_speed": parse_float(values.get("WSD")),
                "precipitation_type": values.get("PTY"),
                "raw_payload": json.dumps(result["items"], ensure_ascii=False),
            }
        )

    if rows:
        conn.executemany(
            """
            INSERT INTO weather_history (
                collected_at,
                observed_at,
                area_key,
                area_name,
                nx,
                ny,
                base_date,
                base_time,
                temperature,
                precipitation_1h,
                humidity,
                wind_speed,
                precipitation_type,
                raw_payload
            ) VALUES (
                :collected_at,
                :observed_at,
                :area_key,
                :area_name,
                :nx,
                :ny,
                :base_date,
                :base_time,
                :temperature,
                :precipitation_1h,
                :humidity,
                :wind_speed,
                :precipitation_type,
                :raw_payload
            )
            """,
            rows,
        )
        conn.commit()

    log(f"weather inserted={len(rows)}")
    return len(rows)


def rows_from_arrival(collected_at: datetime, station: dict[str, str], arrival: dict[str, str]) -> list[dict]:
    rows = []
    route_id = arrival.get("routeId", "")
    route_name = arrival.get("routeName", "")
    route_type_cd = arrival.get("routeTypeCd", "")
    flag = arrival.get("flag", "")
    weather_area_key, weather_area_name = weather_area_for_station(route_name, station)

    for order in (1, 2):
        vehicle_id = arrival.get(f"vehId{order}", "")
        if not vehicle_id:
            continue

        remain_seat = parse_int(arrival.get(f"remainSeatCnt{order}"))
        eta_seconds = parse_int(arrival.get(f"predictTimeSec{order}"))
        is_full = None if remain_seat is None else int(remain_seat <= 0)

        rows.append(
            {
                "collected_at": collected_at.isoformat(timespec="seconds"),
                "service_date": collected_at.date().isoformat(),
                "day_of_week": collected_at.weekday(),
                "time_hhmm": collected_at.strftime("%H:%M"),
                "provider": "gyeonggi",
                "route_id": route_id,
                "route_name": route_name,
                "route_type_cd": route_type_cd,
                "station_id": station.get("stationId", ""),
                "station_name": station.get("stationName", ""),
                "station_seq": parse_int(station.get("stationSeq")) or 0,
                "weather_area_key": weather_area_key,
                "weather_area_name": weather_area_name,
                "vehicle_id": vehicle_id,
                "plate_no": arrival.get(f"plateNo{order}", ""),
                "arrival_order": order,
                "remain_seat": remain_seat,
                "is_full": is_full,
                "eta_seconds": eta_seconds,
                "raw_flag": flag,
            }
        )
    return rows


def insert_rows(conn: sqlite3.Connection, rows: list[dict]) -> None:
    if not rows:
        return

    conn.executemany(
        """
        INSERT INTO seat_history (
            collected_at,
            service_date,
            day_of_week,
            time_hhmm,
            provider,
            route_id,
            route_name,
            route_type_cd,
            station_id,
            station_name,
            station_seq,
            weather_area_key,
            weather_area_name,
            vehicle_id,
            plate_no,
            arrival_order,
            remain_seat,
            is_full,
            eta_seconds,
            raw_flag
        ) VALUES (
            :collected_at,
            :service_date,
            :day_of_week,
            :time_hhmm,
            :provider,
            :route_id,
            :route_name,
            :route_type_cd,
            :station_id,
            :station_name,
            :station_seq,
            :weather_area_key,
            :weather_area_name,
            :vehicle_id,
            :plate_no,
            :arrival_order,
            :remain_seat,
            :is_full,
            :eta_seconds,
            :raw_flag
        )
        """,
        rows,
    )
    conn.commit()


def collect_once(
    conn: sqlite3.Connection,
    sleep_between_calls: float = 0.15,
    route_names: list[str] | None = None,
    max_stations_per_route: int | None = None,
    first_stops_only: bool = False,
    collect_weather_enabled: bool = True,
) -> int:
    collected_at = datetime.now()
    total_rows = 0
    selected_routes = ROUTES
    if route_names:
        selected_routes = {name: ROUTES[name] for name in route_names}
    selected_route_names = list(selected_routes.keys())

    for route_name, route_id in selected_routes.items():
        if not is_within_service_window(route_name, collected_at):
            start, end = SERVICE_WINDOWS[route_name]
            log(f"route={route_name} skipped=outside_service_window window={start}-{end}")
            continue

        try:
            stations = get_route_stations(route_id)
        except Exception as exc:  # noqa: BLE001 - collector should keep other routes alive.
            log(f"route={route_name} station_list_error={exc}")
            continue

        service_stations = [station for station in stations if not is_pass_through_station(station)]
        selected_stations = service_stations
        if first_stops_only:
            selected_stations = service_stations[: DEFAULT_STATION_LIMITS.get(route_name, 12)]
        if max_stations_per_route is not None:
            selected_stations = selected_stations[:max_stations_per_route]

        route_rows = []
        quota_exceeded = False
        for station in selected_stations:
            station_id = station.get("stationId", "")
            station_seq = station.get("stationSeq", "")
            if not station_id or not station_seq:
                continue
            try:
                arrival = get_arrival(route_id, station_id, station_seq)
                if arrival:
                    route_rows.extend(rows_from_arrival(collected_at, station, arrival))
            except Exception as exc:  # noqa: BLE001 - one bad stop should not stop collection.
                log(f"route={route_name} station={station_id} seq={station_seq} arrival_error={exc}")
                if should_stop_for_quota(exc):
                    quota_exceeded = True
                    break
            time.sleep(sleep_between_calls)

        insert_rows(conn, route_rows)
        total_rows += len(route_rows)
        log(
            f"route={route_name} stations={len(stations)} service_stations={len(service_stations)} checked={len(selected_stations)} "
            f"inserted={len(route_rows)} quota_exceeded={quota_exceeded}"
        )
        if quota_exceeded:
            break

    weather_rows = 0
    if collect_weather_enabled and any_route_in_service(selected_route_names, collected_at):
        weather_rows = collect_weather(conn, collected_at)
    elif collect_weather_enabled:
        log("weather skipped=outside_all_service_windows")

    log(f"batch_complete inserted={total_rows} weather_inserted={weather_rows}")
    return total_rows


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Collect Gyeonggi bus arrival seat data.")
    parser.add_argument("--db-path", default=str(DB_PATH))
    parser.add_argument("--once", action="store_true", help="Collect one batch and exit.")
    parser.add_argument("--interval-seconds", type=int, default=180)
    parser.add_argument("--sleep-between-calls", type=float, default=0.15)
    parser.add_argument("--max-stations-per-route", type=int)
    parser.add_argument(
        "--first-stops-only",
        action="store_true",
        help="Collect only early boarding stops for each route to reduce API calls.",
    )
    parser.add_argument("--no-weather", action="store_true", help="Disable weather collection.")
    parser.add_argument(
        "--routes",
        default=",".join(ROUTES.keys()),
        help="Comma-separated route names. Defaults to all configured routes.",
    )
    args = parser.parse_args()
    route_names = [name.strip() for name in args.routes.split(",") if name.strip()]
    unknown_routes = [name for name in route_names if name not in ROUTES]
    if unknown_routes:
        raise SystemExit(f"Unknown route names: {', '.join(unknown_routes)}")

    db_path = Path(args.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        init_db(conn)
        if args.once:
            collect_once(
                conn,
                args.sleep_between_calls,
                route_names,
                args.max_stations_per_route,
                args.first_stops_only,
                not args.no_weather,
            )
            return 0

        while True:
            started = time.time()
            collect_once(
                conn,
                args.sleep_between_calls,
                route_names,
                args.max_stations_per_route,
                args.first_stops_only,
                not args.no_weather,
            )
            elapsed = time.time() - started
            sleep_for = max(0, args.interval_seconds - elapsed)
            log(f"sleep_seconds={sleep_for:.1f}")
            time.sleep(sleep_for)


if __name__ == "__main__":
    raise SystemExit(main())
