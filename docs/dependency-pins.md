# Dependency pins (broker stack + frontend audit)

Operational reference so Redis/Celery and frontend audit residuals stay intentional, not accidental drift.

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

See [SECURITY.md — Accepted residual dependency risks](../SECURITY.md#accepted-residual-dependency-risks) for React Router GHSA-qwww-vcr4-c8h2 and override pins.

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
| **asyncpg** (async driver) | `asyncpg==0.31.0` (backend) / `0.32.0` (workers) | `DATABASE_URL` = `postgresql+asyncpg://` — unchanged |

SQLAlchemy 2.1 changed the default DBAPI for a bare `postgresql://` URL from `psycopg2` to `psycopg` (psycopg3). The repo standardizes on **one driver** (psycopg3):

- `DATABASE_URL_SYNC` stays **bare** (`postgresql://…`). It feeds SQLAlchemy (`create_engine`, Alembic) **and** the raw readiness probes in `backend/prestart.sh` / `workers/entrypoint.sh` (`psycopg.connect`). Do **not** add `+psycopg2` — psycopg3 accepts the bare URI, and the shell probes are not SQLAlchemy.
- PEP-646 typing in 2.1 requires **Mypy ≥ 1.7** and surfaced 4 `var-annotated` locals in `workers/tasks/host_protect.py`; fixed with annotations, not `type: ignore`.

## Do not

- Blind `pip install -U redis` past 6.4 while Kombu still has `<6.5`.
- `npm audit fix --force` for React Router (downgrades SPA).
- Full `scripts/deploy.sh` volume wipe only to “refresh” Redis pins.
