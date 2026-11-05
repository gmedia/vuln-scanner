# Deploy (local vs production)

Public-repo safe: **no production IPs, SSH ports, emails, or secrets** in this file. Keep inventory in a private ops note.

Agent/session priority: [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md). Multi-host roles: [`multi-host-ops.md`](multi-host-ops.md). Host vCPU/RAM/disk (Compose lock, no tc6): [`compose-host-sizing.md`](compose-host-sizing.md). **New server + new domain bring-up: [`deploy-new-server.md`](deploy-new-server.md).** Workflow rules: [`../AGENTS.md`](../AGENTS.md) (**CI deploy vs Alembic**).

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

Scripts derive the repo root from their own location, so they work from any checkout path (e.g. `git clone` into a non-default directory) with no host-specific default. `deploy-auth.sh` is the exception: it targets a **remote** host, so it requires `DEPLOY_PATH` explicitly.

`.env.example` is the single key inventory for a fresh deploy: CI job **`env-inventory`** runs [`scripts/check-env-inventory.sh`](../scripts/check-env-inventory.sh) and fails if any compose-read or CI-written key is undocumented. Add new env vars to `.env.example` in the same PR.

`workflow_dispatch` with **`skip_deploy`** skips the job. Manual dispatch also **does not** rewrite app-host `.env` (that overwrite is **`push` to `main` only**).

### 2.1) Pull-only images from GHCR (multi-host)

After `ci-ok`, `main` CI publishes four immutable images:

| Image | Built from | Notes |
|---|---|---|
| `ghcr.io/<owner>/vuln-scanner-backend:sha-<commit>` | `backend/Dockerfile` (`runtime`) | |
| `ghcr.io/<owner>/vuln-scanner-workers:sha-<commit>` | `workers/Dockerfile` (`runtime`) | ip/domain/uptime/dead-letter/beat |
| `ghcr.io/<owner>/vuln-scanner-workers-mobile:sha-<commit>` | `workers/Dockerfile` + `INSTALL_BUNDLETOOL=1` | mobile only |
| `ghcr.io/<owner>/vuln-scanner-frontend:sha-<commit>` | `frontend/Dockerfile` (`production`) | |

On a host that must not build:

```bash
export REGISTRY=ghcr.io/<owner>
export IMAGE_TAG=sha-<commit>
docker login ghcr.io            # token with read:packages
docker compose -f docker-compose.prod.yml \
  -f docker-compose.prod.remote-data.yml \
  -f docker-compose.images.yml pull
docker compose -f docker-compose.prod.yml \
  -f docker-compose.prod.remote-data.yml \
  -f docker-compose.images.yml up -d --no-build
```

`docker-compose.images.yml` pins `image:` and `pull_policy: always`; the base file keeps `build:` for local/dev. Always pass `--no-build` so Compose cannot fall back to building. `deploy-services.sh` still builds by design — use the raw compose commands above on pull-only hosts.

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

When `backend` is in the service list and `--skip-migrate` is unset, the script now runs
`alembic upgrade head` **in a one-off container before** `up -d --force-recreate`.
`backend/prestart.sh` also migrates, but only after the old container has been removed — a
failing migration there leaves the API crash-looping. Pre-migrating means a failure aborts the
deploy while the previous backend keeps serving. `--skip-migrate` skips both the pre-run and the
post-recreate health gate, as before.

### Verify (public URL — do not hardcode hosts in tickets)

```bash
curl -sS "$PUBLIC_BASE_URL/api/health"          # expect 200
curl -sS "$PUBLIC_BASE_URL/health/queues"
curl -sS "$PUBLIC_BASE_URL/" | grep -oE 'assets/index-[^"]+\.js'
docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'
docker exec vuln-backend alembic current        # only if you need to confirm head; not a second migrate
```

`/api/health` also reports `sha` — the commit the backend image was deployed from.
The CI deploy job passes `GIT_SHA` in the deploy environment, and
`docker-compose.prod.yml` forwards it to the backend container. Compare it with `main`:

```bash
curl -sS "$PUBLIC_BASE_URL/api/health" | jq -r .sha
git ls-remote origin refs/heads/main | cut -c1-40
```

The scheduled **`Prod drift`** workflow (`.github/workflows/prod-drift.yml`)
does this every 6 hours and fails when production does not match `main`, or when
production reports `unknown` (i.e. the `GIT_SHA` deploy has not landed). This is
the alarm for "CI green but deploy red" — the mode that went unnoticed for ~50
hours on 2026-10-20/22.

A mismatch is not always drift. If the Actions API shows a **`CI/CD` run on `main`
queued or in progress**, production is expected to still report the previous SHA, so
the check skips with a notice and a step-summary row naming that run. As a second,
independent guard, a `main` commit younger than **20 minutes** also gets a grace
window even when the run lookup is unavailable (rate limit, permissions). Both guards
only apply to a SHA mismatch; `unknown`, an old commit with no in-flight deploy, and
every other mismatch still fail. A real drift alert therefore means: no `CI/CD` run
for `main` is pending, the commit is older than 20 minutes, and production is still
stale — i.e. the deploy job actually failed or never ran.

### Billing healthcheck (read-only)

After a deploy that touches billing, or when a customer reports a lockout:

```bash
./scripts/billing-healthcheck.sh                 # docker exec into vuln-postgres
PG_MODE=network ./scripts/billing-healthcheck.sh # psql via DATABASE_URL_SYNC
```

It only runs `SELECT`s. It prints: subscription status counts, `past_due`/`canceled`
workspaces, overdue invoices still marked `sent` (the read-only risk), recent
`billing_reminders` with send/failure counts, `billing_reminder` email log,
whether PKP tax is active, and workspaces missing a billing email or recipients.

The CI deploy job checks out the **exact commit it is deploying**
(`git fetch origin $GITHUB_SHA && git reset --hard $GITHUB_SHA`), not `origin/main`.
Compose config and `IMAGE_TAG` therefore always come from the same commit, even if
another merge lands while the deploy is running.

The `deploy` job also has a **preflight** step that retries TCP reachability to
the jump host three times before any SSH work, plus a 20-minute job timeout, so
a dead bastion fails in minutes instead of hanging for hours.

---

## 6) Flags ops actually cares about

Set on the **app host `.env`** and/or GitHub **repository** secrets (CI overwrite on `push` to `main` **drops** host-only keys that are missing from GitHub). Empty `WAZUH_*` and `INVOICE_BANK_*` secrets are **skipped** (`append_if_set`) so blank GitHub values do not wipe lab URLs or bank copy. `append_if_set` **double-quotes** values so spaces in holder/name survive `deploy.sh` sourcing `.env`.

| Flag | Notes |
|------|--------|
| `REMOTE_DATA` | `1` → overlay, no local postgres/redis containers |
| `GUARD_ENABLED` / `GUARD_MOCK_WAZUH` | Live lab: mock **false** + `WAZUH_*` injected into **backend** compose |
| `SIEM_ENABLED` | Prod may be ON; keep `SIEM_INCLUDE_FULL_LOG=false` |
| `HOST_PROTECT_ENABLED` | Prod compose default **true**; SaaS worker **does not** mount customer disks — Hits stay empty until the **on-box helper** on the VM that has the docroot |
| `HOST_WAF_ENABLED` | API flag; per-site mode still off until detect. **Not** edge nginx |
| `UPTIME_ENABLED` / `STATUS_PAGE_*` | Uptime + custom hostname (Cloudflare secrets; no ACME in-app) |
| `OBJECT_STORAGE_BACKEND` | `cos` for mobile uploads across hosts; default `local` |
| `INVOICE_BANK_NAME` / `ACCOUNT` / `HOLDER` | Scan invoice bank copy (Workspace Billing on `sent`). CI `append_if_set` writes host `.env`; **compose `backend` environment must pass them** (host `.env` alone is not in the container). Never commit real numbers. |
| `PAYMENT_GATEWAY_ENABLED` | Default **false**. When true, the authenticated pay action appears on `sent` invoices. Manual transfer stays visible. |
| `PAYMENT_PROVIDERS_ENABLED` | Comma list, e.g. `midtrans`. Empty = no provider. Only enabled providers are returned by `GET /api/payments/providers`. |
| `MIDTRANS_SERVER_KEY` | Server key only (backend env). **Never** put it in the SPA or git. Sandbox keys start `SB-Mid-server-`; production `Mid-server-`. Startup refuses a mode/key mismatch. |
| `MIDTRANS_IS_PRODUCTION` | `true` for production; `false` for sandbox. |
| `MIDTRANS_VERIFY_STATUS` | Default `true`; confirms `GET /v2/{order_id}/status` before marking paid. |
| Webhook URL | Register `https://<public-host>/api/webhooks/payments/midtrans` in the Midtrans dashboard per environment (sandbox vs production). No shared secret header is used for Midtrans; the signature is verified from the body. |

Payment rollout: keep `PAYMENT_GATEWAY_ENABLED=false` until the server key and the notification URL are configured. Turning the flag off returns the UI to manual transfer; existing `payment_attempts` rows are kept.

Operations: see [payments-ops.md](payments-ops.md).

Do not invent extra enroll daemons. Do not wipe live ERP agent `sx-erpstg`. Guard e2e enroll: wipe **tc5** first ([guide §4.1](AGENT_EXECUTION_GUIDE.md)).

---

## 7) Related ops docs

| Topic | Doc |
|-------|-----|
| New server + new domain bring-up | [`deploy-new-server.md`](deploy-new-server.md) |
| Hosts, UFW, Guard, COS | [`multi-host-ops.md`](multi-host-ops.md) |
| Postgres backup / restore | [`backup-restore-ops.md`](backup-restore-ops.md) |
| Schedules / beat | [`scan-schedules-ops.md`](scan-schedules-ops.md) |
| Assets | [`scan-assets-ops.md`](scan-assets-ops.md) |
| Uptime | [`uptime-ops.md`](uptime-ops.md) |
| Broker pin | [`dependency-pins.md`](dependency-pins.md) |
| Host Protect honesty | [`specs/host-protect-v1.md`](specs/host-protect-v1.md) |
| Host WAF (no edge Coraza) | [`specs/host-waf-v1.md`](specs/host-waf-v1.md) |
