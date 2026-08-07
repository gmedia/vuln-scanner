# Sinexis / VulnScanner — Agent Execution Guide

**Purpose:** Survive OpenCode / Sisyphus **session reset**. Read this **before** coding after a new session.

**Last updated:** 2026-08-07
**Repo tip at write time:** `main` @ `f96d60a` (includes #230 agent guide)
**Language with user:** **Bahasa Indonesia** (preferensi sesi). Code/commits/PR bodies: English OK (repo convention).

---

## 0) Session boot (do this first)

```bash
# MANDATORY (also in AGENTS.md)
gh pr list --state open --assignee @me

GIT_MASTER=1 git fetch origin
GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull origin main
GIT_MASTER=1 git rev-parse --short HEAD   # expect ≥ f96d60a or newer
```

Then read, in order:

1. This file — `docs/AGENT_EXECUTION_GUIDE.md` (**wins on product priority**)
2. `AGENTS.md` — branch/PR/CI workflow
3. `docs/dependency-pins.md` + `SECURITY.md` (accepted residual risks)
4. Only if the user names an active **stuck-job / worker** incident: `docs/archive/handoff-scan-pending-2026.md` (historical diagnosis — **re-verify**; do not treat PENDING list as current backlog)
5. Root `handoff.md` — **pointer stub** only (not a second roadmap); always re-check this guide for *what to build next*

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
| **Modules** | **Scan** (shipped) · **Workspace** (org + members) · **Attach pack** (schedule, assets, executive report, SKU) · **Guard** (Wazuh-backed, thin UI) |
| **Build order (upsell-first)** | See **§1.2** — do **not** use the old “Workspace → rebrand → Guard only” sequence as the sole plan |
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

**Sources (host paths only — outside git):**

- `/home/ubuntu/gmd_finance_invoice_customer_202608071318.csv`
- `/home/ubuntu/_select_i_id_i_service_id_s_customer_id_s_customer_kategori_i_da_202608071342.csv`

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

| P | Epic | Goal for upsell | In scope | Out of scope |
|---|------|-----------------|----------|--------------|
| **P0** | **Commercial lock** (user-led) | Something sales can quote | One-pager; **Scan/Secure Add-on SKU** (tiers, price sketch); 5–15 target SID *patterns* (not committed PII); confirm defaults §1 | Coding Guard/Wazuh; finance CSV in repo |
| **P1** | **Scan Attach Loop** (productize what exists) | Recurring reason to pay monthly | **Scheduled** domain/IP scan; email/summary of new critical/high; **baseline diff** N vs N−1; **executive PDF/HTML** (Bahasa-friendly management view) | Org rewrite; Wazuh; full rebrand |
| **P2** | **Workspace v1** (multi-tenant) | B2B delivery: IT runs, manager views | `organizations`, memberships, invites, scan list/detail scoped by org, personal credits, migration personal-org backfill; **API keys toward per-org** | Nested projects; org wallet; Wazuh |
| **P3** | **Asset registry (light)** | Larger ticket / multi-target tiers | Named assets (domain/IP/label) per org; “scan all in pack”; ties to schedule | Full CMDB; IoT/CCTV; PMS deep integrate |
| **P4** | **Soft dual-brand** | Package name trust | Sinexis shell strings, landing, emails; `sinexis.app` when ready; **Sinexis Scan** label on attach SKU | Hard cut blocking P1; favicon-only “epic” |
| **P5** | **Guard MVP** (Wazuh thin) | **Second** upsell to security-aware accounts | Agent inventory, critical alerts, per-org enroll; optional managed review flag | Full SIEM, raw log product, SOAR |
| **P6** | **Hospitality / pilot pack** | Beachhead A + design partner | Runbooks, report templates for hotel GM, hybrid SLA notes | Building only for logos not in pipeline |

**Priority rule for agents:** If forced to choose one code epic after P0, prefer **P1 (Attach Loop)** for pure upsell speed; prefer **P2 (Workspace)** when the user prioritizes multi-user B2B or approved Workspace spec. Default recommendation after P0 docs: **P1 then P2** (or thin P2 slice if multi-user blocks delivery of paid attach). **Never** start P5 before P2 ships (or user accepts written risk). **Never** let P4 block P1.

### 1.4 What *not* to prioritize for upsell

- Rebrand-only or domain cutover as the main “feature”
- Full SIEM / Windows depth / nested multi-project / org dual-wallet
- Mobile APK/IPA as the **hero** attach SKU (engine stays; GMD base is server/domain)
- Treating Yogya hotel **acquisition** count as the only success metric while colo/VPS attach is ignored
- Global `ApiKey` as multi-tenant identity without redesign (blocks safe automation later)

---

## 2) What the codebase is today (facts)

**Stack:** SPA React/Vite + FastAPI + PostgreSQL + Redis + Celery (queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter`) + host nginx prod.

**Domain model (no multi-tenant yet):**

| Entity | Scope | Notes |
|--------|--------|------|
| `User` | Global | `is_admin` bool, **personal** `credits` |
| `ScanJob` | `user_id` only | Types: `ip` \| `domain` \| `apk` \| `ipa` |
| `ScanFinding` | via job | Vuln taxonomy |
| `CreditLog` / `PricingConfig` | user / global | Metering exists — foundation for attach SKU credits |
| `ApiKey` | **Global** M2M | **No** user/org FK — unfit for per-tenant agents as-is |

**AuthZ:** JWT (`sub`, `email`, `is_admin`) + optional `X-API-Key`. Scan isolation = `ScanJob.user_id == current_user`. Admin routes = **platform** superuser, not hotel/company admin.

**Absent (greenfield):** Organization, Project, Membership, invites, org-scoped keys, **scan schedules**, **asset registry**, **baseline/diff jobs**, Wazuh/agent pipeline, hospitality objects, Sinexis brand strings, formal **add-on SKU** catalog in-product.

**Already strong for upsell (reuse, don’t rewrite):** IP + domain scan pipelines, findings model, HTML/JSON export, credits, Celery + beat (maintenance exists — extend carefully for schedules).

**Key paths:**

- Models: `backend/app/models/`
- Auth: `backend/app/services/auth.py`
- Scan ownership choke point: `backend/app/services/scanner.py`
- Routes: `backend/app/api/router.py`
- Workers / beat: `workers/`
- SPA brand: `frontend/src/components/layout/Sidebar.tsx`, `Landing.tsx`, `index.html`
- Prod edge: `nginx/vs.appmedia.id.conf`, URL `https://vs.appmedia.id`

---

## 3) Roadmap phases (execution contract)

Aligned to **§1.3**. Phase letters are stable for chat (“kerjakan P1”); do not invent parallel conflicting orders.

### Phase A / P0 — Decide & lock (user-led, little/no code)

- [ ] One-pager Sinexis (positioning, modules, buyer vs daily user, data trust)
- [ ] **Scan/Secure Add-on SKU** sketch (Basic / Pro / Multi-asset; price or credit bundle)
- [ ] Upsell target *patterns* (VPS+cPanel, colo IP surface, multi-asset hotel/corporate) — lists stay off-repo if PII
- [ ] 1 pilot: relationship hotel **and/or** internal multi-asset design-partner pattern
- [ ] Confirm soft dual-brand vs hard cut; confirm defaults in §1
- [ ] Confirm near-term KPI: attach ARPU vs new hotel logos vs both

**Agent:** draft docs only if asked; **do not** open Guard/Wazuh feature branches.

### Phase B — Specs before code

Deliverables (as user requests), under `docs/specs/`:

| Spec | Before implementing |
|------|---------------------|
| `docs/specs/scan-attach-v1.md` | P1 — schedule model, diff rules, report sections, credit charging |
| `docs/specs/workspace-v1.md` | P2 — ERD, authZ matrix, migration, acceptance (§5) |
| `docs/specs/assets-v1.md` | P3 — asset entity, limits per SKU tier |
| Guard design note | P5 — only after P2 (and ideally P1) real |

**Agent:** write specs when asked; wait for **explicit implement**.

### Phase C1 / P1 — Scan Attach Loop (upsell engine)

Suggested branch prefix: `feat/scan-schedule-` / `feat/scan-baseline-` / `feat/exec-report-` (split PRs).

Order (adjust to spec):

1. Schedule entity + Celery beat / periodic enqueue (domain + IP first)
2. Baseline store + diff of findings (new/resolved/worsened)
3. Notification: email or in-app summary for critical/high **new** items
4. Executive export (management-oriented HTML/PDF)
5. Tests + credit debits per policy
6. Deploy via `deploy-services.sh` when backend/workers involved

**DoD:** a customer can pay for “monthly check” in practice (automated or hybrid), not only one-shot dashboard clicks.

**Do not** require full Workspace to ship a **single-user** attach MVP; plan authZ so org scope can wrap jobs in P2.

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

| Change | Script | Host |
|--------|--------|------|
| SPA only | `./scripts/deploy-frontend.sh` | **prod only** `ubuntu@103.217.209.127 -p 4122` path `/home/ubuntu/vuln-scanner` |
| App services | `./scripts/deploy-services.sh` | same; **never** volume-wipe postgres/redis for routine deploys |
| Compose project | `docker-compose.prod.yml` + `COMPOSE_PROJECT_NAME=vuln` | |

- **Not** gelera / `111.68.25.27` for this product deploy
- Broker smoke: `./scripts/smoke-broker.sh` (optional deploy-path arg on host)
- Health: `https://vs.appmedia.id/health`, `/health/queues`

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

### 5.1 Scan Attach Loop (P1)

- [ ] User (or system) can define a recurring domain and/or IP scan
- [ ] Jobs enqueue reliably via worker/beat; failures visible
- [ ] Diff or equivalent shows **new** high/critical since previous run
- [ ] Management-oriented export exists (HTML minimum; PDF optional)
- [ ] Credits (or documented hybrid billing) charged per policy
- [ ] Tests for schedule + authZ (user-scoped first; org-ready fields OK)
- [ ] No Wazuh in this epic

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
| “lanjut” / “next” without spec | Re-read this guide §1.3; report P0–P6 status; **ask** — no silent feature coding |
| “upsell” / “attach” / “jadwal scan” | Point at P1; offer/write `scan-attach-v1` spec or implement if explicit |
| “tulis spek workspace” | Create/update `docs/specs/workspace-v1.md` only |
| “implement workspace” / “kerjakan fase workspace” | Branch + implement P2 against approved spec |
| “rebrand” / “sinexis.app” | P4 only; don’t invent Guard; don’t block P1 |
| “wazuh” / “agent monitoring” | Confirm P2 done (and ideally P1); design P5 first |
| “deploy” | Use correct script; prod SSH as above; verify health |

**Open questions to re-ask if missing from session memory:**

1. Near-term KPI: attach ARPU on existing SID vs new hotel logos vs both?
2. Who pays vs who uses daily (GM / in-house IT / external vendor / GMD sales)?
3. SKU price: credit bundle inside app vs invoice line outside app (hybrid)?
4. Typical pilot asset mix (Linux VPS % vs Windows)?
5. Data trust: full logs in Sinexis cloud vs alerts-only (Guard)?
6. Soft dual-brand vs hard cut?
7. After P0: implement **P1 first** or **P2 first**?

---

## 8) Quick reference — people & envs

| Item | Value |
|------|--------|
| GitHub | `gmedia/vuln-scanner`, branch `main` |
| Prod UI | https://vs.appmedia.id |
| Prod SSH | `ubuntu@103.217.209.127 -p 4122` |
| App path | `/home/ubuntu/vuln-scanner` |
| Admin (ops) | `arief.novianto@gmedia.id` |
| E2E user | `e2e@vulnscan.dev` / `E2eTestPass123!` (`ensure_e2e_user.sh`) |
| Future brand domains | `sinexis.app`, `sinexis.tech` (DNS/app cutover not done at guide write) |
| Finance CSVs | Under `/home/ubuntu/*.csv` on analysis host — **not** in git |

---

## 9) Related docs

| Doc | Role |
|-----|------|
| `AGENTS.md` | Git/PR session workflow |
| `README.md` | Product as-shipped (VulnScanner scan SaaS) |
| `SECURITY.md` | Accepted residual dependency risks |
| `docs/dependency-pins.md` | Redis/Celery/kombu pin matrix |
| `scripts/smoke-broker.sh` | Broker/API smoke |
| `handoff.md` | **Stub + pointer** — always defer product priority to this guide |
| `docs/archive/handoff-scan-pending-2026.md` | **ARCHIVED** stuck-pending diagnosis (stale backlog risk; re-verify) |
| `docs/specs/*` | Approved implementation specs (attach, workspace, assets, …) |

---

## 10) Agent one-liner

> After reset: **boot §0 → honor dual GTM + upsell priority §1.2–1.3 (P0 lock → P1 attach loop → P2 workspace → P3 assets → P4 brand → P5 guard) → never code without explicit implement or approved spec → no finance PII in git → Indonesian with user, disciplined git/deploy.**

---

*Ultraworked with Sisyphus — keep this file updated when phase status, CSV evidence, or defaults change.*
