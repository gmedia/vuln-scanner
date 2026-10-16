# Deploy to a new server and domain

Public-repo safe: **no production IPs, SSH ports, emails, or secrets in this file.** Keep values, access details, backups, and the cutover record in private ops notes. This document is a **CREATE**: there was no `deploy-new-server.md` to update.

| Canonical source | Use it for |
|------------------|------------|
| [`deploy.md`](deploy.md) | Script choice, routine deployments, CI versus Alembic |
| [`multi-host-ops.md`](multi-host-ops.md) | Host roles, firewall, bastion, data access, Cloudflare/TLS modes |
| [`compose-host-sizing.md`](compose-host-sizing.md) §5 | Sizing, Compose lock, provider cutover sequence |
| [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §4.1 and §8 | Guard lab wipe-first; public/private handling |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`docker-compose.prod.remote-data.yml`](../docker-compose.prod.remote-data.yml) | Service definitions and remote-data overlay |
| [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf) | Host nginx routing template; not a container |
| [`scripts/`](../scripts/) | Actual deploy, bootstrap, smoke, and rollback implementations |

---

## 1) Scope and deployment decision

This is a **Docker Compose** deployment, not Swarm or Kubernetes. `backend/` is FastAPI and Alembic, `workers/` contains the Celery app, and `frontend/` builds the SPA. They are separate build roots. The production compose file has **no edge nginx service**: nginx on the app host serves TLS and proxies the SPA on `127.0.0.1:5174` and API on `127.0.0.1:8000`.

| Choice | What to run | Stop and decide before proceeding if |
|--------|-------------|---------------------------------------|
| Single host | App, scan workers, PostgreSQL 16, Redis 8 in prod Compose; volumes `postgres_data`, `redis_data`, `scan_data` | This is an existing data set, not a fresh install |
| Multi-host | App/edge on `tc1`, data on `tc2`, optional `worker_ip` and `worker_domain` on `tc4`, optional Guard on `tc3`; `tc5` is lab only | Network, backup, or secrets ownership is unclear |
| New domain | Either a separate new installation or an intentional replacement of the current CI target | Existing public traffic or CI target must remain intact |

The coding host is not the app host. Fixed names such as `vuln-backend`, `vuln-postgres`, and `vuln-frontend` prevent two copies of this stack from coexisting on one Docker daemon without an explicit redesign. Do not treat a new Compose project name as sufficient isolation.

---

## 2) Inputs required before you start

Record these **privately**, not in the repo or command transcripts:

| Decision / input | Needed to proceed |
|------------------|-------------------|
| Deployment intent | Fresh empty install or migration; separate site or replacement; approved cutover and rollback owner |
| Host access | `<app-host>` sudo-capable non-root account, `<bastion>` reachability, Docker permission; `<data-host>` and optional worker/Guard access if split |
| Capacity | VM sizing, disk and backup target from [`compose-host-sizing.md`](compose-host-sizing.md); region and outbound access |
| Public origin | `$PUBLIC_BASE_URL=https://<new-domain>`; apex/`www` choice, DNS provider control, old origin if replacing |
| TLS | Cloudflare proxied with Origin CA, or public CA; certificate provisioning and renewal owner |
| Data | Fresh DB or verified Postgres backup/restore plan; Redis state policy; `scan_data` and object-store retention plan |
| Features | Guard mock or live, SIEM, Host Protect, Host WAF, Uptime, status custom host, AI Gateway, mobile object storage |
| Runtime credentials | PostgreSQL, Redis URLs/passwords, `API_KEY`, `SECRET_KEY`, `JWT_SECRET`, optional SMTP/admin/e2e/Guard/COS/Cloudflare values |
| Deploy control | Manual first deployment or an approved change to the **single existing** Actions production target; repo/environment secret ownership |

Do not continue if the old CI target must keep deploying: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) has **one** `deploy` job and one production environment. Changing its secrets to point to the new host redirects that job; it does not add a second target. Keep the new host on the manual path until a separate CI target is explicitly designed.

---

## 3) Phase 0: provision and secure hosts

1. Provision supported Linux hosts with sudo-capable non-root access, Docker Engine and the Compose plugin. For the remote-data overlay, Compose must support optional `depends_on` (`v2.20+`). Install **host** nginx on `<app-host>`; it is outside prod Compose.
2. Choose single-host or the `tc1`/`tc2` split. If splitting workers, place only `worker_ip` and `worker_domain` on `tc4`; mobile and beat stay on the app host while uploads use local `scan_data`.
3. Apply the SSH, UFW, PostgreSQL `pg_hba`, Guard, and edge rules in [`multi-host-ops.md`](multi-host-ops.md). Do not reproduce or relax those allowlists here. Set up backups before importing data.
4. Verify access through `<bastion>` and that no old `vuln-*` containers or conflicting nginx default vhost occupy the intended app host. Do not clear an existing stack to make room.

```bash
# On <app-host>; version and occupancy checks, no credentials printed.
docker version
docker compose version
sudo nginx -t
docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'
```

**Exit gate:** host sizing and access are approved; Docker/Compose and host nginx are available; data and rollback owners are identified.

---

## 4) Phase 1: checkout and runtime configuration

Clone the approved revision onto `<app-host>` at the privately chosen `$DEPLOY_PATH`. Use `main` for the current CI deployment contract; do not assume the coding checkout is the server checkout. Prefix any actual repo git command with `GIT_MASTER=1` as required by [`AGENTS.md`](../AGENTS.md).

```bash
# On <app-host>; substitute the approved checkout path in private ops notes.
export DEPLOY_PATH="$HOME/vuln-scanner"
GIT_MASTER=1 git clone https://github.com/gmedia/vuln-scanner.git "$DEPLOY_PATH"
# In the checkout, review the approved revision and compose files before starting.
```

Create `$DEPLOY_PATH/.env` privately with mode `600`. Use [`.env.example`](../.env.example) as a **key inventory, not production values**. Generate independent secrets on the host (`openssl rand -hex 32`), transfer through a secret manager, and never print them in logs. At minimum set `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `DATABASE_URL`, `DATABASE_URL_SYNC`, `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `API_KEY`, `SECRET_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, and `COOKIE_SECURE=true`. Set `SMTP_FROM` to an approved sender address privately if mail is enabled. Local compose hostnames are `postgres`/`redis`; remote URLs must instead reach `<data-host>`.

```bash
# On <app-host>, after the private .env has been installed.
chmod 600 "$DEPLOY_PATH/.env"
export PUBLIC_BASE_URL='https://<new-domain>'
export COMPOSE_PROJECT_NAME=vuln
# Existing stack only: derive the project name instead of guessing.
docker inspect vuln-backend --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

On a **brand-new** host, `docker inspect` is expected to fail because no backend exists yet. Scripts default to project `vuln`; an existing stack may use `vuln-scanner`. Fix the project name before recreating anything. [`backend/entrypoint.sh`](../backend/entrypoint.sh) runs [`backend/prestart.sh`](../backend/prestart.sh) before uvicorn: it requires `API_KEY`, `DATABASE_URL`, `DATABASE_URL_SYNC`, `REDIS_URL`, `SECRET_KEY`, and `JWT_SECRET`, rejects template keys, checks PostgreSQL/Redis, then runs `alembic upgrade head`. Do not use template credentials or a wildcard CORS origin.

**Exit gate:** a private `.env` is complete, permissions are `600`, and both async/sync DB URLs and broker URLs point at the chosen data plane.

---

## 5) Phase 2: bring up Compose and data

### Single-host, fresh database

On `<app-host>`, run these **from `$DEPLOY_PATH`**. The prod file starts local PostgreSQL/Redis and all app workers. For an empty DB, backend prestart migrates it; a restored DB follows the restore gate below. Check resource capacity before building the mobile image.

```bash
export COMPOSE_PROJECT_NAME=vuln
# Run in $DEPLOY_PATH:
docker compose -f docker-compose.prod.yml config --services
docker compose -f docker-compose.prod.yml up -d --build --wait
curl -sf http://127.0.0.1:8000/health
curl -sf http://127.0.0.1:5174/
docker exec vuln-backend alembic current
```

### Multi-host, remote database

Run [`scripts/bootstrap-data-host.sh`](../scripts/bootstrap-data-host.sh) **on `<data-host>`** as a sudo-capable non-root user. Provide `APP_HOST_CIDR` privately; `DATA_PUBLIC_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, and `CRED_FILE` are optional. Its default credential file is `$HOME/sinexis-data-credentials.env`, mode `600`; it configures PostgreSQL/Redis plus access from the app CIDR. Review its UFW behavior with the [`multi-host-ops.md`](multi-host-ops.md) firewall rules before running; don't leave SSH open beyond policy. Move credentials securely to the app host and approved CI secrets, never into git.

```bash
# On <data-host>; set APP_HOST_CIDR privately to the app host CIDR.
APP_HOST_CIDR="$APP_HOST_CIDR" ./scripts/bootstrap-data-host.sh
```

On `<app-host>`, set `REMOTE_DATA=1` **both in `.env` and in the shell** for manual Compose commands. The overlay profiles local `postgres`/`redis` out and makes their dependencies optional. Put `DATABASE_URL`, `DATABASE_URL_SYNC`, `REDIS_URL`, and `CELERY_*` on the remote data host; verify its firewall and `pg_hba` access. The app command below omits `worker_ip`/`worker_domain` because they belong on `tc4` in this topology.

```bash
# On <app-host>, run in $DEPLOY_PATH.
export COMPOSE_PROJECT_NAME=vuln REMOTE_DATA=1
docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
  config --services
docker compose -f docker-compose.prod.yml -f docker-compose.prod.remote-data.yml \
  up -d --build --wait backend frontend worker_mobile worker_uptime worker_dead_letter celery_beat
curl -sf http://127.0.0.1:8000/health
curl -sf http://127.0.0.1:5174/
docker exec vuln-backend alembic current
```

If `tc4` is provisioned, follow the worker-host commands and additional data-host allowlists in [`multi-host-ops.md`](multi-host-ops.md); start `worker_ip` and `worker_domain` there against the **same** DB/broker and code revision. Do not start them twice. Only one `celery_beat` should run. **Exit gate:** data reachability, healthy backend and SPA, expected workers, and the Alembic current revision are confirmed before opening public DNS.

---

## 6) Phase 3: host nginx and private TLS

Copy [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf) to a **new named host vhost**. Replace both `server_name` lists, the `$host` status-root map, certificate paths, log paths, and the branded installer path if renaming it. Keep the route split: `/` to SPA (or custom status host), `/api/`, `/v1/`, `/ws/`, `/health`, `/health/queues`, `/metrics`, `/blog`, `/terms`, `/privacy`, and `/status` to backend as the template specifies. `/metrics` is API-key protected by FastAPI. Do not copy [`nginx/default.conf`](../nginx/default.conf) or [`nginx/entrypoint.sh`](../nginx/entrypoint.sh) as production edge config; those are for the local/dev compose nginx.

Choose and install a certificate for the new host **before enabling** the 443 vhost. The Cloudflare edge/TLS mode table is in [`multi-host-ops.md`](multi-host-ops.md); for a public CA, set host cert paths and renewal privately. Never commit keys or certs. Inspect existing default-server ownership before enabling this template, which declares `default_server` for 443. Don't overwrite an existing vhost.

```bash
# On <app-host>, after preparing a private new-domain vhost and certificates.
sudo nginx -t && sudo systemctl reload nginx
# The host vhost must reach these loopback upstreams:
curl -sf http://127.0.0.1:5174/
curl -sf http://127.0.0.1:8000/health
```

**Exit gate:** valid TLS on the selected edge path, nginx config test passes, and routing works without exposing the Compose backend/frontend ports publicly.

---

## 7) Phase 4: domain and brand change checklist

Decide whether this is **domain-only** (retain Sinexis name but change origins) or an approved **brand rename**. Apply only relevant changes in a separate reviewed revision **before building the public image**. Defaults left unchanged may generate links back to the old host. Every path below exists; references are stable by file or symbol, not by line number.

| Area / file | Check or change for the new domain/brand |
|-------------|------------------------------------------|
| [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf) | Rename the copied vhost filename; both `server_name`s; `$host`/`$status_page_custom_root` platform and fallback entries; cert `/etc/ssl/sinexis/origin.*`; access/error logs. Preserve island locations `/terms`, `/privacy`, `/status`, `/blog`, installer, and root routing. |
| [`nginx/vs.appmedia.id.conf`](../nginx/vs.appmedia.id.conf) | **Only if operating a legacy redirect:** both `server_name`s, both 301 destinations, Let's Encrypt cert paths, logs. Do not enable without control of the old name. |
| [`nginx/default.conf`](../nginx/default.conf) | `__DOMAIN__` is templated already for **dev**, not the prod vhost; review `/install/sinexis-install.sh` route if renaming installer. |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | `SMTP_FROM` and `FRONTEND_URL` defaults across API/IP/domain/uptime workers; backend `CORS_ORIGINS`; `STATUS_PAGE_CNAME_TARGET`. Override with `.env` and adjust defaults if this revision is dedicated to the new domain. |
| [`docker-compose.yml`](../docker-compose.yml), [`docker-compose.e2e.yml`](../docker-compose.e2e.yml), [`.env.example`](../.env.example) | Review local/e2e `STATUS_PAGE_CNAME_TARGET`, `SMTP_FROM`, `FRONTEND_URL`, `DOMAIN` as applicable; examples must never contain real senders or secrets. |
| [`backend/app/config.py`](../backend/app/config.py), [`backend/app/services/email.py`](../backend/app/services/email.py) | Defaults for `smtp_from`, `frontend_url`, `status_page_cname_target`, `sns_topic_arn`; mail `SMTP_FROM`, `FRONTEND_URL`, Sinexis header, Message-ID domain. Check SNS topic only if bounce/SES is configured. |
| [`backend/app/api/blog_html.py`](../backend/app/api/blog_html.py) | `CANONICAL_HOST` drives canonical URLs and the generated blog sitemap; review HTML shell brand labels too. |
| [`backend/app/api/legal_html.py`](../backend/app/api/legal_html.py), [`backend/app/api/status_html.py`](../backend/app/api/status_html.py) | Legal metadata/body host and brand; status platform-host list. |
| [`backend/app/models/status_page.py`](../backend/app/models/status_page.py) | `RESERVED_HOST_SUFFIXES` and platform hosts, consistent with nginx's status-root map. |
| [`backend/app/api/scan_routes.py`](../backend/app/api/scan_routes.py), [`backend/app/services/asset_pack_html.py`](../backend/app/services/asset_pack_html.py), [`backend/app/services/executive_report.py`](../backend/app/services/executive_report.py) | Hardcoded report brand links must target the approved public origin. |
| [`backend/app/services/invoice_html.py`](../backend/app/services/invoice_html.py) | `_SELLER`, product labels only if a legal/brand change is approved; do not infer seller identity from DNS. |
| [`backend/app/models/uptime.py`](../backend/app/models/uptime.py), [`backend/app/services/ai_proxy.py`](../backend/app/services/ai_proxy.py), [`backend/app/main.py`](../backend/app/main.py) | Uptime User-Agent, AI `owned_by`, API title, respectively, for a brand rename. |
| [`backend/static/sinexis-install.sh`](../backend/static/sinexis-install.sh), [`packaging/host-protect-helper/sinexis-install.sh`](../packaging/host-protect-helper/sinexis-install.sh) | **Two copies**: installer `API_BASE` default and branded `/etc/sinexis`, `/var/lib/sinexis`, rule names. If changing the route, also check [`backend/app/api/install_routes.py`](../backend/app/api/install_routes.py) and [`backend/app/middleware/auth.py`](../backend/app/middleware/auth.py). |
| [`frontend/src/lib/brand.ts`](../frontend/src/lib/brand.ts) | SPA constants: name/product, marks, metadata, footer, sidebar version. **Frontend brand strings are NOT single-sourced.** |
| [`frontend/index.html`](../frontend/index.html), [`frontend/src/theme/theme.ts`](../frontend/src/theme/theme.ts) | OG/title tags and `sinexis.theme` storage key; decide whether existing users should keep their theme preference. |
| [`frontend/src/lib/sinexisInstall.ts`](../frontend/src/lib/sinexisInstall.ts), [`frontend/src/lib/inviteToken.ts`](../frontend/src/lib/inviteToken.ts) | Hardcoded installer URL, invite storage key and fallback origin. |
| [`frontend/src/locales/en/`](../frontend/src/locales/en/), [`frontend/src/locales/id/`](../frontend/src/locales/id/) | Review `landing.json`, `guide.json`, `host.json`, `workspace.json`, `admin.json`, `guard.json`, `uptime.json` in **both** locales; copy is independent of `brand.ts`. |
| [`frontend/e2e/guard.spec.ts`](../frontend/e2e/guard.spec.ts), [`frontend/e2e/siem.spec.ts`](../frontend/e2e/siem.spec.ts), [`frontend/e2e/fixtures.ts`](../frontend/e2e/fixtures.ts), [`frontend/e2e/global-setup.ts`](../frontend/e2e/global-setup.ts) | Platform-host gates and `sinexis.locale` key; update tests if storage/origin changes. |
| [`deploy-auth.sh`](../deploy-auth.sh), [`scripts/deploy-services.sh`](../scripts/deploy-services.sh), [`scripts/deploy-frontend.sh`](../scripts/deploy-frontend.sh), [`scripts/smoke-broker.sh`](../scripts/smoke-broker.sh), [`scripts/wave-e-screenshots.mjs`](../scripts/wave-e-screenshots.mjs) | Old origin defaults/examples; use `BASE_URL`/`FRONTEND_URL` where supported. `deploy-auth.sh` is a one-shot SSH auth helper, **not** the normal deploy path. |
| [`scripts/guard-lab-enroll-smoke.sh`](../scripts/guard-lab-enroll-smoke.sh), [`scripts/host-protect-lab-smoke.sh`](../scripts/host-protect-lab-smoke.sh), [`scripts/host-waf-lab-smoke.sh`](../scripts/host-waf-lab-smoke.sh) | Platform-host refuse-lists; retain safety gates when adding a new public host. |
| [`scripts/bootstrap-data-host.sh`](../scripts/bootstrap-data-host.sh), [`scripts/build-host-protect-deb.sh`](../scripts/build-host-protect-deb.sh) | Credential filename/UFW/`pg_hba` comment markers and package maintainer metadata; review only for an approved rename. |
| [`monitoring/prometheus-scrape.example.yml`](../monitoring/prometheus-scrape.example.yml), [`monitoring/alerts-vuln-scanner.example.yml`](../monitoring/alerts-vuln-scanner.example.yml) | Target hostname and alert rule names; real metrics key stays out of tracked files. |

There is **no static** `frontend/public/robots.txt` or `frontend/public/sitemap.xml` to edit. The blog sitemap comes from `backend/app/api/blog_html.py` and `CANONICAL_HOST`. Search the reviewed revision for remaining brand/origin literals, including backend locale templates and frontend hardcoded copy; do not blindly replace terms in safety guards or migrations.

**Exit gate:** new-domain URL generation, status-host classification, installer URL, report links, mail sender, and both SPA locales match the approved intent.

---

## 8) Phase 5: restore or initialize data

| Path | Required gate |
|------|---------------|
| New installation | Start with an empty DB; backend prestart runs Alembic. Confirm `alembic current` and create only approved admin/e2e users privately. |
| Migrating data | Take and test a Postgres backup **before** cutover; restore into the new data plane before enabling app traffic, then let prestart/approved deploy migrate. Keep old DB read-only/available for the rollback window. |
| Redis | It is broker/cache state, not a replacement for the Postgres backup. Decide how outstanding jobs are drained or canceled before switching workers. |
| Uploads | Keep `scan_data` with the app/mobile worker when `OBJECT_STORAGE_BACKEND=local`; move to private object storage only with a planned data migration. |
| Guard | Agent IDs and Indexer state are **not** lift-and-shift. Follow [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §4.1 for `tc5` wipe-first before any enroll/unenroll lab cycle; never treat Playwright as host enroll. |

Do not run a second manual `alembic upgrade head` merely because CI was green: a successful `main` deploy already migrates. On a fresh manual startup, prestart also migrates. If restore or migration fails, stop before DNS and recover from the private backup, not `down --volumes`.

---

## 9) Phase 6: choose manual deployment or wire CI

**Manual first, recommended for a parallel new site:** keep `.env` on the new host and update the approved revision there. [`scripts/deploy-services.sh`](../scripts/deploy-services.sh) is the **routine** rebuild/recreate path; its default services are `backend frontend worker_mobile worker_uptime worker_dead_letter celery_beat`. It refuses `postgres`/`redis`, supports `--all`, `--no-cache`, `--skip-migrate`, and migrates plus upserts secret users when `backend` is included unless `--skip-migrate` is set. `DEPLOY_PATH`, `COMPOSE_PROJECT_NAME`, and `REMOTE_DATA` control its target. For SPA only use [`scripts/deploy-frontend.sh`](../scripts/deploy-frontend.sh).

```bash
# On <app-host>, after pulling an approved revision into $DEPLOY_PATH.
export DEPLOY_PATH="$HOME/vuln-scanner" COMPOSE_PROJECT_NAME=vuln
# Multi-host only: export REMOTE_DATA=1
"$DEPLOY_PATH/scripts/deploy-services.sh" backend frontend worker_mobile worker_uptime worker_dead_letter celery_beat
```

**CI only if replacing the existing production target, or after an approved separate workflow is built:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) has `deploy` after `ci-ok`, `environment: production`. It deploys on successful **push to `main`** or a non-skipped manual dispatch on `main` (`skip_deploy=false`, `skip_tests=false`), not on a PR or weekly schedule. The `Write .env on server` step uses `appleboy/ssh-action@v1.2.0` through a bastion; the next step copies `scripts/deploy.sh` over SSH and runs it on the app host. Repo secrets or `production` environment secrets work; environment-scoped values take precedence. Agree on scope before replacing any existing target.

Exact **connection secret names**: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`, `DEPLOY_PATH`, `DEPLOY_JUMP_HOST`, `DEPLOY_JUMP_USER`, `DEPLOY_JUMP_SSH_KEY`, `DEPLOY_JUMP_PORT`.

Exact **app secret names written as regular `.env` entries**:

```text
POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
REDIS_URL CELERY_BROKER_URL CELERY_RESULT_BACKEND
API_KEY SECRET_KEY JWT_SECRET SENTRY_DSN REMOTE_DATA
SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM
ADMIN_EMAIL ADMIN_PASSWORD E2E_EMAIL E2E_PASSWORD
DEFAULT_REGISTER_CREDITS IP_SCAN_CREDIT_COST DOMAIN_SCAN_CREDIT_COST
APK_SCAN_CREDIT_COST IPA_SCAN_CREDIT_COST NVD_API_KEY
FRONTEND_URL GOOGLE_CLIENT_ID CORS_ORIGINS COOKIE_SECURE
GUARD_ENABLED GUARD_MOCK_WAZUH GUARD_ALERT_MIN_LEVEL
GUARD_ENROLL_TOKEN_TTL_HOURS WAZUH_VERIFY_TLS
SIEM_ENABLED SIEM_SEARCH_MIN_LEVEL SIEM_MAX_LOOKBACK_HOURS
SIEM_INCLUDE_FULL_LOG SIEM_MAX_PAGE_SIZE HOST_PROTECT_ENABLED
AI_GATEWAY_ENABLED OBJECT_STORAGE_BACKEND
COS_SECRET_ID COS_SECRET_KEY COS_REGION COS_BUCKET COS_APP_ID
COS_ENDPOINT COS_PREFIX STATUS_PAGE_CF_STUB_ACTIVE
```

Exact **`append_if_set` secret names** (blank values are skipped):

```text
WAZUH_MANAGER_URL WAZUH_MANAGER_USER WAZUH_MANAGER_PASSWORD
WAZUH_INDEXER_URL WAZUH_INDEXER_USER WAZUH_INDEXER_PASSWORD
WAZUH_AGENT_MANAGER_HOST STATUS_PAGE_CF_API_TOKEN STATUS_PAGE_CF_ZONE_ID
INVOICE_BANK_NAME INVOICE_BANK_ACCOUNT INVOICE_BANK_HOLDER
```

The CI `deploy` job **overwrites `$DEPLOY_PATH/.env` on the app host on every successful push to `main` that reaches deploy**, from GitHub secrets. Non-skipped manual dispatch also reaches the same write step. `append_if_set` entries are skipped when blank and quoted when set, but a fresh heredoc means omitted host-only keys **do not survive** unless supplied by the workflow. CI derives `DATABASE_URL`/`DATABASE_URL_SYNC` from Postgres secrets and a Redis password from `REDIS_URL`; keep data and app URLs consistent. The CI path invokes [`scripts/deploy.sh`](../scripts/deploy.sh), which in single-host mode is **destructive** (`down --volumes` plus explicit named volume removal). Do not point it at a live single-host database without a tested backup and explicit approval.

---

## 10) Phase 7: verify the private host and public URL

Set `$PUBLIC_BASE_URL` privately to `https://<new-domain>` once DNS/TLS are ready. Run checks on the **new app host** and then from an external vantage point. Never infer public availability from a coding-host Docker check.

| Check | Command / expected result |
|-------|---------------------------|
| App local | `curl -sf http://127.0.0.1:8000/health` and `curl -sf http://127.0.0.1:5174/` succeed |
| Containers | `docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'` shows expected roles healthy/running |
| Schema | `docker exec vuln-backend alembic current` reports the deployed revision |
| Public API | `curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_BASE_URL/api/health"` returns `200` |
| Queues | `curl -sS "$PUBLIC_BASE_URL/health/queues"` returns queue status; verify the planned IP/domain worker placement |
| SPA | `curl -sS "$PUBLIC_BASE_URL/" \| grep -oE 'assets/index-[^"]+\.js'` finds the new build asset |
| Islands | Request `/blog`, `/terms`, `/privacy`, `/status` as applicable; confirm host/canonical URLs and routing |
| TLS/DNS | Browser or external HTTPS check resolves the intended new edge with a valid certificate; no old-domain redirects or mixed-origin links |
| Metrics | `/metrics` is **not** an unauthenticated public scrape; check only with an approved API key from private ops tooling |

```bash
# External verification, after DNS and TLS; no credentials in output.
curl -sS -o /dev/null -w '%{http_code}\n' "$PUBLIC_BASE_URL/api/health"
curl -sS "$PUBLIC_BASE_URL/health/queues"
curl -sS "$PUBLIC_BASE_URL/" | grep -oE 'assets/index-[^"]+\.js'
# On <app-host> only:
docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'
docker exec vuln-backend alembic current
```

If approved, use [`scripts/smoke-broker.sh`](../scripts/smoke-broker.sh) with `BASE_URL` set privately for Redis/Celery smoke. Full public e2e is separate from a Guard host enroll; follow guide §4.1 before any `tc5` cycle. **Exit gate:** public route, TLS, queues, DB revision, SPA asset, and selected modules pass checks.

---

## 11) Phase 8: cut over and roll back

Do the provider cutover in [`compose-host-sizing.md`](compose-host-sizing.md) §5 rather than improvising a second sequence. Before changing DNS, record old DNS target and TTL privately, take a verified DB backup, capture the deployed revision/image IDs, and keep the previous edge reachable. Then update DNS/Cloudflare for the approved new domain or switch the approved existing name to `<app-host>`; watch health, queues, login, mail, and logs through the rollback window. Coordinate writes: never let both old and new beats/workers act on the same live DB unintentionally.

| Failure | Recovery decision |
|---------|-------------------|
| Before DNS switch | Leave old traffic alone; repair the new host, nginx, TLS, or data; don't run a destructive cleanup |
| DNS/edge failure after switch | Repoint to the recorded old edge if it still serves the same name, or withdraw the new record; restore the old TLS/routing path and recheck external `/api/health` |
| App regression, DB still compatible | Restore a known-good app revision/images with the **same compose overlay and project name**, using the routine non-destructive service path; verify migrations are compatible first |
| Migration or data regression | Stop new writers and beat, use the tested private Postgres backup/restore plan; do **not** assume image rollback reverses a schema change |

[`scripts/rollback.sh`](../scripts/rollback.sh) is **not a generic safe cutover undo**: it requires `:previous` images, references hyphenated worker image tags, and runs `docker compose -f docker-compose.prod.yml down`/`up -d --wait` without the remote-data overlay. Verify actual image tags, service topology, project name, schema compatibility, and data backup before considering it. It does **not** revert DNS, nginx, `.env`, Guard identities, or database migrations. On multi-host, prefer a reviewed manual rollback plan for each host instead of running this script blindly.

---

## 12) Known traps and anti-patterns

- **Never run [`scripts/deploy.sh`](../scripts/deploy.sh) for routine app changes.** Single-host mode uses `down --volumes` and removes named data volumes; use `deploy-services.sh` instead. A successful CI `main` deploy already ran Alembic.
- A new Compose project cannot avoid fixed `container_name` conflicts on a shared Docker host. Inspect the running backend's project label before reuse.
- `.env` is read for Compose interpolation; only variables passed through a service's `environment` reach that container. A GitHub secret by itself doesn't wire an absent compose key.
- The CI job is **one target**, and its `.env` rewrite removes host-only entries. `append_if_set` skips blanks but cannot preserve omitted lines after the rewrite.
- Frontend brand strings are **not single-sourced**. `brand.ts` alone does not change `index.html`, locale JSON, installer URLs, tests, or backend HTML. No static frontend sitemap exists.
- Dev `docker-compose.yml` has an nginx container; prod does not. Do not expose backend/frontend binds or paste customer Host WAF snippets onto the app edge.
- Remote-data deployments need the overlay, shell `REMOTE_DATA=1` for manual scripts, app plus worker CIDRs on data-host firewall/`pg_hba`, and only one beat.
- Guard agent IDs cannot be lifted between Managers. Wipe the **lab** agent before enroll/unenroll per guide §4.1; never wipe a live customer agent.
- Do not put host addresses, SSH details, certificates, senders, or credentials into this public runbook, issue comments, or tracked examples.

---

## 13) Related references

| Detail | Source |
|--------|--------|
| Routine script flags, SPA-only path, CI migration | [`deploy.md`](deploy.md), [`scripts/deploy-services.sh`](../scripts/deploy-services.sh), [`scripts/deploy-frontend.sh`](../scripts/deploy-frontend.sh) |
| Host roles, firewall, Cloudflare/TLS edge | [`multi-host-ops.md`](multi-host-ops.md) |
| Capacity and provider cutover | [`compose-host-sizing.md`](compose-host-sizing.md) §5 |
| Guard wipe-first and public/private boundary | [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) §4.1 / §8 |
| Production service and reverse proxy contracts | [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`nginx/sinexis.app.conf`](../nginx/sinexis.app.conf) |
| CI secret writer and deploy trigger | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
