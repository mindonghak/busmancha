# Station-hour analysis (2026-09-28)

The analysis tab uses `/api/analysis`, independently of search. Only published
routes are accepted. Metadata comes from the official route catalog; `(경유)` and
`(미정차)` stops are excluded. Stops are identified by sequence, not display name.

One SQL query returns all station/hour aggregates for a route and filter set.
Station and direction changes reuse this response without querying the database.
Successful HTTP responses and client results have a 60-second cache lifetime.
Changing filters cancels the previous request and clears obsolete results.

Weather is the observed daily precipitation classification in Gangnam, matching
search: snow wins over rain, otherwise no precipitation. Missing weather is not
treated as dry weather. Weekday means Monday-Friday, not holiday-adjusted.
Probabilities are proportions of observations, not unique trips or forecasts.
Unknown seats are excluded. Missing hours are not zeroes. Fewer than 30 samples
or 3 observed days are marked as sparse. Historical route changes are not modeled.

## Collector efficiency

The local collector now uses `getBusArrivalListv2` per station. Responses can be
reused across routes in the same batch for at most 120 seconds. Matching requires
routeId, stationId and staOrder, including direction-specific stop occurrences.
Unmatched or ambiguous entries are not attached to another stop. The cache is
cleared at the beginning of every public batch. Quota reservation occurs only
when making an actual HTTP request. ETA is converted from minutes when the list
endpoint does not provide seconds. Route station metadata is cached for 24 hours
in the running collector process. Restarting discards both caches.

This reduces calls at shared stations, not every stop. No collection frequency
increase or quota increase has been assumed. Route-wide vehicle location data is
not mixed into the arrival history because it describes a different observation.

## Traffic increase

Official source: https://www.data.go.kr/data/15080346/openapi.do

The portal lists development traffic as 1,000 and says operating traffic can be
increased by applying with a registered use case. It does not publish an absolute
10,000-request ceiling. An additional approved limit must be confirmed with the
provider (Gyeonggi transport information department), particularly if the account
form restricts the requested value to 10,000. Approval is not guaranteed.

Suggested request: provide https://busmancha.vercel.app/, screenshots of the
working service, the target route count, collection hours/interval and estimated
unique-station requests per day after caching. Do not increase the local budget
until the revised allowance is approved. No increase application was submitted
as part of this code change.

## Verification

- Production build and TypeScript pass.
- Seven Python tests cover budgets, service windows, shared-station caching,
  direction matching, cache expiry, metadata caching and quota errors.
- New API station sample count matches existing search for M4137 / weekday /
  sequence 4 (391 observations at verification).
- Browser checks: 1366px desktop and 390px mobile, station selection, empty snow
  filter, no document horizontal overflow.
- Updated collector first batch synced 96 seat records and 4 weather records.
