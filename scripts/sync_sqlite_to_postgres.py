import json
import os
import sqlite3
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb


ROOT = Path(__file__).resolve().parents[1]
SQLITE_PATH = ROOT / "data" / "busmancha.sqlite3"


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


def init_postgres(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        create table if not exists seat_history (
            id bigint primary key,
            collected_at timestamptz not null,
            service_date date not null,
            day_of_week integer not null,
            time_hhmm text not null,
            provider text not null,
            route_id text not null,
            route_name text not null,
            route_type_cd text,
            station_id text not null,
            station_name text not null,
            station_seq integer not null,
            weather_area_key text,
            weather_area_name text,
            vehicle_id text not null,
            plate_no text,
            arrival_order integer not null,
            remain_seat integer,
            is_full boolean,
            eta_seconds integer,
            raw_flag text
        )
        """
    )
    conn.execute("create index if not exists idx_seat_history_collected_at on seat_history(collected_at)")
    conn.execute("create index if not exists idx_seat_history_route_station on seat_history(route_id, station_id)")
    conn.execute("create index if not exists idx_seat_history_service_time on seat_history(service_date, time_hhmm)")
    conn.execute("create index if not exists idx_seat_history_weather_area on seat_history(weather_area_key)")
    conn.execute(
        """
        create table if not exists weather_history (
            id bigint primary key,
            collected_at timestamptz not null,
            observed_at timestamptz not null,
            area_key text not null,
            area_name text not null,
            nx integer not null,
            ny integer not null,
            base_date text not null,
            base_time text not null,
            temperature real,
            precipitation_1h real,
            humidity integer,
            wind_speed real,
            precipitation_type text,
            raw_payload jsonb
        )
        """
    )
    conn.execute("create index if not exists idx_weather_history_observed_at on weather_history(observed_at)")
    conn.execute("create index if not exists idx_weather_history_area_time on weather_history(area_key, observed_at)")
    conn.commit()


def sqlite_rows(sqlite_conn: sqlite3.Connection, table_name: str, last_id: int, batch_size: int):
    sqlite_conn.row_factory = sqlite3.Row
    rows = sqlite_conn.execute(
        f"select * from {table_name} where id > ? order by id limit ?",
        (last_id, batch_size),
    ).fetchall()
    return [dict(row) for row in rows]


def max_postgres_id(conn: psycopg.Connection, table_name: str) -> int:
    row = conn.execute(f"select coalesce(max(id), 0) from {table_name} where id < 1000000000000").fetchone()
    return int(row[0]) if row else 0


def sync_seats(sqlite_conn: sqlite3.Connection, pg_conn: psycopg.Connection, batch_size: int = 1000) -> int:
    columns = [
        "id",
        "collected_at",
        "service_date",
        "day_of_week",
        "time_hhmm",
        "provider",
        "route_id",
        "route_name",
        "route_type_cd",
        "station_id",
        "station_name",
        "station_seq",
        "weather_area_key",
        "weather_area_name",
        "vehicle_id",
        "plate_no",
        "arrival_order",
        "remain_seat",
        "is_full",
        "eta_seconds",
        "raw_flag",
    ]
    inserted = 0
    last_id = max_postgres_id(pg_conn, "seat_history")

    while True:
        rows = sqlite_rows(sqlite_conn, "seat_history", last_id, batch_size)
        if not rows:
            break

        values = []
        for row in rows:
            row["is_full"] = None if row.get("is_full") is None else bool(row["is_full"])
            values.append(tuple(row.get(column) for column in columns))

        placeholders = ", ".join(["%s"] * len(columns))
        with pg_conn.cursor() as cur:
            cur.executemany(
                f"""
                insert into seat_history ({", ".join(columns)})
                values ({placeholders})
                on conflict (id) do nothing
                """,
                values,
            )
        pg_conn.commit()
        inserted += len(values)
        last_id = rows[-1]["id"]

    return inserted


def sync_weather(sqlite_conn: sqlite3.Connection, pg_conn: psycopg.Connection, batch_size: int = 1000) -> int:
    columns = [
        "id",
        "collected_at",
        "observed_at",
        "area_key",
        "area_name",
        "nx",
        "ny",
        "base_date",
        "base_time",
        "temperature",
        "precipitation_1h",
        "humidity",
        "wind_speed",
        "precipitation_type",
        "raw_payload",
    ]
    inserted = 0
    last_id = max_postgres_id(pg_conn, "weather_history")

    while True:
        rows = sqlite_rows(sqlite_conn, "weather_history", last_id, batch_size)
        if not rows:
            break

        values = []
        for row in rows:
            raw_payload = row.get("raw_payload")
            row["raw_payload"] = Jsonb(json.loads(raw_payload)) if raw_payload else None
            values.append(tuple(row.get(column) for column in columns))

        placeholders = ", ".join(["%s"] * len(columns))
        with pg_conn.cursor() as cur:
            cur.executemany(
                f"""
                insert into weather_history ({", ".join(columns)})
                values ({placeholders})
                on conflict (id) do nothing
                """,
                values,
            )
        pg_conn.commit()
        inserted += len(values)
        last_id = rows[-1]["id"]

    return inserted


def main() -> int:
    load_dotenv()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is required in .env.")
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite DB not found: {SQLITE_PATH}")

    with sqlite3.connect(SQLITE_PATH) as sqlite_conn:
        with psycopg.connect(database_url) as pg_conn:
            init_postgres(pg_conn)
            seat_count = sync_seats(sqlite_conn, pg_conn)
            weather_count = sync_weather(sqlite_conn, pg_conn)

    print(f"synced seat_history={seat_count} weather_history={weather_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
