# Sinexis / VulnScanner — Agent Execution Guide

**Purpose:** Survive OpenCode / Sisyphus **session reset**. Read this **before** coding after a new session.

**Last updated:** 2026-08-07
**Repo tip at write time:** `main` @ `0fd5490` (includes #229 hygiene)
**Language with user:** **Bahasa Indonesia** (preferensi sesi). Code/commits/PR bodies: English OK (repo convention).

---

## 0) Session boot (do this first)

```bash
# MANDATORY (also in AGENTS.md)
gh pr list --state open --assignee @me

GIT_MASTER=1 git fetch origin
GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull origin main
GIT_MASTER=1 git rev-parse --short HEAD   # expect ≥ 0fd5490 or newer
```

Then read, in order:

1. This file — `docs/AGENT_EXECUTION_GUIDE.md`
2. `AGENTS.md` — branch/PR/CI workflow
3. `docs/dependency-pins.md` + `SECURITY.md` (accepted residual risks)
4. Only if stuck-jobs context: `handoff.md` (legacy scan-pending diagnosis; may be stale)

**Do not implement** until the user uses an explicit verb (`implement` / `buat` / `kerjakan` / `fix` / …) **or** points at an approved spec section.

---

## 1) Product north star (agreed)

| Item | Decision |
|------|----------|
| **Direction** | Pivot from single-user vuln-scan SaaS → **hospitality security platform** |
| **Brand** | **Sinexis** (domains owned: `sinexis.app`, `sinexis.tech`) |
| **Legacy name** | VulnScanner / `vs.appmedia.id` — keep as **Scan module** during soft dual-brand |
| **GTM** | Hotel / hospitality **management**, Yogyakarta; owner has local hotel relationships |
| **Modules** | **Workspace** (org + members) · **Scan** (current product) · **Guard** (Wazuh-backed, thin UI) |
| **Build order** | (1) Workspace multi-tenant → (2) soft rebrand → (3) Guard MVP → (4) hospitality pack / reports |
| **Not v1** | Full SIEM UI, nested multi-project, org billing dual-wallet complexity, Windows depth, SOAR |

### Positioning (one line)

> **Sinexis** — security control center for hospitality: monitor servers, find weaknesses, manage team & assets in one place.

### Default decisions (use if user has not overridden)

1. **Org ≈ one hotel**; nested **Project deferred** (1 org = 1 workspace in v1).
2. **Credits stay personal** in Workspace v1; org wallet = later.
3. **Guard data:** alert + agent inventory in cloud first; not full raw-log product UI.
4. **Hybrid:** product + light **managed** review for Yogya pilots.
5. **Soft dual-brand** 6–12 months (`sinexis.app` primary, `vs.appmedia.id` redirect later).
6. **Phase 1 engineering = Workspace only** — no Wazuh in the same epic.

---

## 2) What the codebase is today (facts)

**Stack:** SPA React/Vite + FastAPI + PostgreSQL + Redis + Celery (queues: `ip_scan`, `domain_scan`, `mobile_scan`, `dead_letter`) + host nginx prod.

**Domain model (no multi-tenant yet):**

| Entity | Scope | Notes |
|--------|--------|------|
| `User` | Global | `is_admin` bool, **personal** `credits` |
| `ScanJob` | `user_id` only | Types: `ip` \| `domain` \| `apk` \| `ipa` |
| `ScanFinding` | via job | Vuln taxonomy |
| `CreditLog` / `PricingConfig` | user / global | Metering exists |
| `ApiKey` | **Global** M2M | **No** user/org FK — unfit for per-tenant agents as-is |

**AuthZ:** JWT (`sub`, `email`, `is_admin`) + optional `X-API-Key`. Scan isolation = `ScanJob.user_id == current_user`. Admin routes = **platform** superuser, not hotel admin.

**Absent (greenfield):** Organization, Project, Membership, invites, org-scoped keys, Wazuh/agent pipeline, hospitality objects, Sinexis brand strings.

**Key paths:**

- Models: `backend/app/models/`
- Auth: `backend/app/services/auth.py`
- Scan ownership choke point: `backend/app/services/scanner.py`
- Routes: `backend/app/api/router.py`
- SPA brand: `frontend/src/components/layout/Sidebar.tsx`, `Landing.tsx`, `index.html`
- Prod edge: `nginx/vs.appmedia.id.conf`, URL `https://vs.appmedia.id`

---

## 3) Roadmap phases (execution contract)

### Phase A — Decide & lock (user-led, little/no code)

- [ ] One-pager Sinexis (positioning, modules, buyer vs daily user, data trust, pricing sketch)
- [ ] 1–2 hotel pilot intent (Yogya)
- [ ] Confirm soft dual-brand vs hard cut
- [ ] Confirm defaults in §1 or override in writing

**Agent:** help draft docs only if asked; **do not** open feature branches for Guard/Wazuh yet.

### Phase B — Spec Workspace v1 (docs before code)

Deliverables before `feat/workspace-*`:

- [ ] ERD: `organizations`, `organization_memberships` (roles), `invites`
- [ ] API list + authZ matrix (owner / admin / member / viewer)
- [ ] Migration plan: each existing user → **personal org**; attach historical `ScanJob` to that org
- [ ] Credits decision documented (default: still personal)
- [ ] Acceptance criteria (see §5)

**Agent:** write spec under `docs/` (e.g. `docs/specs/workspace-v1.md`) when user asks; wait for **explicit implement**.

### Phase C — Implement Workspace (first major code epic)

Suggested branch: `feat/workspace-org-membership` (split PRs if large).

Order:

1. Alembic: org + membership + invite tables
2. AuthZ helpers (replace pure `user_id` filters with membership checks)
3. API + backend tests
4. Frontend: org switcher, members, invite
5. Data migration / backfill personal orgs
6. PR(s) with tests; deploy via `deploy-services.sh` when backend involved

**DoD:** two users in same org see shared scans; owner invites member; viewer is read-only.

### Phase D — Soft rebrand (can partially parallel after Workspace stable)

- Shell strings, email `From`, titles, landing → Sinexis
- DNS/TLS `sinexis.app` when ready
- Keep Scan UX; label **Sinexis Scan**
- Do **not** block Workspace on favicon/domain alone

### Phase E — Guard MVP (after ≥1 pilot on Workspace)

- Wazuh as **engine**; Sinexis UI **thin** (agents, last-seen, critical alerts)
- Per-org enroll tokens (redesign API keys)
- Managed weekly review runbook for pilots
- **Out of scope v1:** custom full SIEM, multi-cluster CCS complexity unless required

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
- Do **not** commit: `workers/coverage-report.json`, `.playwright-mcp/`, temp screenshot dirs

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
- Platform `is_admin` must **never** be reused as “hotel owner”

### Product safety

- Do **not** force-fit Wazuh events into `scan_findings` long-term
- Do **not** `npm audit fix --force` on react-router (downgrade trap)
- Do **not** bump `redis` package past kombu `<6.5` without docs update

---

## 5) Workspace v1 — acceptance criteria (draft)

Use as checklist when implementing Phase C:

- [ ] User can create an organization (hotel workspace)
- [ ] Roles: `owner` \| `admin` \| `member` \| `viewer` enforced on API
- [ ] Owner/admin can invite by email; existing Sinexis/VulnScanner user can accept; pending invite for unknown email
- [ ] Scans list/detail/export/WebSocket respect **org membership** (not only job creator), per role
- [ ] Backfill: every pre-migration user has a personal org; old jobs visible in that org
- [ ] Platform admin (`is_admin`) still global; cannot read all orgs via hotel UI bugs
- [ ] Credits behavior matches documented decision (default: personal balance unchanged)
- [ ] Tests: authZ matrix + migration backfill
- [ ] No Wazuh/agent code in this epic

---

## 6) Anti-goals (reject unless user explicitly expands scope)

- Rewriting the whole app “as Sinexis monorepo” in one PR
- Installing production Wazuh before Workspace ships
- Nested projects + billing + Guard in one branch
- Treating Prometheus app metrics as customer host monitoring
- Using global `ApiKey` as multi-tenant agent identity without redesign
- Waiting on CI in-session instead of moving to next task

---

## 7) How the user will continue after reset

**Typical user messages → agent action:**

| User says | Agent does |
|-----------|------------|
| “lanjut” / “next” without spec | Re-read this guide; report Phase A/B status; **ask** what to do — no silent feature coding |
| “tulis spek workspace” | Create/update `docs/specs/workspace-v1.md` only |
| “implement workspace” / “kerjakan fase 1” | Branch + implement Phase C against approved spec |
| “rebrand” / “sinexis.app” | Phase D only; don’t invent Guard |
| “wazuh” / “agent monitoring” | Confirm Workspace done or user accepts risk; then Phase E design first |
| “deploy” | Use correct script; prod SSH as above; verify health |

**Open questions to re-ask if missing from session memory:**

1. Who pays vs who uses daily (GM / in-house IT / external vendor)?
2. Typical pilot asset mix (Linux VPS % vs Windows)?
3. Data trust: full logs in Sinexis cloud vs alerts-only?
4. Self-serve vs managed vs hybrid?
5. Soft dual-brand vs hard cut?
6. v1 = Workspace only, or Workspace + Guard skeleton?

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

---

## 9) Related docs

| Doc | Role |
|-----|------|
| `AGENTS.md` | Git/PR session workflow |
| `README.md` | Product as-shipped (VulnScanner scan SaaS) |
| `SECURITY.md` | Accepted residual dependency risks |
| `docs/dependency-pins.md` | Redis/Celery/kombu pin matrix |
| `scripts/smoke-broker.sh` | Broker/API smoke |
| `handoff.md` | **Legacy** stuck-pending scan investigation (verify before trusting) |
| `docs/specs/*` | (To be added) approved implementation specs |

---

## 10) Agent one-liner

> After reset: **boot §0 → honor Sinexis north star §1 → ship Workspace before Guard → never code without explicit implement or approved spec → Indonesian with user, disciplined git/deploy.**

---

*Ultraworked with Sisyphus — keep this file updated when phase status or defaults change.*
