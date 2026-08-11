# Multi-host ops (app + data + optional Guard)

Public-repo safe: **no production IPs, passwords, or SSH users** in this file.
Keep real inventory in a private ops note or password manager.

## Roles

| Role | Runs | Notes |
|------|------|--------|
| **App host** | backend, frontend, Celery workers, beat; host nginx TLS | `REMOTE_DATA=1` compose overlay |
| **Data host** | PostgreSQL 16, Redis 8 (or distro Redis) | ufw: **only app host** → 5432/6379 |
| **Guard host** (optional, later) | Wazuh Manager ± Indexer | API/Indexer only from app host; agent ports as needed |

Early launch: app + data first; **Guard mock** on app host until Guard host is ready.

## App host compose

```bash
cd /path/to/vuln-scanner
# .env: DATABASE_URL / REDIS_URL / CELERY_* → data host (from data-host cred file)
export COMPOSE_PROJECT_NAME=vuln-scanner   # match existing labels if any
export REMOTE_DATA=1
./scripts/deploy-services.sh
# equivalent:
# docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
#   up -d backend frontend worker_ip worker_domain worker_mobile worker_dead_letter celery_beat
```

Do **not** start `postgres`/`redis` containers on the app host when using remote data.

## Data host bootstrap

On the **data** VPS (sudo user):

```bash
# copy repo scripts or curl raw script; then:
APP_HOST_CIDR=<app-public-ip>/32 ./scripts/bootstrap-data-host.sh
```

Writes `$HOME/sinexis-data-credentials.env` (mode 600). **Never** commit that file.

From a bastion (not into git):

```bash
scp data-host:sinexis-data-credentials.env ./  # private machine only
# merge into app host .env + GitHub environment "production" secrets
```

## GitHub Actions deploy secrets (production environment)

Existing keys stay (API_KEY, JWT, SMTP, …). For remote data add/adjust:

| Secret | Purpose |
|--------|---------|
| `POSTGRES_HOST` | Data host hostname or IP (app reaches Postgres here) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB auth |
| `REDIS_URL` | Full URL including password, e.g. `redis://:PASS@DATA_HOST:6379/0` |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Usually same Redis URL family |
| `FRONTEND_URL` / CORS via existing or host nginx | Public site origin |
| Guard (later) | `GUARD_MOCK_WAZUH`, `WAZUH_*` — see `.env.example` |

Workflow writes app-host `.env` with `POSTGRES_HOST` defaulting to Docker service name `postgres` for single-host backwards compatibility.

## Firewall checklist

- Data host: SSH + **5432/6379 only from app host CIDR**
- App host: 80/443 public; SSH admin-only
- Guard host (later): 55000/9200 from app only; agent 1514/1515 as required

## Cross-region latency

App and data in **different regions** adds RTT on every query. Acceptable for early traffic; prefer **same region** when upgrading.

## Guard

Keep `GUARD_MOCK_WAZUH=true` until Manager URL + credentials exist on the Guard host and are wired into app `.env` / secrets. See `docs/specs/guard-v1.md`.
