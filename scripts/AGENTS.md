# scripts/

**Parent:** [`../AGENTS.md`](../AGENTS.md) — CI-green `main` already migrated; never print hosts/secrets.

## OVERVIEW

Deploy and lab helpers. Human ops: `docs/deploy.md`. New server + new domain bring-up: `docs/deploy-new-server.md`.

## WHERE TO LOOK

| Script | Use |
|--------|-----|
| `deploy-services.sh` | **Routine** app deploy; `--no-deps`; Alembic if `backend` in list unless `--skip-migrate` |
| `deploy-frontend.sh` | SPA-only |
| `deploy.sh` | Full stack; **`down --volumes` — destructive** |
| `ensure_e2e_user.sh` | Prod Playwright user; do not register the mailbox |
| `smoke-broker.sh` | Redis/Celery smoke |
| `pg-backup.sh` | Scheduled Postgres `pg_dump -Fc` → optional age/gpg encryption → object storage; prunes local retention |
| `pg-restore.sh` | `--list` archive TOC (non-destructive) or `--yes` restore (`pg_restore --clean --if-exists --no-owner`) |
| `check-env-inventory.sh` | Drift guard: compose keys + CI-written keys must exist in `.env.example`. Runs in CI (`env-inventory` job) |
| `check-requirements-sync.sh` | Drift guard: shared Python packages must be pinned to the same version in `backend/` and `workers/` (workers import `app.*`). Runs in CI (`deps-sync` job) |
| `check-dependency-audit.mjs` | Fails on unaccepted HIGH/CRITICAL `npm audit` advisories; accepted risks live in `.github/dependency-audit-allowlist.json`. Runs in CI (`deps-audit` job) |
| `check-pip-audit.py` | Fails on unaccepted Python advisories in `backend/` + `workers/` requirements (`pip-audit`); same allowlist with `ecosystem: "pip"`. Runs in CI (`deps-audit-python` job) |

## ANTI-PATTERNS

- Preferring `deploy.sh` for UI/API waves (wipes postgres/redis volumes).
- Telling humans to SSH Alembic after successful CI **deploy** job.
- Committing real `E2E_*` / SSH / API keys.
- Skipping wipe-`tc5` when running Guard enroll lab (guide §4.1).
- Adding a compose/CI env var without documenting it in `.env.example` (fails the `env-inventory` CI job).
