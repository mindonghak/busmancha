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

The local collector must run with --include-private. It keeps the existing four
routes at their configured interval, then rotates through two eligible stops
per private route per batch. It skips pass-through stops and uses official
directional weekday/weekend first/last departure windows. After 30 days without
a refreshed catalog, private collection stops rather than guessing schedules.

Refresh metadata with scripts/refresh_route_catalog.py and review routing changes.

Local arrival API safety limits (SQLite api_budget):

- Total 9,000 attempts per local calendar day.
- Private routes at most 800 attempts per day.
- Private collection stops when total attempts reach 7,000, reserving capacity.
- Failed network/API attempts also consume local budget.
- The first counter initialization estimates earlier calls from collector.log.
- Calls by other hosts or tools are not counted. Keep only one active collector.

At 15-minute intervals, 76 existing stops use about 5,852 calls in a 19.25-hour
service day. Four pilot routes add at most 8 calls per batch, about 616 per day.
Rotating coverage is sparse and accumulates more slowly than the public routes.
Large-scale expansion needs larger quotas or a validated route-level source.

Before publication, review at least two weeks of weekday/weekend coverage,
both directions, useful hours, invalid-seat rates, station identity, and quota
health. Route-wide sample totals alone are not a publication criterion.
