# Sinexis / VulnScanner — Agent Execution Guide

**Purpose:** Survive OpenCode / Sisyphus **session reset**. Read this **before** coding after a new session.

**Last updated:** 2026-08-09
**Repo tip at write time:** `main` @ `da8cd36` (P0 commercial lock + AM email #245–#246; P1 attach on main earlier). Re-`git pull` after reset.
**Language with user:** **Bahasa Indonesia** (preferensi sesi). Code/commits/PR bodies: English OK (repo convention).
**Phase snapshot:** **P0 policy locked in git** · **P1 Scan Attach shipped + production smoke closed** · **near-term work = GTM (finance/AM/ops)** · next **code** epic default = **none** until bug or explicit **P2 spec** (multi-user pain).

---

## 0) Session boot (do this first)

```bash
# MANDATORY (also in AGENTS.md)
gh pr list --state open --assignee @me

GIT_MASTER=1 git fetch origin
GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull origin main
GIT_MASTER=1 git rev-parse --short HEAD   # expect ≥ da8cd36 or newer (re-pull)
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
| **Modules** | **Scan + Attach loop** (shipped on prod) · **Workspace** (P2, not built) · **Assets** (P3) · **Guard** (P5, parked) |
| **Build order (upsell-first)** | See **§1.3** — do **not** use “Workspace → rebrand → Guard only” as the sole plan; **do not** start P2/P5 by default now that P1 is live |
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

| P | Epic | Goal for upsell | In scope | Out of scope | **Status (2026-08-09)** |
|---|------|-----------------|----------|--------------|-------------------------|
| **P0** | **Commercial lock** (user-led + docs) | Something sales can quote | One-pager; **SKU** tiers/prices; SID *patterns*; AM email kit; defaults §1 | Guard coding; finance CSV in repo | **Policy locked in git** (#245–#246). **GTM still open:** finance `service_id`, 10 CRM SIDs, named pilot, AM send, ops fulfill |
| **P1** | **Scan Attach Loop** | Recurring reason to pay monthly | **Scheduled** domain/IP; new critical/high notify; **baseline diff**; **executive HTML**; credits on schedule; cap 10 | Org rewrite; Wazuh; full rebrand | **Shipped on `main` + production smoke closed** (S1–S5, edge DoD) |
| **P2** | **Workspace v1** | B2B multi-user | orgs, memberships, invites, org-scoped scans, personal credits, backfill; API keys toward per-org | Nested projects; org wallet; Wazuh | **Not started** — **spec first** (`workspace-v1.md` missing); only if multi-user blocks paid delivery |
| **P3** | **Asset registry (light)** | Multi-target tiers | Named assets; scan pack; tier limits | Full CMDB; IoT; PMS | **Not started** |
| **P4** | **Soft dual-brand** | Name trust | Sinexis strings, landing, `sinexis.app`; SKU label | Hard cut blocking attach revenue | **Not started** (must not block attach GTM) |
| **P5** | **Guard MVP** (Wazuh thin) | Second upsell | Agent inventory, critical alerts, per-org enroll | Full SIEM, SOAR | **Parked** — never before P2 (or written risk accept) |
| **P6** | **Hospitality / pilot pack** | Beachhead A | Hotel runbooks, hybrid SLA | Logos-only builds | After attach pilot story works |

**Priority rule for agents (post–P1 ship):**

1. **Default next work is GTM execution** (human: finance / AM / ops) — **not** a new code epic.
2. Code only on **explicit** user verb, or **bugfix** on attach, or **draft/implement P2** after multi-user pain / approved spec.
3. Historical rule still true for *ordering*: P1 before Guard; P2 before Guard; P4 must not block attach revenue.
4. **Never** start P5 before P2 ships (or user accepts written risk). **Never** open P2/P5 “because P0/P1 docs finished.”

### 1.4 What *not* to prioritize for upsell

- Rebrand-only or domain cutover as the main “feature”
- Full SIEM / Windows depth / nested multi-project / org dual-wallet
- Mobile APK/IPA as the **hero** attach SKU (engine stays; GMD base is server/domain)
- Treating Yogya hotel **acquisition** count as the only success metric while colo/VPS attach is ignored
- Global `ApiKey` as multi-tenant identity without redesign (blocks safe automation later)

---

## 2) What the codebase is today (facts)

**Stack:** SPA React/Vite + FastAPI + PostgreSQL + Redis + Celery (queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter` + schedule due tick) + **celery_beat** + host nginx prod.

**Domain model (still single-tenant user scope — no org yet):**

| Entity | Scope | Notes |
|--------|--------|------|
| `User` | Global | `is_admin`, **personal** `credits` |
| `ScanJob` | `user_id` only | Types: `ip` \| `domain` \| `apk` \| `ipa` |
| `ScanFinding` | via job | Vuln taxonomy; baseline **diff** across runs for attach |
| `CreditLog` / **`pricing`** table | user / global | `credit_cost` per `scan_type` (edge smoke: domain **2**, IP **1** — re-confirm live) |
| **`scan_schedules`** (P1) | `user_id` | Cadence weekly/monthly; `last_job_id`; `last_error`; **max 10 enabled**/user; debit credits on due; auto-disable if insufficient |
| `ApiKey` | **Global** M2M | **No** user/org FK — unfit for per-tenant agents as-is |

**AuthZ:** JWT + optional `X-API-Key`. Scan/schedule isolation = owning `user_id`. Admin = **platform** superuser, not org/hotel admin.

**Shipped for attach (P1) — reuse, don’t rewrite:** schedule API + beat `schedules.run_due`, baseline diff, new critical/high notify, executive HTML, credit gate, ops notes `docs/scan-schedules-ops.md`.

**Still absent (greenfield for later epics):** Organization, Project, Membership, invites, org-scoped keys, **asset registry product**, Wazuh/Guard pipeline, in-app subscription table, hard Sinexis UI cutover.

**Commercial kit (docs, not in-app catalog):** `docs/commercial/sinexis-one-pager.md`, `sku-scan-secure-addon.md` (P0 lock), `am-wave1-email-id.md`.

**Key paths:**

- Models / schedules: `backend/app/models/`, `backend/app/services/schedule.py`, `backend/app/schemas/schedule.py`
- Auth: `backend/app/services/auth.py`
- Scan ownership: `backend/app/services/scanner.py`
- Routes: `backend/app/api/router.py`
- Workers / beat: `workers/`, especially `workers/tasks/schedules.py`
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
| `docs/specs/workspace-v1.md` | **Not written** | **Required** before P2 code |
| `docs/specs/assets-v1.md` | Not written | P3 |
| Guard design note | Not written | P5 — only after P2 (P1 already real) |

**Agent:** wait for **explicit implement** even when spec exists. Prefer **draft spec** over silent coding for P2+.

### Phase C1 / P1 — Scan Attach Loop (upsell engine) — **DONE**

**Shipped:** schedule entity + beat due tick; baseline diff; new critical/high notify; executive HTML; credit debit + auto-disable; cap 10; ops docs; **production smoke A** (due+credits, zero-credit gate). Detail: root `handoff.md`, `docs/scan-schedules-ops.md`.

**Residual engineering:** bugfixes only; optional edge tip pull for docs-only SHAs; no second “implement P1” epic.

**Do not** require Workspace for single-user attach (already true in prod). Org FK for schedules = P2 follow-up when Workspace lands.

### Phase C2 / P2 — Workspace v1

Suggested branch: `feat/workspace-org-membership` (split PRs if large).

Order:

1. Alembic: org + membership + invite tables
2. AuthZ helpers (membership checks; keep personal credits)
3. API + backend tests
4. Frontend: org switcher, members, invite
5. Backfill personal orgs; attach historical `ScanJob`
6. Move schedules/assets toward org FK when present
7. PR(s); deploy with `deploy-services.sh`

**DoD:** two users in same org see shared scans per role; owner invites member; viewer read-only; **no Wazuh**.

### Phase C3 / P3 — Asset registry (light)

- Assets belong to org (or user until org exists)
- Labels + target type; bulk “run pack”
- Enforce tier limits if SKU defined

### Phase D / P4 — Soft rebrand

- Shell strings, email `From`, titles, landing → Sinexis
- DNS/TLS `sinexis.app` when ready
- Label attach offer **Sinexis Scan** (or agreed SKU name)
- **Must not** block P1 revenue experiments

### Phase E / P5 — Guard MVP

- After Workspace in prod (or explicit user risk accept)
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
- [x] Cap **10** enabled schedules/user
- [x] No Wazuh in this epic
- [ ] Optional later: PDF, org-scoped schedules (P2), in-app subscription

### 5.2 Workspace v1 (P2)

- [ ] User can create an organization (hotel or company workspace)
- [ ] Roles: `owner` \| `admin` \| `member` \| `viewer` enforced on API
- [ ] Owner/admin can invite by email; existing user can accept; pending invite for unknown email
- [ ] Scans list/detail/export/WebSocket respect **org membership** (not only job creator), per role
- [ ] Backfill: every pre-migration user has a personal org; old jobs visible in that org
- [ ] Platform admin (`is_admin`) still global; cannot read all orgs via hotel UI bugs
- [ ] Credits behavior matches documented decision (default: personal balance unchanged)
- [ ] Tests: authZ matrix + migration backfill
- [ ] No Wazuh/agent code in this epic

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
| “lanjut” / “next” without spec | Re-read §1.3 + `handoff.md`; report **GTM open items** + P2–P6; **no** silent feature coding |
| “upsell” / “attach” / “jadwal scan” | P1 is **shipped** — point at ops/commercial docs; fix bugs only if reported |
| “tulis spek workspace” | Create/update `docs/specs/workspace-v1.md` only |
| “implement workspace” / “kerjakan fase workspace” | Only with approved spec; branch + implement P2 |
| “rebrand” / “sinexis.app” | P4 only; don’t invent Guard; don’t block attach GTM |
| “wazuh” / “agent monitoring” | Confirm P2 done; design P5 first — P1 already done |
| “deploy” | Correct script on **edge**; verify health; coding host Docker off by default |
| “update handoff / guide” | Docs PR only |

**Locked answers (P0 — do not re-ask every session):** KPI = **attach ARPU primary**; renew = **AM**; billing v1 = **GMD invoice + app credit top-up**; dual-brand = **6–12 mo soft**; after P0/P1 = **GTM then P2 only on pain**.

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
| `docs/specs/*` | Specs (attach historical; workspace/assets TBD) |

---

## 10) Agent one-liner

> After reset: **boot §0 → §1.3 status (P0 locked, P1 shipped, GTM now, P2+ deferred) → no silent epics → bug/spec/implement only on explicit ask → no PII/SSH in git → Indonesian with user, `GIT_MASTER=1`, coding Docker off, edge for prod.**

---

*Ultraworked with Sisyphus — keep this file updated when phase status, CSV evidence, or defaults change.*
