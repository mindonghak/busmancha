# Location-based collection

The default Python collector polls the route-wide location API every 180 seconds.
Run `--mode location --interval-seconds 180 --include-private`.
The previous collector is available with `--mode arrival` for manual audits only.

Public routes remain M4137, M4130, G6009 and 6002. Full-route private collection
includes M4108 (Dongtan to Seoul Station), M4403, M4434, M4448 and 6001 (Dongtan to
Gangnam). Private routes never appear in website options or results automatically.
Nine routes cost at most 4,320 scheduled calls/day, even with 24-hour operation;
first/last departure windows reduce this. A durable local counter stops at 9,000
location attempts including failures. Do not run a second worker on another host.

## Passage calculation

`location_history` keeps raw service-stop snapshots. Pass-through/nonstop
stations only update tracking state and are not saved as history.
`location_vehicle_state` preserves journey and pending-observation state across
restarts. A return to the beginning after the turning point or a gap exceeding
two hours starts a new journey. Small backwards jumps are ignored.

`station_passages` contains one observation per route/vehicle/journey/stop:

- First valid stateCd=1 (arrival) observation at the target; or
- stateCd=2 (departure) at the immediately previous route stop, followed within
  six minutes by stateCd=1/2 confirming the target was reached or passed.
  Both stops must be served and within 1.5 km straight-line distance.
- Prefer previous departure when both are available. Subsequent boarding at the
  target must not overwrite the first valid record. Unknown seats are excluded.
- Confirmed arrival supplies the time bucket; otherwise use the midpoint of
  the short crossing interval. `observed_at` preserves the seat snapshot time.

Polling misses events, arrival seat updates may lag or reflect boarding/alighting,
and slow segments can be overrepresented. This is not exact boarding-failure
probability. Check stop/hour/day coverage before publishing private routes.
First/last departure windows can omit vehicles still finishing a trip after the
last departure, per the existing collection policy. Metadata expires at 30 days;
refresh using `scripts/refresh_route_catalog.py` before then.

## Publication

Legacy `seat_history` remains intact. New tables synchronize append-only to
PostgreSQL with RLS enabled and public roles revoked. Search and analysis read
`approach_seat_history`; legacy and location records are never mixed. Initial
results will be sparse, including empty weekday/weekend filters. Historic
unobserved vehicle positions cannot be reconstructed.

The local worker still needs the PC running. The legacy Vercel collector is
disabled by default to prevent independent arrival collection. GitHub schedules
do not provide reliable three-minute polling.
