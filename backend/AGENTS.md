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
- Full `pytest` locally is **slow, not hung**: 1964 tests take ~16 min (CI ~13 min). A 300s
  timeout kills it around 26-30% and looks like a deadlock. Use a generous timeout before
  concluding anything is stuck, and prefer per-file runs while iterating.

### Every new Alembic revision (mandatory)

Run these before pushing, not just the tests for the files you touched:

```bash
cd backend && alembic heads            # must print exactly one head: <rev> (head)
cd .. && make check-alembic            # head must descend from origin/main
```

`tests/test_alembic_heads.py` runs the same checks. Both incidents so far were green
on the PR branch and only broke `main` at merge, which blocks `alembic upgrade head`
and therefore **every deploy** (`deploy-services.sh` migrates before recreating).

- Two PRs adding a revision from the same parent each pass alone, then `main` ends up
  with two heads. Fix with an empty merge revision, never by re-parenting a revision
  that may already be recorded in an environment's `alembic_version`.
- `alembic_version.version_num` is **varchar(32)**: a longer `revision` id fails at
  runtime with `StringDataRightTruncation` *after* earlier migrations have run.

## ANTI-PATTERNS

- Running Alembic from repo root (ini lives here).
- Putting scan engine logic in services (belongs in `workers/tasks/`).
- Mocking Host Protect findings when roots missing (`pending_agent` / `unreachable_root`).
- Mixing Guard + Workspace in one PR.
- Merging an Alembic revision without `alembic heads` against the current `origin/main`.
