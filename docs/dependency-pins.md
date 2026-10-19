# Dependency pins (broker stack + frontend audit)

Operational reference so Redis/Celery and frontend audit residuals stay intentional, not accidental drift.

## Container base images

All Dockerfiles pin their base by **digest** (`tag@sha256:…`), not by tag alone, so a build is
reproducible. The cost is that a pinned digest **never picks up security fixes on its own** —
that is why the pins are tracked here and refreshed deliberately.

| Dockerfile | Base | Refreshed |
|---|---|---|
| `backend/Dockerfile` | `python:3.12-slim-bookworm` | 2026-10-19 |
| `workers/Dockerfile` | `python:3.12-slim-bookworm` (same digest) | 2026-10-19 |
| `frontend/Dockerfile` (dev + builder) | `node:24.22-alpine` | 2026-10-19 |
| `frontend/Dockerfile` (production) | `nginxinc/nginx-unprivileged:1.31-alpine` | 2026-10-19 |
| `nginx/Dockerfile` (local compose) | `nginx:1.31-alpine` | 2026-10-19 |

### Why this matters

The pins had drifted: `python` was built 2026-06-24 and `nginx-unprivileged` 2025-06-23
(**1.27**, four minors behind). Trivy reported **100 open alerts** on `main` — 6 critical
(`perl` path traversal / heap overflow in the Debian base) and 30 high (`expat`, `curl`).

Three things combined to hide it:
1. `dependabot.yml` declared `package-ecosystem: docker` with `directory: "/"`, but **no
   Dockerfile lives at the repo root** — so Dependabot never found a single one.
2. Digests never move on their own.
3. The Trivy jobs use `continue-on-error: true`, so findings only reached the Security tab.

### Rules

- **Dependabot covers every Dockerfile directory** (`/backend`, `/workers`, `/frontend`,
  `/nginx`). Do not point it at `/` — that silently matches nothing.
- `frontend/package.json` `engines.node` is a real constraint: the image tag must satisfy it.
  Node was `24.11` while engines said `>=24.15.0` (raised for jsdom 30); the image is now
  `24.22`.
- **`nginx/default.conf` uses `http2 on;`** (new syntax since 1.25.1), not
  `listen … http2`. The host templates (`nginx/sinexis.app.conf`, `nginx/vs.appmedia.id.conf`)
  still use the deprecated form because the **host** nginx version is managed outside this
  repo; switch them only after confirming the host runs ≥ 1.25.1.
- Refresh a digest deliberately: pull the tag, take `RepoDigests`, and note the date above.
  Do not `apt-get upgrade` inside the Dockerfile to paper over a stale base.

## Redis server vs Python clients

| Layer | Pin | Notes |
|-------|-----|--------|
| Redis **server** (Compose) | `redis:8-alpine` | `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.e2e.yml` |
| **redis-py** (backend + workers) | `redis==6.4.0` | Direct pin in `backend/requirements.txt`, `workers/requirements.txt` |
| **Celery** | `celery[redis]==5.6.3` | Broker + result backend over Redis |
| **Kombu** (transitive) | `>=5.6.0` (e.g. 5.6.2 with Celery 5.6.3) | Celery’s Redis transport |

### Why redis-py is not 7.x / 8.x

Celery’s Redis extra pulls **kombu[redis]**, which constrains the Redis **client**:

```text
redis!=4.5.5,!=5.0.2,<6.5,>=4.5.2
```

So **`redis==6.4.0` is the correct ceiling** under current Celery/Kombu — not an unfinished upgrade. Bumping redis-py to 7+ without a Kombu release that allows it will break installs or runtime.

Server **8** vs client **6.4** is normal: the wire protocol is compatible for our use (broker lists, simple `GET`/`SET`/`PING`, queue depths).

### When to revisit

1. Kombu (or Celery) raises the `redis` upper bound past 6.5 → evaluate redis-py 7/8 in a dedicated PR.
2. Redis server major bump past 8 → re-run smoke below after image change.
3. New CVEs in redis-py 6.4.0 → prefer patched 6.4.x (or newest still `<6.5`) before jumping majors.

## Frontend npm residuals

`npm audit` (full, including dev) is **clean**: 0 vulnerabilities. The React Router
GHSA-qwww-vcr4-c8h2 residual is **resolved** — it was patched in `7.18.2` and the SPA is on
`7.18.4`.

Security overrides live in `frontend/package.json`; their **floor matters** (an override one
patch below the first patched version keeps the vulnerability while looking like a fix).
CI job `deps-audit` enforces this — see
[SECURITY.md — Accepted residual dependency risks](../SECURITY.md#accepted-residual-dependency-risks).

Python is covered by `deps-audit-python` (`scripts/check-pip-audit.py`, `pip-audit` over
`backend/` + `workers/` requirements). Both audits share
`.github/dependency-audit-allowlist.json`; entries carry `ecosystem: npm|pip`.

## Broker smoke (prod or staging)

After worker/backend deploys or Redis image changes, verify broker path (does **not** start a scan):

```bash
# From a machine that can reach the public API (or host localhost via tunnel):
curl -sS https://vs.appmedia.id/api/health
# Expect: "status":"ok", database + redis connected

curl -sS https://vs.appmedia.id/health/queues
# Expect: JSON with queues.ip_scan / domain_scan / mobile_scan / dead_letter depths

# On the deploy host (compose project name vuln):
docker exec vuln-redis redis-cli -a "$REDIS_PASSWORD" PING
# Expect: PONG

# Optional: one worker process sees broker (inside worker container):
docker exec vuln-worker-ip celery -A celery_app inspect ping -d celery@$HOSTNAME
# Or queue lengths already covered by /health/queues
```

Helper script (host with repo + `.env`): [`scripts/smoke-broker.sh`](../scripts/smoke-broker.sh).

## WeasyPrint (scan PDF, Print S2)

| Layer | Pin | Notes |
|-------|-----|--------|
| **weasyprint** (backend only) | `weasyprint==70.0` | `GET /api/scan/{id}/export?format=pdf` → executive HTML. **Not** in `workers/`. Invoice PDF I10 shipped 834. |
| System (Docker runtime + CI `python-tests-backend`) | `libpango-1.0-0` `libpangoft2-1.0-0` `libharfbuzz-subset0` `fonts-dejavu-core` | Debian/Ubuntu runtime libs. Do **not** `apt install weasyprint` (distro package ≠ this pin). |

Missing Pango on a laptop `pip` install → API **503** `PDF rendering unavailable`. Prod image and CI must have the apt list.

## SQLAlchemy 2.1 + psycopg3 (PostgreSQL driver)

| Layer | Pin | Notes |
|-------|-----|--------|
| **SQLAlchemy** (backend + workers) | `sqlalchemy[asyncio]==2.1.4` | `2.0.51` → `2.1.4` |
| **psycopg** (sync driver) | `psycopg[binary]==3.3.6` | Replaces `psycopg2-binary`. SQLAlchemy 2.1 defaults `postgresql://` to the **psycopg (psycopg3)** dialect |
| **asyncpg** (async driver) | `asyncpg==0.32.0` (backend + workers) | `DATABASE_URL` = `postgresql+asyncpg://` — unchanged |

SQLAlchemy 2.1 changed the default DBAPI for a bare `postgresql://` URL from `psycopg2` to `psycopg` (psycopg3). The repo standardizes on **one driver** (psycopg3):

- `DATABASE_URL_SYNC` stays **bare** (`postgresql://…`). It feeds SQLAlchemy (`create_engine`, Alembic) **and** the raw readiness probes in `backend/prestart.sh` / `workers/entrypoint.sh` (`psycopg.connect`). Do **not** add `+psycopg2` — psycopg3 accepts the bare URI, and the shell probes are not SQLAlchemy.
- PEP-646 typing in 2.1 requires **Mypy ≥ 1.7** and surfaced 4 `var-annotated` locals in `workers/tasks/host_protect.py`; fixed with annotations, not `type: ignore`.

## SES SDK (`boto3`) in workers

| Layer | Pin | Notes |
|-------|-----|--------|
| **boto3** (backend + workers) | `boto3>=1.43.114` | SES v2 send path in `app/services/email.py` |

Workers send mail through the **backend** module `app.services.email` (scan-diff notifications via `workers/utils/scan_notify.py`, uptime alerts via `workers/tasks/uptime.py`). `SES_ENABLED` is process-wide, so when it is on the worker takes the same branch as the API.

Without the SDK in the worker image the import fails and `_ses_send_sync` returns `None`, so the worker **silently falls back to the SMTP bridge** while the API uses SES — same config, two different providers. The worker therefore declares the SDK with the same floor as the backend.

`scripts/check-requirements-sync.sh` (CI job `deps-sync`) compares the **specifier** of every package declared in both files, including ranges, so this cannot drift again.

## Do not

- Blind `pip install -U redis` past 6.4 while Kombu still has `<6.5`.
- `npm audit fix --force` for React Router (downgrades SPA).
- Full `scripts/deploy.sh` volume wipe only to “refresh” Redis pins.
