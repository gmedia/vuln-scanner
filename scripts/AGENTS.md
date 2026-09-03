# scripts/

**Parent:** [`../AGENTS.md`](../AGENTS.md) — CI-green `main` already migrated; never print hosts/secrets.

## OVERVIEW

Deploy and lab helpers. Human ops: `docs/deploy.md`.

## WHERE TO LOOK

| Script | Use |
|--------|-----|
| `deploy-services.sh` | **Routine** app deploy; `--no-deps`; Alembic if `backend` in list unless `--skip-migrate` |
| `deploy-frontend.sh` | SPA-only |
| `deploy.sh` | Full stack; **`down --volumes` — destructive** |
| `ensure_e2e_user.sh` | Prod Playwright user; do not register the mailbox |
| `smoke-broker.sh` | Redis/Celery smoke |

## ANTI-PATTERNS

- Preferring `deploy.sh` for UI/API waves (wipes postgres/redis volumes).
- Telling humans to SSH Alembic after successful CI **deploy** job.
- Committing real `E2E_*` / SSH / API keys.
- Skipping wipe-`tc5` when running Guard enroll lab (guide §4.1).
