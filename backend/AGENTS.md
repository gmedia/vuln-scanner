# backend/

**Parent:** [`../AGENTS.md`](../AGENTS.md) — git/CI/design/product order live there.

## OVERVIEW

FastAPI app (`app.main:app`). Enqueues Celery; does not run nmap/APK. Alembic cwd = this directory.

## STRUCTURE

```
app/api/         # *_routes.py + *_html.py (SEO islands)
app/models/      # SQLAlchemy
app/schemas/     # Pydantic
app/services/    # Business + thin Celery clients
app/middleware/
alembic/versions/
tests/           # pytest; cov fail-under 75
```

## WHERE TO LOOK

| Task | File |
|------|------|
| Router mount | `app/api/router.py` |
| Scan HTTP | `app/api/scan_routes.py` + `app/services/scanner.py` |
| Auth JWT / API key | `app/api/auth_routes.py` |
| Guard / SIEM / Host | `guard_routes` / `siem_routes` / `host_routes` + `host_waf_routes` |
| Org/workspace | `org_routes.py` |
| HTML islands | `blog_html.py`, `legal_html.py`, `status_html.py` |
| Container migrate | `prestart.sh` then uvicorn |

## CONVENTIONS

- Ruff 120; mypy strict via `pyproject.toml`. Deps in `requirements.txt`, not `[project]`.
- `DATABASE_URL` async; Alembic uses `DATABASE_URL_SYNC`.
- Do not add Discover/cases on Guard routes. SIEM is separate flag.

## ANTI-PATTERNS

- Running Alembic from repo root (ini lives here).
- Putting scan engine logic in services (belongs in `workers/tasks/`).
- Mocking Host Protect findings when roots missing (`pending_agent` / `unreachable_root`).
- Mixing Guard + Workspace in one PR.
