# Lightsail collector

The collector runs on an Ubuntu 24.04 Lightsail instance named
`busmancha-collector` in Seoul. The selected bundle has 1 GB RAM, 40 GB SSD,
and public IPv4, with a base price of USD 7/month before tax and extras.
The website stays on Vercel and the database stays on Supabase.

## Files and services

- Application: `/home/ubuntu/busmancha`
- Python environment: `/home/ubuntu/busmancha/.venv`
- Secrets: `/home/ubuntu/busmancha/.env` (owner-only permissions)
- Local history: `/home/ubuntu/busmancha/data/busmancha.sqlite3`
- Worker: `busmancha-collector.service`
- Weekly official route refresh: `busmancha-catalog.timer`

The scheduler wakes every 60 seconds. Public routes are queried every 180
seconds during service hours; private pilots every 600 seconds on weekday
06:00-10:00 and 17:00-21:00 KST windows and throughout weekend service hours.
The active pilot cap is 120 on weekdays and 42 on weekends, preserving the
existing daily request budget,
then synchronizes SQLite records to Supabase after each batch.
Systemd starts the worker at boot and restarts it after failure.
`scripts/deploy/collector-tick.conf` is installed as a service drop-in on the
existing server. It keeps the scheduler at 60 seconds without changing the
route polling intervals. Supabase synchronization remains about every 3 minutes.
Collector log files rotate daily or at 10 MB, retaining seven archives.

## Operations

```bash
systemctl status busmancha-collector.service
journalctl -u busmancha-collector.service -n 50 --no-pager
tail -n 30 /home/ubuntu/busmancha/data/collector.log
systemctl list-timers busmancha-catalog.timer
sudo systemctl restart busmancha-collector.service
```

Use `scripts/deploy/install-lightsail.sh` as root only after the application,
`.env`, and existing SQLite database have been transferred. It installs the
services without starting collection, allowing a verification batch first.
Refresh route metadata and verify collection before enabling services:

```bash
sudo systemctl start busmancha-catalog.service
cd /home/ubuntu/busmancha
.venv/bin/python scripts/collector.py --mode location --include-private --once
sudo systemctl enable --now busmancha-collector.service busmancha-catalog.timer
```

## Migration rules

Copy the existing SQLite database while the old collector is stopped.
The synchronizer uses monotonically increasing SQLite IDs: starting with
an empty database can skip records whose IDs already exist in Supabase.
Never run both the Windows and server workers against independent copies
of this history. After migration, the local copy is a historical backup.

No static IPv4 or automatic paid snapshots were added during setup.
If the instance is stopped and started, confirm its current public IP in
Lightsail before SSH access. Website availability does not depend on this IP.
