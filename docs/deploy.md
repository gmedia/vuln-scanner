# Deploy (local vs production)

Public-repo safe: **no production IPs, SSH ports, emails, or secrets** in this file. Keep inventory in a private ops note.

Agent/session priority: [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md). Multi-host roles: [`multi-host-ops.md`](multi-host-ops.md). Workflow rules: [`../AGENTS.md`](../AGENTS.md) (**CI deploy vs Alembic**).

---

## 1) What “production” is

| Piece | Fact |
|-------|------|
| **Public edge** | Host nginx TLS → compose **frontend** (`127.0.0.1:5174`) and **backend** (`127.0.0.1:8000`). Templates: [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf), [`nginx/vs.appmedia.id.conf`](../nginx/vs.appmedia.id.conf). |
| **App compose** | [`docker-compose.prod.yml`](../docker-compose.prod.yml) (+ optional [`docker-compose.prod.remote-data.yml`](../docker-compose.prod.remote-data.yml) when `REMOTE_DATA=1`). |
| **Project name** | Default in scripts: `COMPOSE_PROJECT_NAME=vuln`. Live stacks may be `vuln-scanner`. **Match labels** on the edge (`docker inspect vuln-backend … com.docker.compose.project`) or you get a second empty network. |
| **Coding host ≠ edge** | Laptop Docker / local `/health` is **not** production proof. Deploy scripts run on the **app host** that serves public DNS. |
| **Host WAF** | Snippet is for **customer VPS**. Never paste Coraza/ModSecurity onto Sinexis **edge** nginx. |

Lab aliases (SSH config only — **never IPs in git**): **tc1** app, **tc2** data, **tc3** Guard Manager/Indexer, **tc4** ip/domain workers, **tc5** Guard agent lab.

---

## 2) Choose a script

| Script | When | Destructive? | Alembic |
|--------|------|----------------|---------|
| **CI `deploy` job** (`.github/workflows/ci.yml`) | `push` to **`main`** (not PR). Writes app-host `.env` from **repo** Actions secrets, then SSH (bastion) runs `scripts/deploy.sh`. | Same as `deploy.sh` | **Yes** — `docker exec vuln-backend alembic upgrade head` |
| [`scripts/deploy.sh`](../scripts/deploy.sh) | Full stack roll from CI or rare rebuild | **Yes** if `REMOTE_DATA` unset: `down --volumes` + volume rm. With `REMOTE_DATA=1`: no local postgres/redis containers; still recreates **app** containers. | **Yes** |
| [`scripts/deploy-services.sh`](../scripts/deploy-services.sh) | **Routine** app deploys (API, workers, SPA, beat) | **No** postgres/redis volumes. `--no-deps` recreate listed services. | **Yes** if `backend` is in the list and `--skip-migrate` is **unset** |
| [`scripts/deploy-frontend.sh`](../scripts/deploy-frontend.sh) | SPA-only | No | No |

**Prefer `deploy-services.sh` for day-to-day.** Prefer `deploy-frontend.sh` for UI-only. Use full `deploy.sh` when CI does, or when ops explicitly wants a full rebuild.

`workflow_dispatch` with **`skip_deploy`** skips the job. Manual dispatch also **does not** rewrite app-host `.env` (that overwrite is **`push` to `main` only**).

---

## 3) CI deploy vs Alembic (do not confuse)

When **`main` CI is green including the `deploy` job**, production already:

1. `git pull`s `main` on the app host
2. rebuilds / starts compose
3. runs **`alembic upgrade head`**

**Do not** tell anyone to SSH and migrate “next” after a successful main deploy. Residual work is **product/ops** (HPP rates, GTM, SMTP/SSL smoke) — not a second migration.

Manual Alembic only if:

- the **deploy job failed**, or
- a host **without** CI, or
- someone ran `deploy-services.sh --skip-migrate`

Never print deploy hosts, jump hosts, or keys.

---

## 4) Minimal local (dev)

Not production. Do not treat this as attach proof.

```bash
cp .env.example .env   # set API_KEY, JWT_SECRET, etc.
docker compose up -d   # or: make install-dev && make dev + uvicorn / celery / vite
# backend: alembic upgrade head
```

Local/CI flags stay conservative (see `.env.example`): `HOST_PROTECT_ENABLED` / `HOST_WAF_ENABLED` / `SIEM_ENABLED` typically **false**; `GUARD_MOCK_WAZUH=true`. Prod compose may default Host Protect / Host WAF **true** for the **API**; per-site WAF mode is still **off** until an admin sets detect.

---

## 5) Minimal production (app host)

Prereqs: repo clone on the **edge/app** host, working `.env` (mode 600), Docker, host nginx already proxying 5174/8000.

```bash
cd /path/to/vuln-scanner
git fetch origin && git checkout main && git pull origin main
# Match live compose project:
#   docker inspect vuln-backend --format '{{index .Config.Labels "com.docker.compose.project"}}'
export COMPOSE_PROJECT_NAME=vuln   # or vuln-scanner — match inspect
# Remote Postgres/Redis:
# export REMOTE_DATA=1

# Routine (non-destructive):
./scripts/deploy-services.sh
# or SPA only:
# ./scripts/deploy-frontend.sh

# Include celery_beat when rolling Scan Attach schedules.
# Include worker_mobile when rolling AAB/APK worker timeouts.
```

`deploy-services.sh` **never** rebuilds postgres/redis. Default service list is in the script header (backend, frontend, workers, beat — **not** `worker_ip`/`worker_domain` when those live on **tc4**).

### Verify (public URL — do not hardcode hosts in tickets)

```bash
curl -sS "$PUBLIC_BASE_URL/api/health"          # expect 200
curl -sS "$PUBLIC_BASE_URL/health/queues"
curl -sS "$PUBLIC_BASE_URL/" | grep -oE 'assets/index-[^"]+\.js'
docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'
docker exec vuln-backend alembic current        # only if you need to confirm head; not a second migrate
```

---

## 6) Flags ops actually cares about

Set on the **app host `.env`** and/or GitHub **repository** secrets (CI overwrite on `push` to `main` **drops** host-only keys that are missing from GitHub). Empty `WAZUH_*` secrets are **skipped** (`append_if_set`) so blank GitHub values do not wipe lab URLs.

| Flag | Notes |
|------|--------|
| `REMOTE_DATA` | `1` → overlay, no local postgres/redis containers |
| `GUARD_ENABLED` / `GUARD_MOCK_WAZUH` | Live lab: mock **false** + `WAZUH_*` injected into **backend** compose |
| `SIEM_ENABLED` | Prod may be ON; keep `SIEM_INCLUDE_FULL_LOG=false` |
| `HOST_PROTECT_ENABLED` | Prod compose default **true**; SaaS worker **does not** mount customer disks — Hits stay empty until the **on-box helper** on the VM that has the docroot |
| `HOST_WAF_ENABLED` | API flag; per-site mode still off until detect. **Not** edge nginx |
| `UPTIME_ENABLED` / `STATUS_PAGE_*` | Uptime + custom hostname (Cloudflare secrets; no ACME in-app) |
| `OBJECT_STORAGE_BACKEND` | `cos` for mobile uploads across hosts; default `local` |

Do not invent extra enroll daemons. Do not wipe live ERP agent `sx-erpstg`. Guard e2e enroll: wipe **tc5** first ([guide §4.1](AGENT_EXECUTION_GUIDE.md)).

---

## 7) Related ops docs

| Topic | Doc |
|-------|-----|
| Hosts, UFW, Guard, COS | [`multi-host-ops.md`](multi-host-ops.md) |
| Schedules / beat | [`scan-schedules-ops.md`](scan-schedules-ops.md) |
| Assets | [`scan-assets-ops.md`](scan-assets-ops.md) |
| Uptime | [`uptime-ops.md`](uptime-ops.md) |
| Broker pin | [`dependency-pins.md`](dependency-pins.md) |
| Host Protect honesty | [`specs/host-protect-v1.md`](specs/host-protect-v1.md) |
| Host WAF (no edge Coraza) | [`specs/host-waf-v1.md`](specs/host-waf-v1.md) |
