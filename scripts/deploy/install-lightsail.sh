#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip git logrotate
timedatectl set-timezone Asia/Seoul
app=/home/ubuntu/busmancha
test -f "$app/.env"
test -f "$app/data/busmancha.sqlite3"
chmod 600 "$app/.env" "$app/data/busmancha.sqlite3"
chown -R ubuntu:ubuntu "$app"
sudo -u ubuntu python3 -m venv "$app/.venv"
sudo -u ubuntu "$app/.venv/bin/pip" install -r "$app/requirements.txt"
cat > /etc/systemd/system/busmancha-collector.service <<'UNIT'
[Unit]
Description=Busmancha bus seat and weather collector
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/busmancha
Environment=PYTHONUNBUFFERED=1
Environment=TZ=Asia/Seoul
ExecStart=/home/ubuntu/busmancha/.venv/bin/python scripts/collector.py --mode location --interval-seconds 180 --include-private
Restart=always
RestartSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
UMask=0077
MemoryAccounting=true
MemoryMax=400M

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/busmancha-catalog.service <<'UNIT'
[Unit]
Description=Refresh Busmancha official route catalog
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/busmancha
ExecStart=/home/ubuntu/busmancha/.venv/bin/python scripts/refresh_route_catalog.py
TimeoutStartSec=1800
StandardOutput=null
UMask=0077
UNIT
cat > /etc/systemd/system/busmancha-catalog.timer <<'UNIT'
[Unit]
Description=Weekly route catalog refresh

[Timer]
OnCalendar=Sun *-*-* 03:30:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIT
cat > /etc/logrotate.d/busmancha <<'ROTATE'
/home/ubuntu/busmancha/data/collector.log {
    daily
    rotate 7
    size 10M
    compress
    missingok
    notifempty
    su ubuntu ubuntu
    create 0600 ubuntu ubuntu
}
ROTATE
systemctl daemon-reload
echo 'Installed. Refresh the catalog and verify a collection batch before enabling the worker.'
