# Spec: Workspace v1 (P2)

**Status:** **approved** (D1–D6 locked 2026-08-10). **S1–S4 implemented** on `main` via #267 (`21dd317`); edge migration **`add_workspace_orgs`** applied. Residual: manual UI smoke; optional **S5** schedule cap per-org.
**Goal:** multi-user B2B workspace so a hotel or company can share scans and schedules under one org, without rewriting billing or attaching Guard.
**Epic:** P2 per [`docs/AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3, §3 Phase C2, §5.2.
**Historical branch:** `feat/workspace-org-membership` (merged). New work: `fix/*` or `feat/workspace-s5-schedule-cap` only with explicit verb.

---

## 1. Problem

Today the product is **single-user scoped**:

| Entity (today) | Scope | Pain |
|----------------|-------|------|
| `User` | global row; personal `credits` | No shared workspace for a property or company team |
| `ScanJob` | `user_id` only | Teammates cannot see each other’s jobs unless they share one login |
| `ScanSchedule` | `user_id`; `organization_id` column exists **NULL, no FK** | Cap is **10 enabled schedules per user**; org share is reserved only |
| `ApiKey` | **global** M2M (`key_hash`, no user/org FK) | Unfit as multi-tenant agent identity |
| AuthZ | JWT user id **or** platform API key; WebSocket often job-id + token without org membership | Cross-tenant **IDOR** risk once jobs are shared by id |

Commercial reality (upsell + hospitality): account managers need **owner + members** on one workspace; pilots need shared history without a second credit wallet yet.

---

## 2. Goals

1. **Organization** as the v1 workspace unit (one hotel **or** one company; not nested projects).
2. **Membership** with roles `owner` \| `admin` \| `member` \| `viewer`, enforced on API and WebSocket.
3. **Invites** by email (accept if user exists; pending invite if not).
4. **Org-scoped** list/detail/export of scans (and schedules when present) based on membership + role, not only `job.user_id == me`.
5. **Backfill:** every existing user gets a **personal org**; historical `ScanJob` (and schedules) attach to that org.
6. **Credits stay personal** on `users.credits` (creator/runner debit); no org wallet in v1.
7. **Multi-org switcher** in SPA; active org carried as JWT claim `org_id` (and refresh rotates claim).
8. **Register path** auto-creates personal org + owner membership.
9. **WebSocket AuthZ** org-scoped (membership on job’s org) to close job-id IDOR when multi-user lands.
10. Tests for AuthZ matrix + migration backfill; deploy notes only (no Guard).

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **Wazuh / Guard / agent enroll** | P5; never same epic as Workspace |
| **Org wallet / dual billing** | Credits remain personal in v1 |
| **Nested projects / multi-workspace trees** | 1 org = 1 workspace |
| **Hard rebrand / domain cutover** | P4; must not gate this epic |
| **Full CMDB / asset registry product** | P3 |
| **Redesign global `ApiKey` as tenant agents** | Toward per-org keys later; v1 may only document direction |
| **Platform `is_admin` as hotel/org owner** | Platform superuser stays global; never reuse flag as org role |
| **In-app subscription catalog** | Commercial remains GMD invoice + credit top-up |
| **Mobile-as-hero multi-tenant SKU** | Engine stays; schedules remain ip/domain |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Org semantics | **Org ≈ one company or one hotel** (design partner may still be one org with many targets later via P3 assets) |
| Credits | **Personal** balance on `User.credits`; debit the **acting user** who starts a scan or owns the schedule tick policy below |
| Schedule cap | Today: **max 10 enabled / user**. Plan: **migrate to max 10 enabled / org** in a follow-up slice after org FK is real (not blocking S1 schema) |
| Active org | SPA **org switcher**; server trusts **JWT `org_id`** (must match membership) |
| On register | Create **personal org** (`slug` derived from email local-part + short suffix), membership `owner` |
| Existing users | **Backfill** personal org + owner membership; set `organization_id` on their jobs/schedules |
| Platform admin | `User.is_admin` remains **platform** scope (stats, pricing, kill-switch). Admin UI must **not** leak all orgs via hotel workspace bugs |
| ApiKey v1 | Leave global key behavior for ops/M2M; **document** that tenant automation waits for per-org keys (P2.x or P5 prep). Do not use global key as “org identity” |
| Schedule credit on due | Debit **schedule owner** `user_id` (today’s model); org members see runs; insufficient credits still auto-disable schedule |
| Language | Spec English; user chat Bahasa; UI strings can stay dual-brand soft |

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **End user** | JWT; one or more org memberships; personal credits |
| **Org owner** | Full org admin including transfer/delete (delete may be soft/deferred) |
| **Org admin** | Manage members/invites; manage scans/schedules in org |
| **Org member** | Create/run scans in active org; manage own-created resources per matrix |
| **Org viewer** | Read-only scans/schedules/exports in org |
| **Platform admin** | `is_admin`; not an org role; separate routes |

---

## 6. Data model (proposed)

Align with existing SQLAlchemy style (`UUID`, timestamptz, Alembic). Names illustrative; implement PR may adjust snake_case only with migration consistency.

### 6.1 `organizations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | str(255) | display |
| `slug` | str(64) | unique, URL-safe |
| `kind` | str | optional: `personal` \| `company` \| `hotel` (default `personal` for auto orgs) |
| `created_by_user_id` | UUID FK users | nullable on system backfill if needed |
| `created_at` / `updated_at` | timestamptz | |

### 6.2 `organization_memberships`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK organizations | ON DELETE CASCADE |
| `user_id` | UUID FK users | ON DELETE CASCADE |
| `role` | str | `owner` \| `admin` \| `member` \| `viewer` |
| `created_at` / `updated_at` | timestamptz | |

**Constraints:**

- `UNIQUE (organization_id, user_id)`
- Check role enum
- **At least one `owner`** per org enforced in service layer (DB trigger optional later)

### 6.3 `organization_invites`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK | |
| `email` | str(255) | lowercased; **no** commit of real customer lists in fixtures beyond fake domains |
| `role` | str | invite role (not `owner` via invite in v1; promote separately) |
| `token_hash` | str | store hash only |
| `invited_by_user_id` | UUID FK | |
| `status` | str | `pending` \| `accepted` \| `revoked` \| `expired` |
| `expires_at` | timestamptz | e.g. 7–14 days |
| `accepted_user_id` | UUID NULL | set on accept |
| `created_at` / `updated_at` | timestamptz | |

**Rules:** owner/admin create; accept binds membership; unknown email stays pending until register+accept or magic link.

### 6.4 `scan_jobs` (delta)

| Column | Type | Notes |
|--------|------|-------|
| existing | | `user_id` **remains required** (creator / credit actor) |
| `organization_id` | UUID NULL → FK organizations | **nullable** during rollout; backfill then app always sets on create |

Index: `(organization_id, created_at DESC)`.

### 6.5 `scan_schedules` (delta)

| Column | Type | Notes |
|--------|------|-------|
| existing | | `user_id` required; `organization_id` already present **without FK** |
| `organization_id` | UUID NULL FK organizations | add real FK + index; backfill from owner’s personal org |

Cap migration (later slice): count enabled where `organization_id = ?` ≤ 10.

### 6.6 `users` (no credit column change)

No org wallet columns in v1. Optional later: `default_organization_id` for login convenience (can derive from sole membership).

### 6.7 `api_keys` (direction only)

Today: global `api_keys` without user/org. **v1 code change optional.** Recommended follow-up table sketch (not required for P2 DoD):

| Future column | Notes |
|---------------|-------|
| `organization_id` | nullable for legacy global keys |
| `created_by_user_id` | audit |
| `scopes` | e.g. `scan:write` |

Until then: document residual risk; JWT path is the multi-user surface.

### 6.8 JWT claims (access token)

| Claim | Notes |
|-------|-------|
| `sub` | user id (existing) |
| `org_id` | active organization UUID; **must** be a membership of `sub` |
| standard exp/iat | existing TTLs |

**Switch org:** endpoint issues new access (and optionally refresh) with updated `org_id`. Reject tokens whose `org_id` is not a current membership (401/403).

Refresh token: either store active org server-side or re-validate membership on refresh and re-embed `org_id`.

---

## 7. AuthZ matrix

Legend: **C** create, **R** read, **U** update, **D** delete/disable, **—** deny. Platform admin uses **admin routes only**, not this matrix, unless explicitly dual-pathed.

| Resource / action | owner | admin | member | viewer | non-member |
|-------------------|-------|-------|--------|--------|------------|
| Org profile R | R | R | R | R | — |
| Org profile U (name/slug) | U | U | — | — | — |
| Org delete / leave | D* | leave self | leave self | leave self | — |
| Invite create/revoke | C/D | C/D | — | — | — |
| Membership role change | U | U† | — | — | — |
| Remove member | D | D† | — | — | — |
| List/create scan in org | C/R | C/R | C/R | R | — |
| Scan detail / findings / export | R | R | R | R | — |
| Cancel / delete scan | U/D | U/D | U own‡ | — | — |
| Schedules CRUD | C/R/U/D | C/R/U/D | C/R/U own‡ | R | — |
| WebSocket `/ws/scan/{job_id}` | R stream | R stream | R stream | R stream | — |
| Credits balance | personal self only | same | same | same | — |
| Start scan debit | personal self | personal self | personal self | — (no start) | — |

\* Last owner cannot leave without transfer.
† Cannot demote/remove last owner; cannot escalate self beyond inviter policy (no self-promote to owner).
‡ “Own” = `resource.user_id == current_user.id` **and** same `organization_id`.

**List filters:** default history/schedules = `organization_id == jwt.org_id` **and** membership role ≥ viewer. Do **not** return other users’ jobs solely by guessing UUID.

**WebSocket (critical):** after JWT auth, load job; require membership on `job.organization_id` (or, during nullable transition, fallback: job.user_id == me **or** membership on backfilled org). Never stream on bare knowledge of `job_id` alone once multi-user is live.

**Platform `is_admin`:** may keep break-glass list-all only on `/api/admin/*`. Workspace APIs must not treat `is_admin` as org owner.

---

## 8. API sketch

Prefix under existing JWT auth. Paths illustrative; match router style in `backend/app/api/`.

### 8.1 Orgs & membership

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/orgs` | list my memberships (id, name, slug, role) |
| `POST` | `/api/orgs` | create org; creator becomes `owner` |
| `GET` | `/api/orgs/{org_id}` | org detail if member |
| `PATCH` | `/api/orgs/{org_id}` | update name/slug (owner/admin) |
| `POST` | `/api/orgs/switch` | body `{ "organization_id" }` → new tokens with `org_id` |
| `GET` | `/api/orgs/{org_id}/members` | list memberships |
| `PATCH` | `/api/orgs/{org_id}/members/{user_id}` | change role |
| `DELETE` | `/api/orgs/{org_id}/members/{user_id}` | remove member |
| `POST` | `/api/orgs/{org_id}/invites` | invite by email + role |
| `GET` | `/api/orgs/{org_id}/invites` | list pending |
| `DELETE` | `/api/orgs/{org_id}/invites/{id}` | revoke |
| `POST` | `/api/invites/accept` | body token (or path); creates membership |

### 8.2 Scans & schedules (behavior change)

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/scan/ip` etc. | set `organization_id` from JWT `org_id`; debit personal credits |
| `GET` | `/api/scan/history` | filter by active org membership |
| `GET` | `/api/scan/{id}` (+ findings, export, diff) | allow if org member per role |
| `GET/POST/PATCH/DELETE` | `/api/schedules*` | org-scoped list; create stamps `organization_id` |

### 8.3 Auth

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/auth/register` | after user row: personal org + owner membership; token includes `org_id` |
| `POST` | `/api/auth/login` / `refresh` | embed default or last `org_id` |
| `GET` | `/api/auth/me` | include `organizations[]` + `active_org_id` |

OpenAPI descriptions match existing EN style.

---

## 9. Frontend (minimum)

| Surface | Behavior |
|---------|----------|
| **Org switcher** | header/sidebar; calls switch; reloads org-scoped lists |
| **Members** | list roles; invite form (email + role) |
| **Invites** | pending list; accept deep link if email product supports |
| **History / Schedules / Job detail** | data already org-filtered; viewer hides create CTAs |
| **Credits** | still personal chip; copy clarifies “your credits”, not org pool |

Ship API+AuthZ before polished FE if needed; DoD still expects switcher + members + invite for full P2.

Brand: soft dual-brand OK (VulnScanner shell / Sinexis copy). No hard cutover in this epic.

---

## 10. Implementation slices

| Slice | Deliverable | Depends | Implement? |
|-------|-------------|---------|------------|
| **S0 Spec** | This document; approval | — | **This PR only** |
| **S1 Migration** | `organizations`, `organization_memberships`, `organization_invites`; FK on `scan_jobs.organization_id`; FK on `scan_schedules.organization_id`; backfill personal orgs + job/schedule org ids | S0 approved | Wait for implement |
| **S2 AuthZ** | membership helpers; JWT `org_id`; register auto-org; scan/schedule/WebSocket checks; pytest matrix | S1 | Wait |
| **S3 API** | org/member/invite/switch routes; history/schedule filters; OpenAPI | S2 | Wait |
| **S4 FE** | switcher, members, invite, role-gated CTAs | S3 | Wait |
| **S5 (optional follow-up)** | schedule cap **per org** 10; toward per-org API keys | S3+ | Separate PR |

**Default build order after implement verb:** S1 → S2 → S3 → S4 (S5 optional).

**Deploy:** `./scripts/deploy-services.sh` with backend (Alembic) + frontend as needed; never volume-wipe postgres. Beat unchanged except schedule queries that filter org.

---

## 11. Migration & backfill algorithm (S1)

1. Create org tables + membership + invite.
2. For each `users` row: insert org `name` like `"Personal"` or derived from email local-part; `kind=personal`; membership `owner`.
3. `UPDATE scan_jobs SET organization_id = <personal_org> WHERE user_id = ? AND organization_id IS NULL`.
4. Same for `scan_schedules`.
5. Add FKs/indexes (if column add was nullable first).
6. App create paths always set `organization_id` from JWT.
7. Idempotent: re-run safe (skip users who already own a `personal` org).

**Downtime:** prefer online nullable column + backfill + enforce in app; NOT NULL later if desired.

---

## 12. Security

- **IDOR:** every scan/schedule/ws path checks membership on resource org (see §7).
- **Invite tokens:** random, hashed at rest, expiry, single accept.
- **Slug enumeration:** detail endpoints still require membership; public slug pages out of scope.
- **SSR F / target validation:** unchanged from scan attach.
- **No secrets/PII** in this spec or committed fixtures (use `user@example.com` style only).
- **Global ApiKey:** remains powerful; treat as platform credential; do not bind to org in v1 without redesign.
- **Rate-limit** invite create per org.

---

## 13. Decisions (D1–D6) — **LOCKED** 2026-08-10

| ID | Question | **Locked default** |
|----|----------|---------------------|
| **D1** | Who is debited when member A runs a scan in org owned by B? | **Acting user A’s personal credits** |
| **D2** | When does schedule cap become per-org 10? | **S5 follow-up** after FK+UI stable; keep per-user 10 until then |
| **D3** | Can a user create multiple non-personal orgs? | **Yes**, modest cap (e.g. 5 orgs created) to limit abuse |
| **D4** | Invite to `owner` role? | **No** in v1; owner transfer is explicit separate action |
| **D5** | Nullable `organization_id` forever vs enforce NOT NULL? | **Backfill then app-required**; DB NOT NULL in a tightening migration after one release |
| **D6** | Default org on login when multi-member? | **Last used** (server field or client localStorage + switch) else personal `kind=personal` else first membership |

User signed off on recommended defaults; implement on `feat/workspace-org-membership`.

---

## 14. Acceptance checklist (from guide §5.2)

- [ ] User can create an organization (hotel or company workspace)
- [ ] Roles: `owner` \| `admin` \| `member` \| `viewer` enforced on API
- [ ] Owner/admin can invite by email; existing user can accept; pending invite for unknown email
- [ ] Scans list/detail/export/WebSocket respect **org membership** (not only job creator), per role
- [ ] Backfill: every pre-migration user has a personal org; old jobs visible in that org
- [ ] Platform admin (`is_admin`) still global; cannot read all orgs via hotel UI bugs
- [ ] Credits behavior matches documented decision (**personal** balance unchanged as wallet model)
- [ ] Tests: AuthZ matrix + migration backfill
- [ ] No Wazuh/agent code in this epic

### Extra engineering checks (recommended)

- [ ] JWT carries `org_id`; switch org rotates claim; forged org_id rejected
- [ ] Register creates personal org + owner membership
- [ ] `scan_schedules.organization_id` has real FK post-migration; historical rows backfilled
- [ ] WebSocket denies non-members (IDOR regression test)
- [ ] Viewer cannot POST scans or mutate schedules
- [ ] CI green; deploy notes mention Alembic + no volume wipe

---

## 15. Out of scope (checklist)

- [ ] Wazuh, Guard UI, agent inventory, enroll tokens as product
- [ ] Org-level credit pool / dual wallet / in-app subscription table
- [ ] Nested projects, folders, multi-property tree as first-class tenants
- [ ] Hard Sinexis brand cutover or DNS-only epic
- [ ] Full asset CMDB (P3)
- [ ] Per-org API keys as complete redesign (direction only)
- [ ] Changing platform admin into org-scoped hotel admin
- [ ] Mobile schedule multi-tenant SKU push
- [ ] SOAR, full SIEM, Windows depth
- [ ] Committing finance extracts, real emails, hosts, or API secrets

---

## 16. Test plan

| Layer | Cases |
|-------|--------|
| Unit | role helpers; invite token hash; backfill idempotency |
| API | matrix: viewer 403 on POST scan; member sees peer job in same org; outsider 404; switch org; invite accept |
| WS | member connects; non-member rejected |
| Migration | N users → N personal orgs; all jobs org_id set |
| FE (optional) | switcher changes history; invite form validation |

Do not hardcode real e2e mailbox passwords in repo; use env (`E2E_*`).

---

## 17. Rollout

1. **Approve this draft** (user).
2. Implement S1–S4 on feature branches from latest `main`; conventional commits; PR per slice if large.
3. Deploy backend migration first; verify backfill counts; then frontend switcher.
4. Dogfood: two users, one org, shared scan + viewer login.
5. Only then consider S5 cap-per-org and API key redesign notes for Guard.

---

## 18. Codebase anchors (read-only until implement)

| Area | Path |
|------|------|
| User / credits | `backend/app/models/user.py` |
| ScanJob | `backend/app/models/scan_job.py` |
| ScanSchedule (`organization_id` nullable, no FK yet) | `backend/app/models/scan_schedule.py` |
| ApiKey global | `backend/app/models/api_key.py` |
| Auth | `backend/app/services/auth.py` |
| Scanner ownership | `backend/app/services/scanner.py` |
| Schedules | `backend/app/services/schedule.py` |
| Routes | `backend/app/api/router.py` |
| WebSocket | `backend/app/api/websocket.py` |
| SPA shell | `frontend/src/components/layout/Sidebar.tsx` |
| Guide DoD | `docs/AGENT_EXECUTION_GUIDE.md` §5.2 |
| Prior spec style | `docs/specs/scan-attach-v1.md` |

Match patterns: Alembic, pytest, no bare `except`, no `as any`, **never commit on `main`**, `GIT_MASTER=1` on git, Indonesian with user.

---

## 19. References

- Roadmap: [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1 defaults, §1.3 P2, §3 Phase C2, §5.2
- Attach (shipped): [`scan-attach-v1.md`](scan-attach-v1.md)
- Commercial context: [`../commercial/sinexis-one-pager.md`](../commercial/sinexis-one-pager.md), [`../commercial/sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md)
- Schedules ops: [`../scan-schedules-ops.md`](../scan-schedules-ops.md)

---

*Approved. Implementation in progress on `feat/workspace-org-membership` (S1–S4).*
