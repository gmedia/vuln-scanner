# Uptime ops (P8)

- **Flag:** `UPTIME_ENABLED` (default true). RFC1918 / loopback / metadata blocked unless `UPTIME_ALLOW_PRIVATE=true` (lab only; keep off on prod).
- **Queue:** `uptime_check`. Service: `worker_uptime`. Beat: `uptime.run_due` every 15s. Create/enable also `send_task("uptime.check")` so the first probe does not wait for beat. Worker image has no FastAPI: `uptime.check` / `uptime.purge` import `app.services.uptime_apply` (not `app.services.uptime`). Enqueue `CeleryError` is logged, not swallowed.
- **Deploy:** CI `main` uses `scripts/deploy.sh`. With `REMOTE_DATA=1` it starts `worker_uptime` + `celery_beat` + Alembic `upgrade head`. Manual: `./scripts/deploy-services.sh <checkout> backend frontend worker_uptime celery_beat` — never volume-wipe postgres.
- **Alembic:** `add_uptime_tables` then **`uptime_v1_gaps`** (`last_latency_ms`, unique among enabled). Never volume-wipe postgres.
- **Retention:** samples 7d / events 90d — purged on each probe apply and beat `uptime.purge` every 6h.
- **Concurrency:** `worker_uptime` default **8** (`UPTIME_WORKER_CONCURRENCY`); due-select still limit 50.
- **UA:** `SinexisUptime/1.0` — allowlist on customer firewalls.
- **SMTP:** `worker_uptime` sends alert mail. It must receive `SMTP_*` + `FRONTEND_URL` (same as backend / scan workers). Missing env → code defaults to `localhost:587` inside the container (`ECONNREFUSED`).
- **Do not** put customer URLs, IPs, or SMTP passwords in git.
