"""Append-only replication: legacy arrival records remain untouched."""
import sqlite3

TABLES = {
    "location_history": """id bigint primary key, collected_at timestamptz not null,
        route_name text not null, route_id text not null, vehicle_id text not null,
        station_seq integer not null, state_code integer not null,
        remain_seat integer, trip_id text not null""",
    "station_passages": """id bigint primary key, collected_at timestamptz not null,
        observed_at timestamptz not null, service_date date not null,
        day_of_week integer not null, time_hhmm text not null,
        route_id text not null, route_name text not null, vehicle_id text not null,
        trip_id text not null, station_id text not null, station_name text not null,
        station_seq integer not null, remain_seat integer not null,
        source_seq integer not null, evidence text not null,
        unique(route_id, vehicle_id, trip_id, station_seq)""",
}


def sync(sqlite_conn, pg_conn):
    counts = {}
    for table, schema in TABLES.items():
        pg_conn.execute(f"create table if not exists {table} ({schema})")
        pg_conn.execute(f"alter table {table} enable row level security")
        pg_conn.execute(f"revoke all on {table} from anon, authenticated")
        counts[table] = 0
        if not sqlite_conn.execute("select 1 from sqlite_master where type='table' and name=?", (table,)).fetchone():
            continue
        columns = [r[1] for r in sqlite_conn.execute(f"pragma table_info({table})")]
        last = pg_conn.execute(f"select coalesce(max(id),0) from {table}").fetchone()[0]
        while True:
            rows = sqlite_conn.execute(f"select {','.join(columns)} from {table} where id>? order by id limit 1000", (last,)).fetchall()
            if not rows:
                break
            with pg_conn.cursor() as cur:
                cur.executemany(f"insert into {table} ({','.join(columns)}) values ({','.join(['%s']*len(columns))}) on conflict do nothing",
                                [tuple(row) for row in rows])
            pg_conn.commit()
            counts[table] += len(rows)
            last = rows[-1][0]
    pg_conn.execute("create index if not exists idx_passages_route_date on station_passages(route_name,service_date,station_seq)")
    pg_conn.execute("""create or replace view approach_seat_history with (security_invoker=true) as
        select p.*, null::integer as eta_seconds from station_passages p""")
    pg_conn.execute("revoke all on approach_seat_history from anon, authenticated")
    pg_conn.commit()
    return counts
