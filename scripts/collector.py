import argparse
import os
import sqlite3
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
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

GYEONGGI_ROUTE_STATIONS_URL = "https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2"
GYEONGGI_ARRIVAL_URL = "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2"


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
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_collected_at ON seat_history(collected_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_route_station ON seat_history(route_id, station_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_seat_history_service_time ON seat_history(service_date, time_hhmm)")
    conn.commit()


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


def rows_from_arrival(collected_at: datetime, station: dict[str, str], arrival: dict[str, str]) -> list[dict]:
    rows = []
    route_id = arrival.get("routeId", "")
    route_name = arrival.get("routeName", "")
    route_type_cd = arrival.get("routeTypeCd", "")
    flag = arrival.get("flag", "")

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
) -> int:
    collected_at = datetime.now()
    total_rows = 0
    selected_routes = ROUTES
    if route_names:
        selected_routes = {name: ROUTES[name] for name in route_names}

    for route_name, route_id in selected_routes.items():
        try:
            stations = get_route_stations(route_id)
        except Exception as exc:  # noqa: BLE001 - collector should keep other routes alive.
            log(f"route={route_name} station_list_error={exc}")
            continue

        selected_stations = stations
        if first_stops_only:
            selected_stations = stations[: DEFAULT_STATION_LIMITS.get(route_name, 12)]
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
            f"route={route_name} stations={len(stations)} checked={len(selected_stations)} "
            f"inserted={len(route_rows)} quota_exceeded={quota_exceeded}"
        )
        if quota_exceeded:
            break

    log(f"batch_complete inserted={total_rows}")
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
            )
            elapsed = time.time() - started
            sleep_for = max(0, args.interval_seconds - elapsed)
            log(f"sleep_seconds={sleep_for:.1f}")
            time.sleep(sleep_for)


if __name__ == "__main__":
    raise SystemExit(main())
