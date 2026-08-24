# Uptime ops (P8)

- **Flag:** `UPTIME_ENABLED` (default true). Probe RFC1918 blocked unless `UPTIME_ALLOW_PRIVATE` (not wired to skip DNS yet — keep off).
- **Queue:** `uptime_check`. Service: `worker_uptime`. Beat: `uptime.run_due` every 15s.
- **Deploy:** `./scripts/deploy-services.sh <checkout> backend frontend worker_uptime celery_beat` — never volume-wipe postgres.
- **Alembic:** `add_uptime_tables` after `add_scan_assets`.
- **UA:** `SinexisUptime/1.0` — allowlist on customer firewalls.
- **Do not** put customer URLs, IPs, or SMTP passwords in git.
