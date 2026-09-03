# workers/

**Parent:** [`../AGENTS.md`](../AGENTS.md). Sibling of `backend/`, not nested.

## OVERVIEW

Canonical Celery app `vuln_scanner` in `celery_app.py`. `entrypoint.sh` switches worker vs beat via `CELERY_MODE`. Injects `workers/` and `backend/` on `sys.path`.

## WHERE TO LOOK

| Queue / job | File |
|-------------|------|
| IP / domain / mobile scan | `tasks/ip_scan.py`, `domain_scan.py`, `mobile_scan.py` |
| nmap helper | `utils/nmap_runner.py` |
| Guard / Host Protect | `tasks/guard.py`, `host_protect.py` (often **ride `ip_scan`**) |
| Uptime | `tasks/uptime.py` — queue `uptime_check` |
| Schedules / maintenance / DLQ | `tasks/schedules.py`, `maintenance.py`, `dead_letter.py` |
| Beat | `celery_app.py` schedule (~5m / uptime 15s) |

## CONVENTIONS

- `celery -A celery_app worker -Q <queue>`. Queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter`, `uptime_check`.
- Own `pyproject.toml` / `requirements.txt`. Pytest cov fail-under **76**.
- Uses `DATABASE_URL_SYNC`. **Does not run Alembic.**

## ANTI-PATTERNS

- Treating backend `Celery(...)` constructors as the worker app.
- Mock Host Protect hits when helper/root missing.
- Running migrations from this package.
