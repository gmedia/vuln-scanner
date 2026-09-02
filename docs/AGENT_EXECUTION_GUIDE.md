# Sinexis / VulnScanner — Agent Execution Guide

**Purpose:** Survive OpenCode / Sisyphus **session reset**. Read this **before** coding after a new session.

**Last updated:** 2026-09-02 (README + AM copy: Host WAF protect Multi; lab vhost ≠ tc5)
**Repo tip at write time:** re-`git pull` after reset. Expect **`f53c407`** or newer. **P12 Host Protect S0–S12 on `main`**: honesty **#556**, quarantine queue **#558**, helper systemd jail **#559**. **Do not** re-implement S1–S12. Missing on-box root: code status **`pending_agent`** (queued, 0 hits) until helper ingest, or **`failed`/`unreachable_root`** if abandoned — **never** mock hits on public origin (**#533**). **P13 Host WAF S0–S5**. Compose: `HOST_PROTECT_ENABLED` / `HOST_WAF_ENABLED` prod **true**, local/CI **false**; **`HOST_PROTECT_ALLOW_LOCAL_WALK` default false** (P14 **B**). per-site WAF still **off**. `SIEM_ENABLED` **git prod compose default false** (ops secret may enable). Never paste WAF onto `sinexis.app` edge nginx. Residual human: **GTM**; Host Protect **invoice** (`service_id`); fill `/admin/hpp` `hostscan`. Working list IDR in `docs/commercial/sku-host-protect.md` (**not** finance lock). **P14** = owner track: **Imunify360 jobs** (on-box files + HTTP), original stack — [`imunify-class-onbox.md`](specs/imunify-class-onbox.md). **Not** a clone. **A–F** on this stream: **F** WAF protect = Host Multi SKU + customer nginx snippet (`SecRuleEngine On`); **never** Sinexis edge. **G/H** only with `buat`. Clone PRs forbidden: [`imunify-beside-not-roadmap.md`](commercial/imunify-beside-not-roadmap.md).
**Guard e2e rule:** if the user asks for a **full prod e2e suite including Guard enroll/unenroll**, **wipe `tc5` + leftover Manager/DB smoke rows first** — see **§4.1**. Do not skip this. Do not treat Playwright as enroll/unenroll.
**Language with user:** **Bahasa Indonesia** (preferensi sesi). Code/commits/PR bodies: English OK (repo convention).
**Phase snapshot:** **P0 policy locked** · **P1 attach shipped** · **P2 Workspace S1–S5** · **P3 assets S1–S5** · **P4 soft dual-brand** · **P5 Guard thin** (mock CI; live `sx-erpstg` online — do not wipe) · **P6 hospitality S1–S3** · **P7 SIEM S0–S5** (`SIEM_ENABLED` compose default **false**; `SIEM_INCLUDE_FULL_LOG` false) · **P8 Uptime S1–S5 + v2** · **P10 blog shipped** · **P11 status page** · **P12 Host Protect S0–S12 on `main`** (#533–#537, #556, **#558**, **#559**; prod `HOST_PROTECT_ENABLED` true) · **P13 Host WAF S0–S5** (prod compose API **true**; per-site mode off; no edge Coraza) · **P14** A–F (WAF protect this stream); **G/H** only if named + `buat` · **i18n S1–S7** · **theme S1–S3** · **GTM human still open** · residual eng = bugs, Dependabot only when named + CI green — **do not** implement SIEM under Guard PRs. Do **not** re-implement Host Protect S1–S12.

---

## 0) Session boot (do this first)

```bash
# MANDATORY (also in AGENTS.md)
gh pr list --state open --assignee @me

GIT_MASTER=1 git fetch origin
GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull origin main
GIT_MASTER=1 git rev-parse --short HEAD   # expect ≥ ff82389 or newer (re-pull)
```

Then read, in order:

1. This file — `docs/AGENT_EXECUTION_GUIDE.md` (**wins on product priority / epic order**)
2. `AGENTS.md` — branch/PR/CI workflow
3. [`docs/AGENT_PAGE_REGISTRY.md`](AGENT_PAGE_REGISTRY.md) — **all user-facing URLs** (SPA + HTML islands); recapture / e2e map
4. Root `handoff.md` — **session snapshot + GTM checklist** (not a second roadmap; re-check this guide for *epic order*)
5. `docs/dependency-pins.md` + `SECURITY.md` (accepted residual risks)
6. Only if the user names an active **stuck-job / worker** incident: `docs/archive/handoff-scan-pending-2026.md` (historical — **re-verify**)

**Priority rule:** If `handoff.md`, the archive, or any old session note **disagrees with this guide** on *what to build next*, **this guide wins**, unless the user explicitly scopes a stuck-job/ops incident.

**Do not implement** until the user uses an explicit verb (`implement` / `buat` / `kerjakan` / `fix` / …) **or** points at an approved spec section.

---

## 1) Product north star (agreed)

| Item | Decision |
|------|----------|
| **Direction** | Pivot from single-user vuln-scan SaaS → **security attach platform** (hospitality beachhead + **upsell on existing GMD infra**) |
| **Brand** | **Sinexis** (domains owned: `sinexis.app`, `sinexis.tech`) |
| **Legacy name** | VulnScanner / `vs.appmedia.id` — keep as **Scan module** during soft dual-brand |
| **Near-term commercial goal** | **Upsell** recurring Secure/Scan add-on on customers who **already** pay colo / VPS / cloud / hosting |
| **Strategic beachhead** | Hotel / hospitality (Yogya relationships + any multi-property group already on GMD) |
| **Modules** | **Scan + Attach** · **Workspace S1–S5** · **Assets P3 S1–S5** · **Guard** thin (CI mock; live lab human) · **SIEM P7 S0–S5** (`SIEM_ENABLED` default false) |
| **Build order (upsell-first)** | See **§1.3** — P2 **S1–S5** shipped; **P5 thin code on main** (mock CI; live host env human); GTM still parallel; rebrand must not gate attach; **P7 SIEM** = spek first, **never** as a Guard feature PR |
| **Not v1** | Nested multi-project, org billing dual-wallet, Windows depth, SOAR, customer Wazuh dashboard, hard brand cut blocking attach. SIEM stays **flag-off** on prod until explicit ops. |

### Positioning (one line)

> **Sinexis** — security control for teams that already run servers with GMD: find exposure, schedule checks, share results, then (later) runtime alerts — starting with hospitality as the story, **colo/VPS as the attach base**.

### Default decisions (use if user has not overridden)

1. **Org ≈ one hotel *or* one company**; nested **Project deferred** (1 org = 1 workspace in v1).
2. **Credits stay personal** in Workspace v1; org wallet = later.
3. **Guard data:** alert + agent inventory in cloud first; not full raw-log product UI.
4. **Hybrid:** product + light **managed** review for pilots (Yogya and/or design-partner multi-asset accounts).
5. **Soft dual-brand** 6–12 months (`sinexis.app` primary, `vs.appmedia.id` redirect later) — **must not gate** Scan add-on upsell.
6. **Wazuh never in the same epic as Workspace** (and not before a sellable Scan attach loop exists).
7. **Do not commit raw finance/customer CSVs** into the repo (PII / billing).

### 1.1 Evidence from GMD finance extracts (2026-08-07)

**Sources:** offline finance invoice extracts provided by ops for analysis only — **never commit raw CSVs or customer PII** into this public repo.

**Aggregates (enriched file, ~530 lines, ~2025-08 → 2026-08):**

| Signal | Finding | Product implication |
|--------|---------|---------------------|
| Revenue mix | Dominated by **colocation/rack** + **cloud/VPS**; security lines thin (Imunify / SpamExpert / “firewall” style) | Upsell = **add-on on infra**, not replace colo |
| Categories | **CORPORATE** largest named book; **HOTEL = 1 customer** in extract; Kafe = 1 small cloud; schools/gov present | Near-term attach list = **CORPORATE colo/VPS**; hospitality = beachhead + 1 multi-asset design partner, not mass billing logos |
| Multi-service | Few customers with **≥3 `service_id`**; hotel group highest service count in sample | Workspace + **asset registry** matter for **large** accounts; most accounts start 1–2 targets |
| Concentration | Top customers take large share of 2026+ revenue | Sinexis is **module beside** MRR infra; success ≠ replacing rack revenue |
| Yogya hotels in billing | Almost **absent** as hotel category mass | GTM A (Yogya hotels) = **relationship / new logo**; GTM B (existing SID) = **upsell** |

**Design-partner pattern (no PII in git):** multi-service **HOTEL** account with VPS + domains + colo + paid firewall line → ideal for Workspace + multi-asset Scan + later Guard. Do not paste customer_id / domain lists into commits.

### 1.2 Dual GTM (both valid; different motions)

| Wedge | Motion | Fit to CSV | Primary features |
|-------|--------|------------|------------------|
| **B — Upsell existing** | Sell recurring Scan/Secure add-on on colo, VPS, cloud already invoiced | **Strong** | SKU, schedule, baseline diff, executive report, light assets |
| **A — Hospitality beachhead** | Yogya (and similar) hotels via owner relationships; multi-property groups | **Weak in current billing; strong strategically** | Workspace, multi-asset, managed hybrid, later Guard |

**Near-term KPI bias:** prefer features that make **wedge B** billable; use **wedge A** for narrative, pilots, and Workspace UX stress tests.

### 1.3 Feature development priority (upsell-first)

Ship in this order unless the user **explicitly** reorders. “Hybrid” = sales/runbook may start before full UI.

| P | Epic | Goal for upsell | In scope | Out of scope | **Status (2026-08-10)** |
|---|------|-----------------|----------|--------------|-------------------------|
| **P0** | **Commercial lock** (user-led + docs) | Something sales can quote | One-pager; **SKU** tiers/prices; SID *patterns*; AM email kit; defaults §1 | Guard coding; finance CSV in repo | **Policy locked in git** (#245–#246). **GTM still open:** finance `service_id`, 10 CRM SIDs, named pilot, AM send, ops fulfill |
| **P1** | **Scan Attach Loop** | Recurring reason to pay monthly | **Scheduled** domain/IP; new critical/high notify; **baseline diff**; **executive HTML**; credits on schedule; cap 10 | Org rewrite; Wazuh; full rebrand | **Shipped on `main` + production smoke closed** (S1–S5, edge DoD). **Wave B UX** (#271): Dashboard Jadwal CTAs, ScanDetail export labels, baseline empty copy — on tip `98756de` |
| **P2** | **Workspace v1** | B2B multi-user | orgs, memberships, invites, org-scoped scans, personal credits, backfill; JWT `org_id`; WS membership AuthZ; **S5** schedule cap per-org | Nested projects; org wallet; Wazuh; per-org ApiKey | **S1–S5 shipped** (#267 S1–S4 → then #270 S5 @ `6b600fb`; tip with Wave B `98756de`). Cap **10 enabled / org** (`MAX_SCHEDULES_PER_ORG`). Spek D1–D6; edge Alembic **`add_workspace_orgs`**. **Residual:** multi-member S5 + login/UI multi-org smoke (manual) |
| **P3** | **Asset registry (light)** | Multi-target tiers | Named assets; scan pack; SKU hard caps | Full CMDB; IoT; PMS | **S1–S5 on `main`** (#380 + pack/docs follow-up) — [`docs/specs/assets-v1.md`](specs/assets-v1.md). Hard cap Basic 1 / Pro 3 / Multi 10. SPA `/assets`. Residual: **edge Alembic + UI smoke** (human) |
| **P4** | **Soft dual-brand** | Name trust | Sinexis strings, landing, SKU label | Hard cut / domain cutover blocking attach | **Shipped soft dual-brand on `main`** (#250); public host remains **`vs.appmedia.id`** (no hard cut) |
| **P5** | **Guard MVP** (Wazuh thin) | Second upsell | Agent inventory, critical alerts, per-org enroll; spek [`guard-v1.md`](specs/guard-v1.md) | Full SIEM, SOAR, raw-log UI, per-tenant managers | **S0–S5 + Http on `main`** (#273–#275). E2E A+B **#299**. Host/guide: **#279** enroll, **#281** generic install, **#294** TOC. Mock default **CI** (`GUARD_MOCK_WAZUH=true`). **Live lab:** Manager+Indexer on **Guard host (`tc3`)**; app (`tc1`) `.env` `GUARD_MOCK_WAZUH=false` + `WAZUH_*` (compose must inject — do not assume `.env` auto-flows); agent VM **`tc5`**. **Do not** add Discover/cases on `/guard` |
| **P6** | **Hospitality / pilot pack** | Beachhead A | Hotel runbooks, hybrid SLA | Logos-only builds | **S1–S3 on `main`**: Workspace checklist, pack HTML, AM one-pager [`hospitality-am-one-pager.md`](commercial/hospitality-am-one-pager.md) |
| **P7** | **SIEM v1** (search + cases) | Analyst surface after Guard | Org-scoped Indexer search (structured), Postgres cases; spek [`siem-v1.md`](specs/siem-v1.md) | SOAR, customer Wazuh UI, raw DSL, Pattern B managers, merge into `scan_findings` | **S0–S5 on `main`** (#307). Host flag: GitHub secret `SIEM_ENABLED` **and** compose/CI `.env` inject (default `false`) |
| **P8** | **Uptime v1** (external probe) | Cheap attach “is the site up?” | HTTP+TCP, SKU seats, email down/up, SPA `/uptime`; spek [`uptime-v1.md`](specs/uptime-v1.md) | Status page, multi-region, webhooks, merge into Guard/SIEM/scan | **S1–S5 + gaps + retention on `main`** (#397–#401). **v2 check types** (#451). **Advanced settings S0 draft** [`uptime-advanced-settings.md`](specs/uptime-advanced-settings.md) — docs only; do not implement until named. Flag `UPTIME_ENABLED` default true. Residual: **human UI/SMTP smoke**. |
| **P8-i18n** | **i18n id/en** | Dual language SPA | Catalogs, switcher, executive/notify locale, `users.locale` | Extra locales, CVE translation, legal pages | **S1–S7 on `main`** (#367–#373). Spek [`i18n-v1.md`](specs/i18n-v1.md) — **not** a second P8; do not re-implement. |
| **P9** | **Theme light/dark** | Operator appearance | Tokens + switcher; default dark | Per-org theme, Wave G layout | **S1–S3 on `main`** (#375–#378). Spek [`theme-v1.md`](specs/theme-v1.md). |
| **P10** | **Public blog** (GTM content) | Trust / inbound copy without a deploy per post | Public `/blog`; platform-admin CMS; Markdown; SEO HTML island + path-only index | Comments, Next.js, org CMS, images, legal pages, Guard merge | Spek [`blog-v1.md`](specs/blog-v1.md). Q1–Q6 locked. **S1–S5 in PR #409.** |
| **P12** | **Host Protect** (on-box web malware) | Attach for VPS/colo that want Imunify-**jobs** **without** cloning Imunify | Named web paths on Guard agent; YARA/Clam; hits; opt-in quarantine **queue** (`host_commands`); SPA `/host`; spek [`host-protect-v1.md`](specs/host-protect-v1.md) | PHP PD, KernelCare, **WAF (P13/P14-F)**, cPanel plugin, shared-UID farm, Imunify IP, dual enroll daemon | **S0–S12 on `main`**. Honesty **#556**. S11 queue **#558**. S12 Clam + systemd jail **#559**. Helper: `packaging/host-protect-helper/`. Lab **tc5**, never ERP. SKU = **working list IDR** (not invoice lock). **Do not** re-implement S1–S12. Next product depth = **P14** slices. |
| **P13** | **Host WAF** (on-box HTTP filter) | HTTP detect/block **on customer VPS** | Policy per `host_sites`; mock S1–S3; Coraza/nginx **on customer VPS** S4+; spek [`host-waf-v1.md`](specs/host-waf-v1.md) | Coraza on **Sinexis** edge; Imunify rules; PHP PD; ERP lab | **S0–S5 on `main`** (#512–#517). `HOST_WAF_ENABLED`: **prod compose true**, local/CI **false**; per-site mode **off**. **P14 F** protect = Host Multi + customer snippet. Never WAF on `sinexis.app` nginx. Lab: [`host-waf-lab-smoke.sh`](../scripts/host-waf-lab-smoke.sh) — **`--apply-vhost` refuses `tc5`/ERP**; live 403 needs disposable vhost + `GUARD_LAB_*`. |
| **P14** | **Imunify-class on-box** | Owner lock: take **regional** Imunify-shaped budget (VPS/colo **without** ripping Imunify on cPanel farms) | Helper-first scan; worker never impersonates customer FS; isolate on VM; WAF on **customer** nginx; spek [`imunify-class-onbox.md`](specs/imunify-class-onbox.md) | Clone / “Imunify parity” PRs; trademarks; PHP PD/KernelCare v1; SaaS SSH; edge WAF | **Docs + P12 S11/S12 landed.** Slices **A–H**. Implement **only** named slice + `buat`. Default next: **B** (fail-closed worker) → **C** (AM install path) → lab tc5. **G/H** research until named. Legal: [`imunify-beside-not-roadmap.md`](commercial/imunify-beside-not-roadmap.md). |

**Priority rule for agents (post–#295 tip `8546ef3`):**

1. **Human default** remains **GTM execution** (finance / AM / ops) + **edge apply this tip** (Alembic `drop_placeholder_admin`, SPA `/guide`, leftover ip/domain workers, AAB worker) + **Guard live lab** — parallel to eng.
2. **Further Guard code** only on **explicit** implement verb; stay inside **thin DoD** (D1–D10 / non-goals). Prefer bugfixes from live smoke over new surfaces.
3. **P7 SIEM** only after user **implement** + isolation questions; never as “improve /guard”.
4. Other code: **bugfix** (attach/workspace/assets/Guard/org cache), docs/ops hygiene, Dependabot **only if CI green + user names the PR** (do not mass-merge). **Do not** re-implement P3 S1–S5.
5. Ordering still true: P1/P2 before Guard; P4 must not block attach revenue. P7 does **not** jump ahead of GTM/P3 unless user reorders.
6. **Do not** re-implement P2 S1–S5, Wave B, Guard S1–S5/Http, guide TOC, or placeholder-seed cleanup “because docs were stale.” **Do not** ship SIEM-scope PRs under “Guard.”

### 1.4 What *not* to prioritize for upsell

- Rebrand-only or domain cutover as the main “feature”
- Windows depth / nested multi-project / org dual-wallet / SOAR / customer Wazuh dashboard (SIEM product search is **P7**, already S0–S5; flag-off until ops)
- Mobile APK/IPA as the **hero** attach SKU (engine stays; GMD base is server/domain)
- Treating Yogya hotel **acquisition** count as the only success metric while colo/VPS attach is ignored
- Global `ApiKey` as multi-tenant identity without redesign (blocks safe automation later)

---

## 2) What the codebase is today (facts)

**Stack:** SPA React/Vite + FastAPI + PostgreSQL + Redis + Celery (queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter` + schedule due tick) + **celery_beat** + host nginx prod.

**Live lab host roles** (SSH aliases only — **no IPs in git**): `tc1` app (backend/frontend/mobile/beat/DL); `tc2` Postgres+Redis; `tc3` Wazuh Manager+Indexer; `tc4` ip+domain workers; `tc5` Guard agent lab. Coding host ≠ edge. Detail: [`docs/multi-host-ops.md`](multi-host-ops.md).

**Domain model (Workspace S1–S5 on main):**

| Entity | Scope | Notes |
|--------|--------|------|
| `User` | Global | `is_admin` = **platform**; **personal** `credits` (no org wallet in v1) |
| `Organization` / membership / invite | multi-user workspace | roles `owner` \| `admin` \| `member` \| `viewer`; personal org backfill on existing users + register |
| `ScanJob` | `user_id` + **`organization_id`** | Types: `ip` \| `domain` \| `apk` \| `ipa`; list/detail AuthZ via org membership |
| `ScanFinding` | via job | Vuln taxonomy; baseline **diff** across runs for attach |
| `CreditLog` / **`pricing`** table | user / global | `credit_cost` per `scan_type` (edge smoke: domain **2**, IP **1** — re-confirm live) |
| **`scan_schedules`** (P1 + org FK) | `user_id` + **`organization_id`** | Cap **max 10 enabled / org** (**S5**); null-org legacy still per-user; debit **schedule owner** credits on due |
| `ApiKey` | **Global** M2M | **No** user/org FK — unfit for per-tenant agents as-is |

**AuthZ:** JWT (claim **`org_id`**, must match membership) + optional `X-API-Key`. Scan/schedule visibility = org membership + role (not only `user_id == me`). WebSocket job progress requires membership on job’s org. Admin = **platform** superuser, not org/hotel admin.

**Shipped for attach (P1) — reuse, don’t rewrite:** schedule API + beat `schedules.run_due`, baseline diff, new critical/high notify, executive HTML, credit gate, ops notes `docs/scan-schedules-ops.md`. **Wave B** SPA: Dashboard schedule CTAs; ScanDetail HTML teknis / Laporan eksekutif labels.

**Shipped for workspace (P2 S1–S5):** org tables + backfill migration `add_workspace_orgs`; org API; JWT switch; SPA OrgSwitcher + Workspace Settings; worker schedule rows include `organization_id`; **S5** `MAX_SCHEDULES_PER_ORG` on create/re-enable.

**Still absent (later epics / not coded yet):** nested Project, org wallet, per-org ApiKey, in-app subscription table, hard Sinexis domain cutover. **P3 assets** and **Guard thin** are on `main`; live Guard lab residual is human.

**Commercial kit (docs, not in-app catalog):** `docs/commercial/sinexis-one-pager.md`, `sku-scan-secure-addon.md` (P0 lock), `am-wave1-email-id.md`.

**Key paths:**

- Models / schedules: `backend/app/models/` (incl. `organization.py`), `backend/app/services/schedule.py`, `backend/app/schemas/schedule.py`
- Org workspace: `backend/app/services/organization.py`, `backend/app/api/org_routes.py`, `backend/alembic/versions/add_workspace_orgs.py`
- Auth (JWT `org_id`): `backend/app/services/auth.py`
- Scan / WS AuthZ: `backend/app/api/scan_routes.py`, `backend/app/api/websocket.py`
- Routes: `backend/app/api/router.py`
- Workers / beat: `workers/`, especially `workers/tasks/schedules.py`
- SPA workspace: `frontend/src/api/orgs.ts`, `components/workspace/OrgSwitcher.tsx`, `pages/WorkspaceSettings.tsx`
- SPA brand: `frontend/src/components/layout/Sidebar.tsx`, `Landing.tsx`, `index.html`
- Prod edge: `nginx/vs.appmedia.id.conf`, public URL `https://vs.appmedia.id`
- Deploy: prefer `scripts/deploy-services.sh` (non-destructive); include **celery_beat**

---

## 3) Roadmap phases (execution contract)

Aligned to **§1.3**. Phase letters are stable for chat (“kerjakan P1”); do not invent parallel conflicting orders.

### Phase A / P0 — Decide & lock (user-led + commercial docs)

**In repo (policy locked 2026-08-08, user-approved defaults):**

| Deliverable | Path |
|-------------|------|
| One-pager | [`docs/commercial/sinexis-one-pager.md`](commercial/sinexis-one-pager.md) |
| SKU + decision log | [`docs/commercial/sku-scan-secure-addon.md`](commercial/sku-scan-secure-addon.md) |
| AM wave-1 email (Bahasa) | [`docs/commercial/am-wave1-email-id.md`](commercial/am-wave1-email-id.md) |

**Working list (see SKU §0):** Basic **300k** / Pro **650k** / Multi **2M** IDR/mo; credits **10/24/60**; AM owns renew; hybrid email; attach ARPU primary; pilot #1 multi-service, 1 mo sponsored; Guard parked; report Bahasa.

**Still human/GTM (not “re-litigate policy” in git):**

- [ ] Finance: three **service_id** rows (no silent VPS bundle)
- [ ] AM: **10 wave-1 SIDs** in private CRM only
- [ ] Named **pilot #1** privately; ops fulfill credits + schedules
- [ ] AM **sends** wave-1 using email template; log CRM
- [ ] Confirm live `pricing` domain/IP before each quote wave

**Agent:** maintain commercial docs on request; **do not** invent new list prices without user. Guard/Wazuh **feature** branches only after S0 spek on `main` (or same series) **and** explicit implement; keep thin scope.

### Phase B — Specs before code

| Spec | Status | Before implementing |
|------|--------|---------------------|
| [`docs/specs/scan-attach-v1.md`](specs/scan-attach-v1.md) | **Implemented** (S1–S5 on main; keep as historical acceptance) | N/A for new attach features unless extending |
| [`docs/specs/workspace-v1.md`](specs/workspace-v1.md) | **Approved** D1–D6; **S1–S5 implemented** on main (#267 + #270) | Residual smoke / bugs only with explicit verb |
| [`docs/specs/assets-v1.md`](specs/assets-v1.md) | **S1–S5 implemented** (#380) | Residual smoke / bugs only |
| [`docs/specs/guard-v1.md`](specs/guard-v1.md) | **S0–S5 + Http on `main`** (#273–#275); host/guide #279–#281 + #294 | Edge lab + secrets on deploy host only; no SIEM on `/guard` |
| [`docs/specs/siem-v1.md`](specs/siem-v1.md) | **S0–S5 on `main`** (#307) | Flag-off until ops |
| [`docs/specs/blog-v1.md`](specs/blog-v1.md) | **S0 + S1–S5** (PR #409) | Public `/blog` HTML island; admin CMS |
| [`docs/specs/host-protect-v1.md`](specs/host-protect-v1.md) | **S0–S12 on `main`** (#533–#537, #556, #558, #559) | Do **not** re-implement. Lab [`scripts/host-protect-lab-smoke.sh`](../scripts/host-protect-lab-smoke.sh) (`--require-helper-heartbeat`). AM install: [`host-protect-helper-am.md`](host-protect-helper-am.md). Fail-closed: `pending_agent` / `unreachable_root`, not mock hits. SKU working IDR. |
| [`docs/specs/host-waf-v1.md`](specs/host-waf-v1.md) | **S0–S5 + P14 F protect** | P13; prod compose `HOST_WAF_ENABLED` **true**, local/CI **false**; lab [`scripts/host-waf-lab-smoke.sh`](../scripts/host-waf-lab-smoke.sh) API smoke; `--apply-vhost` **refuses tc5**; never ERP/edge nginx |
| [`docs/specs/imunify-class-onbox.md`](specs/imunify-class-onbox.md) | **P14 docs** (#555); slices A–H | Implement **only** named slice + `buat`. Jobs not clone. |

**Agent:** wait for **explicit implement** even when spec exists. Prefer **draft spec** over silent coding for new epics; P3 assets already shipped.

### Phase C1 / P1 — Scan Attach Loop (upsell engine) — **DONE**

**Shipped:** schedule entity + beat due tick; baseline diff; new critical/high notify; executive HTML; credit debit + auto-disable; cap 10; ops docs; **production smoke A** (due+credits, zero-credit gate). Detail: root `handoff.md`, `docs/scan-schedules-ops.md`.

**Residual engineering:** bugfixes only; optional edge tip pull for docs-only SHAs; no second “implement P1” epic.

**Do not** require multi-user Workspace for single-user attach (still true). Schedule **cap is per org** after **S5** (#270).

### Phase C2 / P2 — Workspace v1 — **S1–S5 DONE** (2026-08-10)

**Shipped on `main`:** #267 S1–S4; **#270 S5** (`6b600fb`); tip with Wave B **`98756de`** (#271). CI deploy success (incl. run after #271); Alembic **`add_workspace_orgs`**.

**In scope delivered:** personal org backfill; multi-org + JWT `org_id`; invites; org-scoped scan AuthZ; WS membership check; SPA switcher + settings; credits remain personal; **S5** enabled-schedule cap **per org** (10); **no** Guard.

**Residual (manual, not a code epic):**

- Multi-member **S5** cap smoke on edge (2 members share pool of 10)
- **login/UI** multi-org / OrgSwitcher smoke
- Per-org ApiKey, org wallet, nested projects — still out of product scope

**DoD (product):** two users in same org see shared scans per role; owner invites member; viewer read-only; schedule cap shared per org; **no Wazuh**. Close residual smoke when ops confirms UI.

**Agent:** do **not** re-open full P2 implementation unless user asks for bugs / residual.

### Phase C3 / P3 — Asset registry (light) — **S1–S5 DONE** (#380)

- Org-scoped `scan_assets`; SPA `/assets`; SKU **hard cap** Basic 1 / Pro 3 / Multi 10
- 1:1 `scan_schedules.asset_id`; `POST /api/assets/{id}/schedules`; `GET /api/assets/pack`
- **Residual (human):** edge Alembic `add_scan_assets` + `/assets` smoke — [`docs/scan-assets-ops.md`](scan-assets-ops.md)
- **Out:** full CMDB, Guard merge, SIEM

### Phase D / P4 — Soft rebrand — **soft dual-brand DONE** (#250)

- Shell strings / titles / landing → **Sinexis** primary, VulnScanner as engine whisper
- Public edge host still **`vs.appmedia.id`** (no hard domain cut)
- DNS/TLS `sinexis.app` cutover = **later**, must not block GTM
- Label attach offer **Sinexis Scan** (or agreed SKU name)

### Phase E / P5 — Guard MVP (Wazuh thin) — **code DONE on main**; lab live pending

- **Risk accept (2026-08-10):** user chose thin Guard eng **in parallel** with open GTM; Workspace S1–S5 + attach already on `main`
- **Shipped:** #273 spek · #274 thin (models, mock, API, workers, FE `/guard`) · **#275** `HttpWazuhClient` · **#294** User Guide TOC + collapsed distro commands
- **Runtime:** CI/default **`GUARD_MOCK_WAZUH=true`**. Live: deploy-host env only (`WAZUH_*`, mock false when lab ready) — **never** secrets in public markdown
- Wazuh as **sensor bus**: **one lab manager**, group-per-org, SaaS-proxied enroll, poll inventory + critical alerts (level ≥ 12)
- Thin UI: agents, last-seen, critical alert cards — **no** raw logs / Discover
- Per-org enroll tokens (**not** global `ApiKey`); `/api/guard/enroll` is middleware-public (token-gated)
- **Standing permission (user 2026-08-26, also in `AGENTS.md`):** agents **may run** live enroll/unenroll on lab agent `tc5` **without re-asking**. **Always wipe first (§4.1).** Not Playwright. Never print tokens/IPs.
- **Out of scope v1:** full SIEM, SOAR, per-tenant managers, customer Wazuh dashboard, webhooks
- **Agent:** refuse SIEM scope creep; no new Guard epic without explicit verb. **Never** run host enroll against a `tc5` that still has a leftover `client.keys` identity.

### Phase F / P6 — Hospitality / pilot pack — **S1–S3 DONE**

- Spec: [`docs/specs/hospitality-pilot-pack-v1.md`](specs/hospitality-pilot-pack-v1.md)
- **S1:** copy-only checklist on `/settings/workspace` (`pilot-checklist`); links to assets / schedules / credit-history
- **S2:** `GET /api/assets/pack?format=html` + SPA `assets-pack-html`
- **S3:** AM one-pager [`docs/commercial/hospitality-am-one-pager.md`](commercial/hospitality-am-one-pager.md) (print to PDF; no binary in git)
- Hybrid SLA stays 5 business days, not SOC; no Guard/SIEM in the card
- Still no full property/IoT platform

### Later / backlog (not pre-feature blockers)

- React Router residual GHSA (SPA `BrowserRouter` only) — see `SECURITY.md`
- `redis-py==6.4.0` vs Redis 8 — see `docs/dependency-pins.md`
- TypeScript 7 when `typescript-eslint` allows
- Company Prometheus external access
- Real AAB convert fixture
- Inbox “Delivered” user-side

---

## 4) Engineering rules (non-negotiable)

### Git / GitHub (`AGENTS.md`)

- **Never** commit on `main`; branch `feat/*` or `fix/*` or `docs/*` from latest `main`
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, …
- Push after commits; open PR; **do not poll CI**
- Squash-merge when CI green (user or agent per session rules)
- Every git command: prefix **`GIT_MASTER=1`** (user/session constraint)
- Do **not** commit: `workers/coverage-report.json`, `.playwright-mcp/`, temp screenshot dirs, **raw customer/finance CSVs**

### Deploy (production)

| Change | Script | Notes |
|--------|--------|------|
| SPA only | `./scripts/deploy-frontend.sh` | Run on the **production deploy host** only (credentials/host via private ops notes — **not** this public repo) |
| App services | `./scripts/deploy-services.sh` | same; **never** volume-wipe postgres/redis for routine deploys |
| Compose project | `docker-compose.prod.yml` + `COMPOSE_PROJECT_NAME=vuln` | |

- Use the designated production host for this product; do **not** document alternate lab/SSH endpoints in public markdown
- Broker smoke: `./scripts/smoke-broker.sh` (optional deploy-path arg on host)
- Health: public product URL `/health`, `/health/queues` (see README)

### Code quality

- Match existing patterns (FastAPI services, Alembic, Vitest/pytest)
- No `as any` / `@ts-ignore` / empty `except`
- Bugfix = minimal diff; no drive-by refactors
- Platform `is_admin` must **never** be reused as “hotel owner” / “org owner”

### Product safety

- Do **not** force-fit Wazuh events into `scan_findings` long-term
- Do **not** `npm audit fix --force` on react-router (downgrade trap)
- Do **not** bump `redis` package past kombu `<6.5` without docs update
- Do **not** block upsell attach work on perfect brand cutover

### 4.1 Full prod e2e + Guard enroll/unenroll (MANDATORY)

Trigger phrases (do **not** forget after reset):

- “full suite e2e test prod termasuk enroll/unenroll guard”
- “jalankan e2e termasuk enroll/unenroll”
- “test enroll dan unenroll guard”

**Two different suites — do not collapse them:**

| Suite | What it is | What it is not |
|-------|------------|----------------|
| Playwright / frontend e2e | Browser against public origin (login, scan UI, Guard **pages**) | Host key import, Manager DELETE, `tc5` apply |
| Guard lab cycle | `scripts/guard-lab-enroll-smoke.sh` + Manager API + SSH `tc5` | Playwright. There is **no** product unenroll API |

**Always wipe `tc5` first.** A leftover local identity (historically `003` / hostname `VM-0-4-ubuntu`) makes `manage_agents -i` fail or auto-enroll a **new** Manager id while the product redeem id stays `never_connected`.

Wipe order (aliases only — **no IPs** in commands committed here):

1. **`tc5`:** `systemctl stop wazuh-agent`; empty `/var/ossec/etc/client.keys`; remove leftover `/var/ossec/queue/rids/<id>` except `sender_counter`. Confirm `manage_agents -l` → no agent.
2. **Manager (from app host `tc1` only — `:55000` is not reachable from the bastion):** `DELETE /agents?agents_list=<id>&status=all&older_than=0s` for **smoke** ids. **Never delete `000`** (manager). After a wipe, old lab ids such as `003` are **not** sacred if the user asked to unbind `tc5` for enroll.
3. **App DB `guard_agents`:** product `POST /api/guard/sync` **does not delete** rows. Remove leftover smoke ids (`001`/`004`/`005`/`007`/names `e2e-tc5-%`, `smoke-agent-%`, `lab-tc5`) via backend SQL on the app container. Confirm `GET /api/guard/agents` is empty (or only non-lab rows).
4. **Disable auto-enrollment** on `tc5` (`<enrollment><enabled>no</enabled>`) or the host will register itself as `VM-0-4-ubuntu` and steal a new id (`006`/`008` …).
5. **Then** redeem + apply. API key from `POST /api/guard/enroll` is the **import string** for `manage_agents -i <key>` with confirm `y`. Piping to `-i /dev/stdin` is **unreliable**.
6. **Unenroll:** Manager DELETE from **`tc1`**, then wipe `tc5` keys again, then **delete the app DB row**. `--unenroll` from the bastion times out.

Protected default in the smoke script is still `000,003`. After an explicit wipe of `tc5`, override with `GUARD_LAB_PROTECTED_AGENT_IDS=000` so a reused `003` slot is not treated as sacred.

Public origin (`sinexis.app`) still needs `GUARD_LAB_ALLOW_PUBLIC_PROD=1`. Never print tokens, keys, or host IPs.

Detail: [`docs/multi-host-ops.md`](multi-host-ops.md) § Guard lab.

---

## 5) Acceptance criteria (drafts)

### 5.1 Scan Attach Loop (P1) — **met on production (2026-08-08)**

- [x] User can define recurring domain and/or IP scan (weekly/monthly)
- [x] Jobs enqueue via worker/beat; failures / credit issues visible (`last_error`)
- [x] Diff / notify path for **new** high/critical vs prior run
- [x] Management-oriented **executive HTML**
- [x] Credits charged on schedule; insufficient → disable schedule
- [x] Cap **10** enabled schedules (now **per org** via Workspace S5)
- [x] No Wazuh in this epic
- [ ] Optional later: PDF, in-app subscription

### 5.2 Workspace v1 (P2) — **S1–S5 met in code + migration (2026-08-10)**

- [x] User can create an organization (hotel or company workspace)
- [x] Roles: `owner` \| `admin` \| `member` \| `viewer` enforced on API
- [x] Owner/admin can invite by email; existing user can accept; pending invite for unknown email
- [x] Scans list/detail/export/WebSocket respect **org membership** (not only job creator), per role
- [x] Backfill: every pre-migration user has a personal org; old jobs visible in that org
- [x] Platform admin (`is_admin`) still global; not reused as org role
- [x] Credits remain **personal** (D1)
- [x] Tests: workspace AuthZ + schedule worker org column; migration on edge
- [x] No Wazuh/agent code in this epic
- [x] **S5** enabled-schedule cap **per org** (`MAX_SCHEDULES_PER_ORG = 10`) — #270 on `main`
- [ ] Edge **login/UI** multi-org + multi-member S5 smoke (manual residual)

### 5.3 Assets (P3) — sketch

- [x] **S0** Draft spek [`docs/specs/assets-v1.md`](specs/assets-v1.md) (light registry; not CMDB) — #282
- [ ] Org can CRUD named assets with scan targets (S1+ — after explicit implement)
- [ ] Scheduled pack can include multiple assets within tier limits

### 5.4 Guard MVP (P5 thin) — from [`docs/specs/guard-v1.md`](specs/guard-v1.md)

- [x] **S0** Spek + guide/handoff/README status (risk-accepted thin path)
- [x] Binding + tables + settings; mock Wazuh client (#274)
- [x] Admin enable Guard; enroll token create/revoke (hash at rest)
- [x] Enroll proxy assigns org group; agent appears in inventory (mock OK in CI)
- [x] Viewer lists agents + critical alerts **org-scoped** only (IDOR tests)
- [x] Poll/sync updates timestamps or sanitized error; no raw-log UI
- [x] SPA `/guard` + Sidebar; no secrets/IPs in git
- [x] **HttpWazuhClient** live path + unit tests (#275); factory still mock-by-default
- [x] **Non-goals hold:** no SIEM/Discover/SOAR/per-tenant manager in v1 PRs
- [ ] **Edge residual:** live enroll/unenroll on `tc5` after **wipe-first (§4.1)**; `GUARD_MOCK_WAZUH=false` on app host only

---

## 6) Anti-goals (reject unless user explicitly expands scope)

- Rewriting the whole app “as Sinexis monorepo” in one PR
- Full SIEM / raw-log product under the name “Guard”
- Nested projects + billing + Guard in one branch
- Treating Prometheus app metrics as customer host monitoring
- Using global `ApiKey` as multi-tenant agent identity without redesign
- Waiting on CI in-session instead of moving to next task
- Committing finance extracts or customer PII “for convenience”
- Prioritizing rebrand cosmetics over billable schedule/report work when user goal is **upsell**
- Putting Wazuh manager passwords or lab host addresses in public markdown

---

## 7) How the user will continue after reset

**Typical user messages → agent action:**

| User says | Agent does |
|-----------|------------|
| “lanjut” / “next” without spec | Re-read §1.3 + `handoff.md`; report **GTM open items** + residual P2 smoke / P3–P6; **no** silent feature coding |
| “tulis spek workspace” | Update `docs/specs/workspace-v1.md` only (S1–S5 already shipped) |
| “implement workspace” / “kerjakan fase workspace” | S1–S5 done — clarify **bug / residual** before coding |
| “rebrand” / “sinexis.app” | Soft brand shipped; hard cut / DNS only on explicit ask; don’t invent Guard; don’t block attach GTM |
| “full suite e2e” / “e2e prod termasuk enroll/unenroll” | Playwright **plus** Guard lab cycle. **Wipe `tc5` + Manager smoke + `guard_agents` first (§4.1).** Do not skip. Do not say “no lab VM”. |
| “enroll/unenroll guard” / “eksekusi test enroll” | Same wipe-first rule. Script + Manager via `tc1`. Not Playwright. |
| “wazuh” / “agent monitoring” / “guard” | Point to [`docs/specs/guard-v1.md`](specs/guard-v1.md); **S0 spek** risk-accepted; **code** only on explicit implement — thin DoD only |
| “tulis spek guard” / “update spek wazuh” | Edit `docs/specs/guard-v1.md` (+ guide if priority changes) |
| “implement guard” / “kerjakan wazuh” | S1+ per spek slices; mock CI; no SIEM |
| “deploy” | Prefer CI `deploy` on `main` or scripts on **edge**; verify health; coding host Docker off by default |
| “update handoff / guide” | Docs PR only |
| “tulis spek blog” / “blog” | Point to [`docs/specs/blog-v1.md`](specs/blog-v1.md) |
| “implement blog” / “kerjakan blog” | S1–S5 in PR #409; platform admin only; no Guard merge |
| “tulis spek hostname status” / custom host lifecycle | [`docs/specs/status-hostname-lifecycle.md`](specs/status-hostname-lifecycle.md) — docs only until named + implement verb |

**Locked answers (P0 — do not re-ask every session):** KPI = **attach ARPU primary**; renew = **AM**; billing v1 = **GMD invoice + app credit top-up**; dual-brand = **6–12 mo soft** (soft UI shipped); after P0/P1/P2-S1–S5 + Wave B = **GTM parallel** + **Guard thin** only with spek + explicit implement (risk-accepted 2026-08-10) — still **no** SIEM default.

**Still open (human, off-repo):** concrete 10 SIDs, pilot #1 identity, finance service_id creation, live quote ± on IDR.

---

## 8) Quick reference — public vs private

**This repository is public.** Do **not** put production SSH hosts/ports, personal emails, real passwords, API keys, or customer/finance dumps in `*.md` (or any tracked file).

| Item | Public OK | Private (ops / password manager / env) |
|------|-----------|----------------------------------------|
| GitHub | `gmedia/vuln-scanner`, branch `main` | Deploy SSH user@host, non-default ports |
| Product UI | Public HTTPS hostname for the app | Internal jump hosts, lab IPs |
| E2E / admin logins | Script names only (`scripts/ensure_e2e_user.sh`); defaults via **env** | Email + password values |
| Brand domains | `sinexis.app`, `sinexis.tech` (cutover status) | Registrar/DNS panel access |
| Finance analysis | Aggregates only (no customer_id / paths) | Raw CSV location and contents |
| Guard / Wazuh lab | Env var **names** + spek only (`docs/specs/guard-v1.md`) | Manager/indexer URL, user, password on deploy host |

---

## 9) Related docs

| Doc | Role |
|-----|------|
| `AGENTS.md` | Git/PR session workflow |
| `docs/AGENT_PAGE_REGISTRY.md` | SPA + HTML island URL map for agents |
| `README.md` | Product as-shipped (scan SaaS + modules table; Guard spek pointer) |
| `SECURITY.md` | Accepted residual dependency risks |
| `docs/dependency-pins.md` | Redis/Celery/kombu pin matrix |
| `scripts/smoke-broker.sh` | Broker/API smoke |
| `docs/scan-schedules-ops.md` | Beat, credits gate, smoke A/B, compose project notes |
| `docs/commercial/*` | P0 one-pager, SKU lock, AM email |
| `handoff.md` | Session snapshot + GTM checklist — **epic order** still this guide |
| `docs/archive/handoff-scan-pending-2026.md` | **ARCHIVED** stuck-pending (re-verify) |
| `docs/multi-host-ops.md` | Lab roles + Guard enroll wipe-first |
| `docs/specs/guard-v1.md` | P5 Guard thin spek + status (S0–S5 + Http on main) |
| `docs/specs/blog-v1.md` | P10 public blog (CMS + SEO path) |
| `docs/specs/shadcn-ui-migration.md` | SPA kit; Wave A–F shipped |
| `docs/specs/*` | Attach/workspace/assets/uptime/i18n/theme shipped; blog S1–S5; status page P11; hostname lifecycle **draft** |

---

## 10) Design system (agent law)

**Why:** `/blog` HTML island drifted into a Palatino “briefing” skin while Landing is Inter + BrandMark + shadcn tokens. Admin CMS used a native `<select>`. `AGENTS.md` had **no** design rule — that is now explicit.

| Surface | Must |
|---------|------|
| **Landing `/`** | Source of truth for **public** chrome: `BrandMark`, `h-12` `border-b`, `max-w-6xl` / `2xl:max-w-[90rem]`, `Button`, theme/i18n, footer `BRAND.footerLine` + `/blog` + login/register |
| **HTML islands** (`GET /blog`, `/blog/{slug}`) | Same **tokens + chrome geometry**. FastAPI string is OK for SEO; **not** a second brand. Header: wordmark `SINE`+`XIS` (primary accent) + home/blog/sign-in/get-started. Body: `font-sans` stack matching `--font-sans` (Inter, ui-sans-serif). Background `--background` `hsl(0 0% 98%)`, text `--foreground`, links/CTAs `--primary` `hsl(142 71% 45%)`. One `h1` including empty index. |
| **In-app SPA** | `frontend/src/components/ui/*` only. New forms: `Label` + kit controls. **Forbidden:** native `<select>` (eslint `no-restricted-syntax` in `frontend/eslint.config.js`; use `Select`). Raw `<button>` only for icon toggles and full-width list/card rows — primary actions use `Button`. No placeholder-only fields without `Label`. **Filter bars:** equal `gap-3` grid, `h-10 min-h-10` on Input/Select/DatePicker/DateTimePicker/Apply; DateTimePicker trigger must match DatePicker (`border-border bg-input`). Pattern: Credit History. |
| **Kit files** | Do not one-off restyle `components/ui` for a screenshot. See `docs/specs/shadcn-ui-migration.md`. |

**Not required on the island:** React Router, ThemeSwitcher, LanguageSwitcher (no JS hydrate). Optional later: `blog.json` chrome if SPA wraps the same URLs.

---

## 11) Agent one-liner

> After reset: **boot §0 → §1.3 → Guard live lab is standing-permitted (wipe `tc5` first §4.1; do not re-ask) → live Guard = tc3 Manager + tc1 mock off + tc5 agent → no silent epics → no PII/SSH/IPs in git → Indonesian with user, `GIT_MASTER=1`.**

---

*Ultraworked with Sisyphus — keep this file updated when phase status, CSV evidence, or defaults change.*
