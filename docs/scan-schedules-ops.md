# Scan schedules — operator note (P1 / S5)

Short ops reference for scheduled scans (Scan Attach). No secrets; set values via env / host `.env`.

## What must be running

| Piece | Why |
|-------|-----|
| **`celery_beat`** | Fires `schedules.run_due` every **5 minutes** (`workers/celery_app.py`). Without beat, schedules never enqueue. |
| **`worker_ip` / `worker_domain`** (queues `ip_scan`, `domain_scan`) | Beat routes due work onto `ip_scan`; domain tasks still need a domain worker. Mobile is **not** scheduled in v1. |
| **backend** | CRUD `/api/schedules`, credits, export. |
| **DB migration** | Alembic head includes `scan_schedules` (incl. `last_error`). |

## Coding host vs production (edge)

| Host | Role |
|------|------|
| **Coding / OpenCode** | Branch, PR, unit tests. Full Docker stack optional and often **stopped** to free RAM. Local containers are **not** proof that `vs.appmedia.id` runs the tip. |
| **Production (edge)** | Machine that **public DNS** for the product points at. Deploy + smoke **here** to close Scan Attach P1. |

Do not treat coding-host health or a partial dogfood redeploy as production attach DoD.

## Routine deploy (does **not** wipe volumes)

On the **edge** host after `git pull` of target SHA:

```bash
# Match live Compose project (inspect — do not assume):
#   docker inspect vuln-backend --format '{{index .Config.Labels "com.docker.compose.project"}}'
# Known values seen in the wild: "vuln" or "vuln-scanner"
COMPOSE_PROJECT_NAME=<from_inspect> ./scripts/deploy-services.sh . \
  backend worker_ip worker_domain celery_beat
# Include frontend only if SPA schedule UI changed
```

`deploy-services.sh` defaults already include app services + **celery_beat**. Prefer this over full `deploy.sh` (volume wipe) for routine rollouts. Wrong `COMPOSE_PROJECT_NAME` → container name conflicts or services on a new network away from postgres/redis.

**DB names on edge (typical):** Postgres user/db often `vuln_scanner`; pricing table is **`pricing`** (not `pricing_configs`). Schedule jobs link via `scan_schedules.last_job_id` → `scan_jobs.id` (no `schedule_id` column on jobs).

## Credits gate (scheduled)

Before enqueue, the beat tick uses the **same cost** as manual scans (`pricing.credit_cost` for `ip` / `domain`):

- **Enough credits** → deduct, insert `scan_jobs`, dispatch Celery task, advance `next_run_at`, clear `last_error`.
- **Insufficient credits** → **no job**, set `last_error` (e.g. `Insufficient credits. Need N, have M.`), set **`enabled = false`** so beat does not thrash. UI lists show `last_error`.
- Prior job still **pending/running** for that schedule → skip (no pile-up). Overlapping ticks use `FOR UPDATE SKIP LOCKED`.

Manual start still returns **HTTP 402** with the same insufficient-credits message.

## Caps (abuse)

- Global hard cap: **`MAX_SCHEDULES_PER_ORG = 10`** enabled schedules per organization (`backend/app/schemas/schedule.py`; alias `MAX_SCHEDULES_PER_USER`). Personal/legacy null-org rows still count per user.
- Enforced on **create** (when `enabled`) and on **PATCH re-enable** (shared pool for all members of the same org). Tiered Basic/Pro caps can replace this once billing entitlements exist.
- Target validation matches manual scans (ip/domain only; no secrets in schedule rows).

## Env (relevant, non-secret)

| Variable | Role |
|----------|------|
| `DATABASE_URL` / worker DB URL | Schedules + jobs + credits |
| `REDIS_URL` | Celery broker |
| `CELERY_MODE=beat` | Compose beat service |
| SMTP / `FRONTEND_URL` | Diff email (S3); not required for enqueue itself |

Do not put production hostnames, passwords, or API keys in tracked markdown.

## Smoke after deploy

### A — On the edge host (required to close P1 production)

1. Confirm git tip on disk ≥ attach tip (`0eb7d42` or newer) and beat process up (`celery_beat`).
2. Create a weekly/monthly schedule in UI or `POST /api/schedules` (JWT; body uses **`cadence`**: `weekly` \| `monthly`).
3. Optionally set `next_run_at` due in DB for a dogfood user with **zero** credits → after next tick, schedule **disabled**, `last_error` set, **no** new job.
4. User with credits + due schedule → job appears, credits deducted.
5. Regression: schedule list shows `last_error`; Scan Attach S1–S4 (diff / notify / executive) still work when credits allow.

### B — Remote API checks (optional, from any host with JWT)

Useful before/after deploy; **does not** prove beat or edge git SHA:

1. `GET /api/health` → DB/Redis ok.
2. Login + `POST /api/schedules` → **201**; list/delete work.
3. Cap: ten enabled schedules → **201**; eleventh → **400** with max-enabled message; clean up test rows.
4. Still do **section A** on the edge host for full DoD.

## Related

- Spec: [`docs/specs/scan-attach-v1.md`](specs/scan-attach-v1.md) (§5 runtime, §9 caps, §10 S5)
- Deploy: [`scripts/deploy-services.sh`](../scripts/deploy-services.sh)
