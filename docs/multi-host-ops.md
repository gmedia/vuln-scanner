# Multi-host ops (app + data + optional Guard)

Public-repo safe: **no production IPs, passwords, or SSH users** in this file.
Keep real inventory in a private ops note or password manager.

## Roles

| Role | Runs | Notes |
|------|------|--------|
| **App host** | backend, frontend, **mobile** worker, dead-letter, beat; host nginx TLS | `REMOTE_DATA=1` compose overlay. Keep mobile here while uploads/`scan_data` are local paths. |
| **Worker host** (optional scale-out) | `worker_ip`, `worker_domain` only | Same `.env` broker/DB as app; **no** public 80/443. Shared Redis = Celery queue. Worker image has **no FastAPI**: `guard.sync_all` (queue `ip_scan`) must import `app.services.guard_apply`, not `app.services.guard`. |
| **Data host** | PostgreSQL 16, Redis 8 (or distro Redis) | ufw: **app + worker** host CIDRs → 5432/6379; **pg_hba** must allow those same client IPs for the app DB role |
| **Guard host** | Wazuh Manager + Indexer (all-in-one lab OK) | API `:55000` + Indexer `:9200` **only** from app host; agent `:1514`/`:1515` only from lab/agent hosts. Do **not** expose dashboard `:443` to the public internet unless ops explicitly needs it. |
| **Guard lab agent** (optional) | `wazuh-agent` only | Enroll via app API (`GUARD_MOCK_WAZUH=false`). Never install an agent using a **mock** key. Host Protect helper: [`packaging/host-protect-helper/README.md`](../packaging/host-protect-helper/README.md) + AM [`docs/host-protect-helper-am.md`](host-protect-helper-am.md) on **tc5** only. |

Lab shorthand (private SSH aliases — **never** put IPs in git): **app** = `tc1`, **data** = `tc2`, **Guard** = `tc3`, **ip/domain workers** = `tc4`, **agent VM** = `tc5`.

Early launch used **Guard mock** on the app host. Live Manager/Indexer now lives on the Guard host; set `GUARD_MOCK_WAZUH=false` and `WAZUH_*` **only** in host `.env` (mode 600). Compose must pass those keys into `backend` (`docker-compose.prod.yml`). Split **ip/domain** workers to a worker host when app CPU is tight; leave **mobile + beat** on the app host until shared object storage exists for uploads.

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

**Host Protect S6 lab (worker host only):** `worker_ip` bind-mounts `/var/www/host-protect-fixture` (override `HOST_PROTECT_LAB_BIND`). Plant a tiny PHP string that matches in-repo `.yar` **on the worker host**, then recreate `worker_ip`. Do **not** point this at live ERP or `tc5`. Without the dir inside the container, scans stay `engine=mock`.

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

Existing keys stay (API_KEY, JWT, SMTP, …). CI `deploy` reads **repository** Actions secrets (not only Environment `production`). A `workflow_dispatch` run does **not** write app-host `.env` — that job is `push` to `main` only.

Each deploy **overwrites** app-host `.env` from those secrets. Host-only keys that are missing from GitHub are dropped. For live Guard/SIEM, set the `WAZUH_*` names below on the **repo** (empty values are skipped by `append_if_set`; missing names still wipe previous host lines). Never put URLs, users, or passwords in this file.

For remote data add/adjust:

| Secret | Purpose |
|--------|---------|
| `POSTGRES_HOST` | Data host hostname or IP (app reaches Postgres here) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | DB auth |
| `REDIS_URL` | Full URL including password, e.g. `redis://:PASS@DATA_HOST:6379/0` |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Usually same Redis URL family |
| `FRONTEND_URL` / CORS via existing or host nginx | Public site origin |
| Guard | `GUARD_MOCK_WAZUH=false` on live lab; `WAZUH_MANAGER_*`, `WAZUH_INDEXER_*`, `WAZUH_AGENT_MANAGER_HOST`, `WAZUH_VERIFY_TLS` — see `.env.example`. Values stay in host `.env` / secrets, never in markdown. |

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

### Lab agent enroll / unenroll smoke (`tc5`)

Repeatable **host** cycle (not Playwright). Default SSH alias **`tc5`**. Do not print tokens, keys, or IPs.

**Wipe first** when the user asks for a full prod e2e suite **including** enroll/unenroll, or a standalone enroll test. Leftover `client.keys` (old `003` / hostname `VM-0-4-ubuntu`) blocks import of the product-redeemed key. Auto-enrollment then creates a **different** Manager agent while the app id stays `never_connected`.

1. Stop `wazuh-agent` on `tc5`; truncate `client.keys`; drop leftover `queue/rids/<id>` (keep `sender_counter`).
2. From **app host `tc1`** (Manager `:55000` is not open to the bastion): `DELETE` smoke agents. **Never delete `000`.** After an explicit unbind, former lab id `003` may be deleted so enroll can reuse the VM.
3. Delete leftover `guard_agents` rows in app DB (sync does **not** remove them).
4. Prefer `<enrollment><enabled>no</enabled>` on `tc5` so the package does not self-register.
5. Import with `manage_agents -i <key>` and confirm `y`. Do **not** rely on `-i /dev/stdin`.

```bash
export GUARD_LAB_APP_BASE='https://<app-origin>'   # not public prod unless you override
export GUARD_LAB_EMAIL='...'
export GUARD_LAB_PASSWORD='...'
export GUARD_LAB_AGENT_SSH=tc5
# after wipe, 003 is not a live identity:
export GUARD_LAB_PROTECTED_AGENT_IDS=000
./scripts/guard-lab-enroll-smoke.sh              # redeem + import key on tc5 + sync
./scripts/guard-lab-enroll-smoke.sh --api-only   # Manager pending agent only
# later (Manager DELETE must run on tc1 or via jump; bastion :55000 times out):
export WAZUH_MANAGER_URL WAZUH_MANAGER_USER WAZUH_MANAGER_PASSWORD
./scripts/guard-lab-enroll-smoke.sh --unenroll
# then delete the matching guard_agents row — product has no unenroll API
```

Manual GitHub Action: **Guard lab enroll smoke** (`workflow_dispatch` only, `--api-only` on github-hosted). Full apply/stop needs a bastion with `Host tc5`. Script default protected ids are `000,003` — override to `000` after wipe.

### Host Protect lab on `tc5` (S10 helper + optional S12 Clam)

Public-safe. **Never** put IPs, tokens, or SSH users in git. Playwright ≠ enroll. Do **not** wipe live ERP (`sx-erpstg`).

1. **Guard first** (standing permission): wipe `tc5` then enroll per § Guard lab / AGENT_EXECUTION_GUIDE **§4.1**. Host Protect v1 requires a Guard agent.
2. **Flags:** `HOST_PROTECT_ENABLED=true` on API **and** `worker_ip`. Prod compose default true.
3. **Package on agent VM (`tc5`):** install `sinexis-host-scan` (deb `Recommends: clamav`). Optional Clam: extra `engine=clam` **only if** `clamscan` or `clamdscan` is on PATH. **No CVD in git.**
4. **Token:** `POST /api/host/agents/{id}/results-token` (admin). Put the token in **env on `tc5` only** (`SINEXIS_HOST_SCAN_TOKEN` or equivalent). Never commit it.
5. **Fixture:** `--prepare-fixture` from a host that resolves `GUARD_LAB_AGENT_SSH` (default `tc5`). Path under `/var/www`, `/srv/www`, or `/home` — default `/var/www/host-protect-fixture`. Not ERP docroots.
6. **Smoke:** `scripts/host-protect-lab-smoke.sh` (API cycle). Then on `tc5` run the helper against the fixture so ingest is `engine=yara|needles` (and `clam` if present). Missing root → `unreachable_root`, **not** mock hits.
7. Public origin: `HOST_PROTECT_LAB_ALLOW_PUBLIC_PROD=1` or `GUARD_LAB_ALLOW_PUBLIC_PROD=1`. Never print tokens or IPs.

### Host Protect lab smoke (after Guard enroll)

API cycle only: create a **fixture** site (default `/var/www/host-protect-fixture`), enqueue scan, **quarantine then restore** on the first hit (ignore is `open`-only and cannot follow ignore on the same row), optional ignore on a second open hit, delete site. **Not** Playwright. **Does not** wipe `tc5` or enroll Guard. **Do not** use live ERP (`sx-erpstg`) as `root_path`.

Requires `HOST_PROTECT_ENABLED` on the **API and `worker_ip`** (compose interpolates the same env). Beat also reads the flag for `host_protect.run_due`. Prod compose default **true**; local/CI still false. After a Host Protect merge, deploy **`worker_ip`** on the scan host to the same SHA as app `main` — otherwise the task is missing or skips. Scan is still **mock** if `root_path` is not a directory on the worker.

`--prepare-fixture` SSHs to `HOST_PROTECT_LAB_FIXTURE_SSH` if set, else `GUARD_LAB_AGENT_SSH` (default `tc5`). Run it from a host that **resolves** that alias (often the bastion, not the app host).

```bash
export GUARD_LAB_APP_BASE='https://<app-origin>'
export GUARD_LAB_EMAIL='...'
export GUARD_LAB_PASSWORD='...'
# optional: HOST_PROTECT_LAB_ROOT_PATH=/var/www/host-protect-fixture
# optional: HOST_PROTECT_LAB_AGENT_UUID=<guard_agents.id>
# optional: HOST_PROTECT_LAB_FIXTURE_SSH=<ssh-alias-that-resolves-agent>
./scripts/host-protect-lab-smoke.sh --prepare-fixture
./scripts/host-protect-lab-smoke.sh
```

Public origin still needs `HOST_PROTECT_LAB_ALLOW_PUBLIC_PROD=1` or `GUARD_LAB_ALLOW_PUBLIC_PROD=1`. Never print tokens or IPs. Flag on a public origin exposes `/host` to logged-in users — ops decision, not this script.

### Host WAF snippet (S4) — tenant VPS / lab vhost only

SaaS **does not** SSH. Admin `GET /api/host/waf/sites/{id}/snippet` returns a tiny ModSecurity/Coraza starter. Copy it onto the **customer VPS** or a **disposable lab vhost**.

- Do **not** include the snippet in `nginx/sinexis.app.conf` or any app-edge vhost.
- Do **not** auto-apply to `tc5` / live ERP.
- `SecRequestBodyAccess Off` — never log request bodies.
- CRS overlay is ops-owned; this generator is not Imunify and not a CRS dump.
- Prod compose default **`HOST_WAF_ENABLED=true`** (SaaS control plane). Per-site mode stays **off** until an admin chooses detect. Lab/local compose still default false.
- Do **not** paste the snippet onto `sinexis.app` edge.

S5 (live disposable vhost smoke) is a later slice.

### Host WAF lab smoke (S5)

API cycle: login → Guard agent → create **fixture** site (`/var/www/host-waf-fixture`) → upsert protect/mock → fetch snippet (must warn against `sinexis.app` edge) → simulate block → list events → delete site. **Not** Playwright. **Does not** wipe `tc5`, enroll Guard, or SSH to `tc5`.

`--apply-vhost` is optional and **requires** `HOST_WAF_LAB_VHOST_SSH` pointing at a **disposable** lab alias. The script **refuses** `tc5` and ERP-like names. It copies the snippet to `/tmp/sinexis-host-waf-lab.conf` on that host — operator still includes it on a lab vhost. Never `nginx/sinexis.app.conf`.

```bash
export GUARD_LAB_APP_BASE='https://<app-origin>'
export GUARD_LAB_EMAIL='...'
export GUARD_LAB_PASSWORD='...'
# optional: HOST_WAF_LAB_AGENT_UUID=<guard_agents.id>
./scripts/host-waf-lab-smoke.sh
# optional disposable vhost (not tc5, not ERP):
# export HOST_WAF_LAB_VHOST_SSH=<lab-alias>
# ./scripts/host-waf-lab-smoke.sh --apply-vhost
```

Public origin still needs `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1` or `GUARD_LAB_ALLOW_PUBLIC_PROD=1`. Prod API flag may be on; that is **not** edge WAF.
