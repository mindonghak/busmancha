"""Low-volume, rotating collection of routes not published on the website."""
import json
from datetime import datetime
from itertools import zip_longest


def active(info, station, now):
    prefix = "sat" if now.weekday() == 5 else "sun" if now.weekday() == 6 else ""
    direction = "Down" if int(station["stationSeq"]) >= int(station["turnSeq"]) else "Up"
    stem = prefix + direction if prefix else direction.lower()
    start, end = info.get(stem + "FirstTime"), info.get(stem + "LastTime")
    if not start or not end:
        return False
    value = now.strftime("%H:%M")
    return start <= value <= end if start <= end else value >= start or value <= end


def collect(conn, api):
    now = datetime.now()
    config = json.loads((api.ROOT / "config/collection-routes.json").read_text(encoding="utf-8"))
    catalog = json.loads((api.ROOT / "config/route-catalog.json").read_text(encoding="utf-8"))
    conn.execute("create table if not exists private_cursor (route_id text primary key, position integer not null)")
    conn.commit()
    for name, route_id in config["private"].items():
        meta = catalog.get(name)
        if not meta or (now - datetime.fromisoformat(meta["updatedAt"])).days > 30:
            api.log(f"private route={name} skipped=refresh_metadata_required")
            continue
        stops = [s for s in meta["stations"] if not api.is_pass_through_station(s) and active(meta["info"], s, now)]
        outward = [s for s in stops if int(s["stationSeq"]) < int(s["turnSeq"])]
        returning = [s for s in stops if int(s["stationSeq"]) >= int(s["turnSeq"])]
        stops = [s for pair in zip_longest(outward, returning) for s in pair if s is not None]
        if not stops:
            continue
        row = conn.execute("select position from private_cursor where route_id=?", (route_id,)).fetchone()
        position = row[0] if row else 0
        inserted = 0
        for offset in range(min(2, len(stops))):
            station = stops[(position + offset) % len(stops)]
            try:
                arrival = api.get_arrival(route_id, station["stationId"], station["stationSeq"], private=True)
                rows = api.rows_from_arrival(now, station, arrival) if arrival else []
                api.insert_rows(conn, rows)
                inserted += len(rows)
            except Exception as exc:
                api.log(f"private route={name} error={type(exc).__name__}")
                if api.should_stop_for_quota(exc):
                    return
        conn.execute("insert into private_cursor values (?, ?) on conflict(route_id) do update set position=excluded.position", (route_id, position + min(2, len(stops))))
        conn.commit()
        api.log(f"private route={name} inserted={inserted}")
