# Multi-host ops (app + data + optional Guard)

Public-repo safe: **no production IPs, passwords, or SSH users** in this file.
Keep real inventory in a private ops note or password manager.

## Roles

| Role | Runs | Notes |
|------|------|--------|
| **App host** | backend, frontend, **mobile** worker, dead-letter, beat; host nginx TLS | `REMOTE_DATA=1` compose overlay. Keep mobile here while uploads/`scan_data` are local paths. |
| **Worker host** (optional scale-out) | `worker_ip`, `worker_domain` only | Same `.env` broker/DB as app; **no** public 80/443. Shared Redis = Celery queue. |
| **Data host** | PostgreSQL 16, Redis 8 (or distro Redis) | ufw: **app + worker** host CIDRs → 5432/6379; **pg_hba** must allow those same client IPs for the app DB role |
| **Guard host** (optional, later) | Wazuh Manager ± Indexer | API/Indexer only from app host; agent ports as needed |

Early launch: app + data first; **Guard mock** on app host until Guard host is ready. Split **ip/domain** workers to a worker host when app CPU is tight; leave **mobile + beat** on the app host until shared object storage exists for uploads.

## App host compose

```bash
cd /path/to/vuln-scanner
# .env: DATABASE_URL / REDIS_URL / CELERY_* → data host (from data-host cred file)
export COMPOSE_PROJECT_NAME=vuln-scanner   # match existing labels if any
export REMOTE_DATA=1
./scripts/deploy-services.sh
# equivalent:
# docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
#   up -d backend frontend worker_mobile worker_dead_letter celery_beat
```

Do **not** start `postgres`/`redis` containers on the app host when using remote data.

## Worker host (ip + domain scale-out)

On the **worker** VPS (after Docker install, bastion-only SSH, repo clone, `.env` copied from app with mode 600):

```bash
cd /path/to/vuln-scanner
export COMPOSE_PROJECT_NAME=vuln   # match app project name if you share naming
export REMOTE_DATA=1
docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
  up -d --build worker_ip worker_domain
# Do not start backend/frontend/beat/mobile here unless you redesign file sharing.
```

Then on the **app** host, stop only the queues you moved:

```bash
export REMOTE_DATA=1 COMPOSE_PROJECT_NAME=vuln   # same as above
docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
  stop worker_ip worker_domain && \
docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
  rm -f worker_ip worker_domain
```

**Data host must allow the worker public IP** (not only the app host):

1. **UFW** (or equivalent): allow TCP 5432 and 6379 from worker CIDR `/32` (same pattern as app).
2. **PostgreSQL `pg_hba.conf`**: add a `host` line for the app DB/user from the worker `/32` with `scram-sha-256`, then `systemctl reload postgresql` (or equivalent). UFW alone is not enough if `pg_hba` is IP-allowlisted.
3. Redis: password + network allowlist; workers use the same `CELERY_*` / `REDIS_URL` as the app.

Verify: worker containers `healthy`, logs show `Connected to redis` and `celery@… ready`, `GET /health` and `/health/queues` on the public edge still `ok`. CI deploy for the worker host is optional/manual until a second deploy target is wired.

**Mobile** can use **Tencent COS** when `OBJECT_STORAGE_BACKEND=cos` (plus `COS_*` secrets). Backend uploads the package and enqueues `cos://<key>`; the mobile worker downloads to a temp path, scans, then deletes the object. With `local` (default), mobile still needs a shared `scan_data` volume on the same host as the API.

Set the same `OBJECT_STORAGE_BACKEND` / `COS_*` on **app** and **mobile worker** hosts (CI deploy writes them into app `.env`). Keep buckets **private**; use a sub-user with object put/get/delete only.

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

### SSH target + jump bastion

App-host UFW should allow **SSH only from a bastion** (coding/ops host), not from the public internet. GitHub-hosted runners then cannot open TCP/22 to the app host directly. CI uses **ProxyJump** through the bastion:

| Secret | Purpose |
|--------|---------|
| `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_PORT` / `DEPLOY_SSH_KEY` / `DEPLOY_PATH` | Final SSH target = **app host** (unchanged) |
| `DEPLOY_JUMP_HOST` / `DEPLOY_JUMP_USER` / `DEPLOY_JUMP_PORT` / `DEPLOY_JUMP_SSH_KEY` | Bastion for appleboy `proxy_*` and `scp`/`ssh` `ProxyCommand` |

Ops checklist (values only in secrets / private notes — never commit):

1. Dedicated jump key on bastion `authorized_keys` (CI-only; not personal laptop keys if avoidable).
2. App (and data/guard) host UFW: SSH from bastion CIDR(s) only.
3. If bastion public IP rotates: update `DEPLOY_JUMP_HOST` and host UFW allowlists.
4. Prefer bastion SSH locked down later (known admin + Actions egress patterns); do not reopen app SSH to the world for CI.

Workflow writes app-host `.env` with `POSTGRES_HOST` defaulting to Docker service name `postgres` for single-host backwards compatibility.

## Public edge (Cloudflare + host nginx)

Template (no secrets): [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf) → app host `/etc/nginx/conf.d/sinexis.app.conf`.

| Step | Who | Notes |
|------|-----|--------|
| DNS A/AAAA proxied (orange) | Human | Apex + `www` if used |
| Origin cert on app host | Human + ops | **Cloudflare Origin CA** preferred; self-signed OK only with SSL mode **Full** |
| SSL/TLS mode | Human | **Full** while self-signed; **Full (strict)** after Origin CA (or trusted public CA) |
| Automatic SSL/TLS | Optional | Cloudflare may upgrade gradually; it does **not** auto-downgrade if origin cert expires |
| App CORS / frontend URL | Ops | `FRONTEND_URL` + `CORS_ORIGINS` = public `https://` origin |

Do **not** use Flexible/Off for production login or API traffic.

Optional harden (after Full strict stable): restrict app host 80/443 to Cloudflare IP ranges; nginx `real_ip` / Authenticated Origin Pulls.

## Firewall checklist

- Data host: SSH from bastion only; **5432/6379 from app + worker host CIDRs**; **pg_hba** entries for those same IPs
- App host: 80/443 Cloudflare-only (or public until CF ranges applied); SSH **bastion-only** (CI jump, not open world)
- Worker host: SSH bastion-only; **no** need for public HTTP; outbound to data 5432/6379 and any scan targets
- Bastion (coding host): optional UFW for SSH from admin + CI; hosts jump private key material
- Guard host (later): SSH bastion-only; 55000/9200 from app only; agent 1514/1515 as required

## Cross-region latency

App and data in **different regions** adds RTT on every query. Acceptable for early traffic; prefer **same region** when upgrading.

## Guard

Keep `GUARD_MOCK_WAZUH=true` until Manager URL + credentials exist on the Guard host and are wired into app `.env` / secrets. See `docs/specs/guard-v1.md`.
