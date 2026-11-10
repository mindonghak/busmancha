# Observed Routes and Favorites

The website lists the original five routes and configured candidate routes with
at least one zero-seat record in `station_passages`. The catalog must contain the
route. Invalid/unknown seat values and raw snapshots do not qualify a route.
`lib/public-routes.ts` caches the shared list and coverage for one hour, and all
three public endpoints use it for authorization. Low-volume routes remain visible
with a sample warning. Publication does not promote a pilot to frequent collection.

Route selection supports number, region and endpoint search. Favorites are stored
in `busmancha.favoriteRoutes.v1` in browser localStorage and shared by both tabs.
They do not sync across devices. Selecting or starring a route never submits the
boarding-conditions form. Analysis loads after selecting a route as before.

`/api/options` returns route summaries; `/api/options?route=1550-1` returns only
that route's served stations. This avoids sending thousands of station records
on every visit. Route discovery and statistics use PostgreSQL, not upstream bus
API requests.

The landing results area and empty analysis view show the top ten routes by
zero-seat passage rate over the last 30 Korean calendar dates. All-day, weekday
and weekend rankings each require at least 300 passages across three dates and
a record within the last seven dates. Rankings use only published routes and
served stops, sort using unrounded rates, and refresh hourly. Each entry shows
its denominator and links directly to the route analysis; favorites use the same
browser store. Sampling coverage differs between routes, so this is explicitly
an observed-rate ranking rather than a claim about all bus trips.

Validation: production build, real database route/search/analysis responses,
desktop and 390px mobile browser checks, favorite add/remove/tab sharing and
reload persistence. Do not record browser test visits in production analytics.
