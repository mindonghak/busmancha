# Location-based collection

The Python collector runs on AWS Lightsail and checks due routes every 60 seconds.
Run `--mode location --interval-seconds 60 --include-private`.
The previous collector is available with `--mode arrival` for manual audits only.

Public routes are M4137, M4130, M4448, G6009 and 6002. Full-route private collection
includes M4108, M4403, M4434 and 6001 from Hwaseong, plus 1550-1 (Suwon,
Osan, Yongin, Hwaseong), 5002B (Yongin), 3000, 7001 and 5100 (Suwon/Yongin),
1000 (Goyang), 8002 (Gapyeong/Namyangju), M4102 (Seongnam), M4101
(Seongnam/Yongin/Suwon), and M2323 (Namyangju). Private routes never appear in
website options or results automatically. Additional private routes are 6004,
6008, M4449, 8100, 9000 (Seongnam), 9007, M5422, 1007-1, 7770 and M7111.
There are 5 public and 211 private candidates in total. The discovery tool added
187 candidates after the official API returned valid remaining-seat counts.
The full candidate inventory is in config/collection-routes.json.

Public routes are polled every 180 seconds during their service windows.
Private candidates are polled every 600 seconds: Monday-Friday,
06:00-10:00 and 17:00-21:00 KST, excluding the end boundary; Saturday and
Sunday throughout official service hours, including midday and overnight.
At most 120 private candidates are active per weekday and 42 per weekend day.
This bounds planned calls at 8,160/weekday and 8,448/weekend day even with
24-hour public service; first/last departure
windows reduce actual usage. Per-route last-attempt times
persist across restarts, including failed requests. A durable counter stops at 9,000
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
Ten-minute pilot polling misses more stop events than three-minute public
polling. The six-minute evidence age limit is unchanged; distant or older
observations are not inserted to fill the gaps.
First/last departure windows can omit vehicles still finishing a trip after the
last departure, per the existing collection policy. Metadata expires at 30 days;
refresh using `scripts/refresh_route_catalog.py` before then.

Private candidate routes are screened using the rolling 7 days in
`route_peak_daily`. Weekday peaks and all weekend service hours count. One sample per
vehicle, service day and served stop is kept;
a later zero-seat observation replaces a positive seat count. After at least
300 such observations over three or more days including at least one weekend
date, with at least three valid checks in both periods on each qualifying date,
a route is removed from collection only if no zero-seat observation exists.
Routes with unknown or
weekday-only seat coverage are never excluded. Weekend periods are before and
after noon; weekday periods are the two rush-hour windows. Old weekday-only
exclusion decisions are cleared once for reassessment; no history is deleted.
Routes with insufficient seat data are never excluded. M4101, 5100 and M2323 were added as
additional crowding candidates after the live API returned zero-seat vehicles.
The evidence is retained locally;
excluded routes are not automatically reactivated, so inspect the exclusion row
and clear it manually if seasonal service or demand changes. Their historical
data is preserved. The scheduler replaces excluded candidates from the reserve
pool on its next tick. Insufficient data does not mean a route is never full.

`pilot_selection` persists the daily active set. Recent zero-seat observations
and verified discovery hints receive priority. At least a quarter of slots
are reserved for exploring other candidates when available, and previous
selection dates rotate trials fairly. A discovery hint affects collection
priority only and is never inserted into statistical history.

## Publication

Legacy `seat_history` remains intact. New tables synchronize append-only to
PostgreSQL with RLS enabled and public roles revoked. Search and analysis read
`approach_seat_history`; legacy and location records are never mixed. Initial
results will be sparse, including empty weekday/weekend filters. Historic
unobserved vehicle positions cannot be reconstructed.

The Lightsail worker operates independently of the PC. The legacy Vercel collector is
disabled by default to prevent independent arrival collection. GitHub schedules
do not provide reliable three-minute polling.
