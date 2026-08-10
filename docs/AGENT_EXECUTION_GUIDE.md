# Sinexis / VulnScanner — Agent Execution Guide

**Purpose:** Survive OpenCode / Sisyphus **session reset**. Read this **before** coding after a new session.

**Last updated:** 2026-08-10
**Repo tip at write time:** `main` @ `98756de` (Workspace **S5** #270 + Attach UX Wave B #271; S1–S4 #267; P4 soft #250; P1 attach earlier). Re-`git pull` after reset.
**Language with user:** **Bahasa Indonesia** (preferensi sesi). Code/commits/PR bodies: English OK (repo convention).
**Phase snapshot:** **P0 policy locked** · **P1 attach shipped + edge smoke closed** · **P2 Workspace S1–S5 on `main` + edge CI deploy** · **Attach UX Wave B on `main`** · **P4 soft dual-brand on `main`** · **near-term = GTM (finance/AM/ops) + residual multi-org/S5 smoke** · next **code** default = **none** (bugfix or explicit P3 — **no** Guard by default).

---

## 0) Session boot (do this first)

```bash
# MANDATORY (also in AGENTS.md)
gh pr list --state open --assignee @me

GIT_MASTER=1 git fetch origin
GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull origin main
GIT_MASTER=1 git rev-parse --short HEAD   # expect ≥ 98756de or newer (re-pull)
```

Then read, in order:

1. This file — `docs/AGENT_EXECUTION_GUIDE.md` (**wins on product priority / epic order**)
2. `AGENTS.md` — branch/PR/CI workflow
3. Root `handoff.md` — **session snapshot + GTM checklist** (not a second roadmap; re-check this guide for *epic order*)
4. `docs/dependency-pins.md` + `SECURITY.md` (accepted residual risks)
5. Only if the user names an active **stuck-job / worker** incident: `docs/archive/handoff-scan-pending-2026.md` (historical — **re-verify**)

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
| **Modules** | **Scan + Attach** (prod, Wave B UX polish) · **Workspace S1–S5** (prod; residual multi-org/S5 smoke may still be manual) · **Assets** (P3) · **Guard** (P5, parked) |
| **Build order (upsell-first)** | See **§1.3** — do **not** treat rebrand or Guard as the main plan; **do not** start P5 by default; P2 **S1–S5** shipped — default eng = GTM + bugs |
| **Not v1** | Full SIEM UI, nested multi-project, org billing dual-wallet, Windows depth, SOAR, hard brand cut blocking attach revenue |

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
| **P3** | **Asset registry (light)** | Multi-target tiers | Named assets; scan pack; tier limits | Full CMDB; IoT; PMS | **Not started** |
| **P4** | **Soft dual-brand** | Name trust | Sinexis strings, landing, SKU label | Hard cut / domain cutover blocking attach | **Shipped soft dual-brand on `main`** (#250); public host remains **`vs.appmedia.id`** (no hard cut) |
| **P5** | **Guard MVP** (Wazuh thin) | Second upsell | Agent inventory, critical alerts, per-org enroll | Full SIEM, SOAR | **Parked** — only after Workspace stable + attach story / written risk accept |
| **P6** | **Hospitality / pilot pack** | Beachhead A | Hotel runbooks, hybrid SLA | Logos-only builds | After attach pilot story works |

**Priority rule for agents (post–P2 S1–S5 + Wave B ship):**

1. **Default next work is GTM execution** (human: finance / AM / ops) — **not** a new code epic.
2. Code only on **explicit** user verb, **bugfix** (attach or workspace), **P3** after pain, or docs/ops hygiene.
3. Ordering still true: P1 before Guard; P2 before Guard; P4 must not block attach revenue.
4. **Never** start P5 by default. **Do not** re-implement P2 S1–S5 or Wave B “because docs were stale.”

### 1.4 What *not* to prioritize for upsell

- Rebrand-only or domain cutover as the main “feature”
- Full SIEM / Windows depth / nested multi-project / org dual-wallet
- Mobile APK/IPA as the **hero** attach SKU (engine stays; GMD base is server/domain)
- Treating Yogya hotel **acquisition** count as the only success metric while colo/VPS attach is ignored
- Global `ApiKey` as multi-tenant identity without redesign (blocks safe automation later)

---

## 2) What the codebase is today (facts)

**Stack:** SPA React/Vite + FastAPI + PostgreSQL + Redis + Celery (queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter` + schedule due tick) + **celery_beat** + host nginx prod.

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

**Still absent (later epics):** nested Project, org wallet, per-org ApiKey, **asset registry product**, Wazuh/Guard, in-app subscription table, hard Sinexis domain cutover.

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

**Agent:** maintain commercial docs on request; **do not** open Guard/Wazuh feature branches; **do not** invent new list prices without user.

### Phase B — Specs before code

| Spec | Status | Before implementing |
|------|--------|---------------------|
| [`docs/specs/scan-attach-v1.md`](specs/scan-attach-v1.md) | **Implemented** (S1–S5 on main; keep as historical acceptance) | N/A for new attach features unless extending |
| [`docs/specs/workspace-v1.md`](specs/workspace-v1.md) | **Approved** D1–D6; **S1–S5 implemented** on main (#267 + #270) | Residual smoke / bugs only with explicit verb |
| `docs/specs/assets-v1.md` | Not written | P3 |
| Guard design note | Not written | P5 — only after Workspace stable + attach story (or written risk) |

**Agent:** wait for **explicit implement** even when spec exists. Prefer **draft spec** over silent coding for P3+.

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

### Phase C3 / P3 — Asset registry (light)

- Assets belong to org (or user until org exists)
- Labels + target type; bulk “run pack”
- Enforce tier limits if SKU defined

### Phase D / P4 — Soft rebrand — **soft dual-brand DONE** (#250)

- Shell strings / titles / landing → **Sinexis** primary, VulnScanner as engine whisper
- Public edge host still **`vs.appmedia.id`** (no hard domain cut)
- DNS/TLS `sinexis.app` cutover = **later**, must not block GTM
- Label attach offer **Sinexis Scan** (or agreed SKU name)

### Phase E / P5 — Guard MVP

- After Workspace stable in prod **and** attach GTM motion real (or explicit user risk accept)
- Wazuh engine; thin UI (agents, last-seen, critical alerts)
- Per-org enroll tokens (redesign API keys)
- Target **second upsell** for accounts that already buy security-ish lines
- **Out of scope v1:** full SIEM, multi-cluster CCS unless required

### Phase F / P6 — Hospitality / pilot pack

- Templates + runbooks; optional copy for GM
- Hybrid managed checklist
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

- [ ] Org (or user) can CRUD named assets with scan targets
- [ ] Scheduled pack can include multiple assets within tier limits

---

## 6) Anti-goals (reject unless user explicitly expands scope)

- Rewriting the whole app “as Sinexis monorepo” in one PR
- Installing production Wazuh before Workspace **and** before a real attach loop strategy
- Nested projects + billing + Guard in one branch
- Treating Prometheus app metrics as customer host monitoring
- Using global `ApiKey` as multi-tenant agent identity without redesign
- Waiting on CI in-session instead of moving to next task
- Committing finance extracts or customer PII “for convenience”
- Prioritizing rebrand cosmetics over billable schedule/report work when user goal is **upsell**

---

## 7) How the user will continue after reset

**Typical user messages → agent action:**

| User says | Agent does |
|-----------|------------|
| “lanjut” / “next” without spec | Re-read §1.3 + `handoff.md`; report **GTM open items** + residual P2 smoke / P3–P6; **no** silent feature coding |
| “tulis spek workspace” | Update `docs/specs/workspace-v1.md` only (S1–S5 already shipped) |
| “implement workspace” / “kerjakan fase workspace” | S1–S5 done — clarify **bug / residual** before coding |
| “rebrand” / “sinexis.app” | Soft brand shipped; hard cut / DNS only on explicit ask; don’t invent Guard; don’t block attach GTM |
| “wazuh” / “agent monitoring” | P2 S1–S5 on main; design P5 first — still **parked** by default |
| “deploy” | Prefer CI `deploy` on `main` or scripts on **edge**; verify health; coding host Docker off by default |
| “update handoff / guide” | Docs PR only |

**Locked answers (P0 — do not re-ask every session):** KPI = **attach ARPU primary**; renew = **AM**; billing v1 = **GMD invoice + app credit top-up**; dual-brand = **6–12 mo soft** (soft UI shipped); after P0/P1/P2-S1–S5 + Wave B = **GTM + optional P3 on pain** — **no** Guard default.

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

---

## 9) Related docs

| Doc | Role |
|-----|------|
| `AGENTS.md` | Git/PR session workflow |
| `README.md` | Product as-shipped (VulnScanner scan SaaS + schedules ops pointer) |
| `SECURITY.md` | Accepted residual dependency risks |
| `docs/dependency-pins.md` | Redis/Celery/kombu pin matrix |
| `scripts/smoke-broker.sh` | Broker/API smoke |
| `docs/scan-schedules-ops.md` | Beat, credits gate, smoke A/B, compose project notes |
| `docs/commercial/*` | P0 one-pager, SKU lock, AM email |
| `handoff.md` | Session snapshot + GTM checklist — **epic order** still this guide |
| `docs/archive/handoff-scan-pending-2026.md` | **ARCHIVED** stuck-pending (re-verify) |
| `docs/specs/*` | Specs (attach historical; workspace S1–S5 shipped; assets TBD) |

---

## 10) Agent one-liner

> After reset: **boot §0 → §1.3 (P0 locked, P1 + P2 S1–S5 + Wave B + P4 soft on main, GTM now, no Guard default) → no silent epics → bug/P3 only on explicit ask → no PII/SSH in git → Indonesian with user, `GIT_MASTER=1`, coding Docker off, edge for prod.**

---

*Ultraworked with Sisyphus — keep this file updated when phase status, CSV evidence, or defaults change.*
