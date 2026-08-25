# Uptime ops (P8)

- **Flag:** `UPTIME_ENABLED` (default true). RFC1918 / loopback / metadata blocked unless `UPTIME_ALLOW_PRIVATE=true` (lab only; keep off on prod).
- **Queue:** `uptime_check`. Service: `worker_uptime`. Beat: `uptime.run_due` every 15s.
- **Deploy:** `./scripts/deploy-services.sh <checkout> backend frontend worker_uptime celery_beat` — never volume-wipe postgres.
- **Alembic:** `add_uptime_tables` then **`uptime_v1_gaps`** (`last_latency_ms`, unique among enabled). Never volume-wipe postgres.
- **Retention:** samples 7d / events 90d — purged on each probe apply and beat `uptime.purge` every 6h.
- **Concurrency:** `worker_uptime` default **8** (`UPTIME_WORKER_CONCURRENCY`); due-select still limit 50.
- **UA:** `SinexisUptime/1.0` — allowlist on customer firewalls.
- **Do not** put customer URLs, IPs, or SMTP passwords in git.
