# Route flow and unpublished pilot collection

## Public analysis

Direction uses the official route catalog's turnSeq: outbound is before the
turning stop; return includes the turning stop. The catalog is a current route
snapshot, not historical routing. Changed routes require a new segment/version
before historical comparisons can be treated as equivalent.

The flow view requires an hour and direction. It shows every service stop in
that direction, with unknown/insufficient observations marked separately.
The headline locates the first observed stop at or above 50% full seats, with
at least 30 observations on 3 service dates. These are display rules, not a
statistical confidence guarantee. Arrival observations across stops do not track
one bus journey and cannot identify where passengers actually filled a bus.

## Collection

config/collection-routes.json separates public routes from private pilots.
Private routes never become public automatically. The statistics API rejects
them and the options API excludes them, even after records are synchronized.

The Lightsail collector runs with --include-private and collects route-wide
location snapshots. There are five public routes and 24 private pilots.
Public routes use 3-minute intervals; pilots use 6-minute intervals. Both use
official weekday/weekend first/last departure windows and exclude non-service
stops from saved history. Metadata expires after 30 days.

Refresh metadata with scripts/refresh_route_catalog.py and review routing changes.
The server runs this weekly. One failed route refresh preserves its old metadata
without changing its age, while other routes still refresh.

Location API safety limits (SQLite location_api_budget):

- Total 9,000 attempts per local calendar day.
- Plan route intervals for at most 8,500 calls even with 24-hour service.
- At 5 public / 24 private routes, the conservative daily upper estimate is 8,160.
- Automatically increase intervals as configured route counts grow.
- Persist per-route last-attempt times, preventing restart retry bursts.
- Failed network/API attempts also consume local budget.
- Calls by other hosts or tools are not counted. Keep only one active collector.

On 2026-10-18, official route metadata and valid seat data were verified before
adding these private routes:

| Routes | Region / corridor |
| --- | --- |
| 6004, 6008 | Hwaseong / Dongtan - Seoul |
| M4449 | Osan / Hwaseong - Seoul |
| 8100 | Yongin / Seongnam - Seoul |
| 9000, 9007 | Seongnam - Seoul |
| M5422, 1007-1, 7770 | Suwon area - Seoul |
| M7111 | Paju - Seoul |

9000 explicitly uses Seongnam route ID 234000002, not the similarly named
Gimpo airport route. All new pilots remain hidden on the website. Six-minute
polling gathers fewer stop events; it does not relax seat evidence requirements.
More routes at the public 3-minute cadence require a higher provider quota.

Before publication, review at least two weeks of weekday/weekend coverage,
both directions, useful hours, invalid-seat rates, station identity, and quota
health. Route-wide sample totals alone are not a publication criterion.
