# Always-on collection

Reviewed: 2026-09-27.

The website runs on Vercel, PostgreSQL on Supabase, and the active collector
runs on the local PC. Website availability does not imply collection is running.

## Recommended: a dedicated worker

Use a paid Render background worker or a small Linux VM. Render advertises
Starter compute at USD 7/month; persistent storage is billed separately.
Check the current pricing before purchasing.

- https://render.com/pricing
- https://render.com/docs/service-types

The existing Python collector needs persistent SQLite storage. Do not run it
on ephemeral storage: a reset restarts local IDs, causing synchronization to
skip records whose IDs already exist in PostgreSQL.

Migration checklist:

1. Provision the worker with persistent storage and Asia/Seoul timezone.
2. Make SQLite and log paths configurable, including the sync script's path.
3. Install requirements.txt and configure DATABASE_URL, GYEONGGI_SERVICE_KEY,
   and WEATHER_SERVICE_KEY as private environment variables.
4. Stop the local collector, back up SQLite using sqlite3's backup API, and
   transfer that database to the persistent disk. Do not start with an empty DB.
5. Run one batch with --once --first-stops-only and verify new rows in Supabase.
6. Start --first-stops-only --interval-seconds 900 with restart-on-failure.
7. Verify a second scheduled batch and confirm the PC collector stays off.
8. Alert on repeated API/sync failures and monitor daily API quotas.

No paid service has been provisioned by this change.

## Alternatives

The repository already contains a GitHub Actions schedule calling
/api/collect. Its existence does not prove it is enabled or healthy. Verify
repository secrets, Vercel API keys, run history, and endpoint execution limits
before switching. Never enable two collectors simultaneously.

GitHub schedules may be delayed or dropped during high load:
https://docs.github.com/en/actions/how-tos/troubleshoot-workflows

Vercel Hobby cron is limited to once daily, unsuitable for 15-minute collection:
https://vercel.com/docs/cron-jobs/usage-and-pricing

## Statistical limitations

Seat samples are repeated arrival observations, not unique passenger trips.
Full probability means the fraction of observed valid seat counts equal to zero.
The daily temperature is the maximum of collected Gangnam readings, not an
official completed-day maximum. Incomplete collection can bias weather groups.
Date ranges may contain collection gaps; use distinct service days and recent
period filters when interpreting results.
