# Spec: Guard v1 (P5 — Wazuh thin)

**Status:** **S0–S5 + Http on `main`** (#273 spek, #274 thin, **#275** `HttpWazuhClient` @ merge `28bc69e`). Manager JWT, groups, agents list, enroll+key, Indexer critical search (field whitelist). CI/default: `GUARD_MOCK_WAZUH=true`. Live residual **human:** edge deploy tip + lab env on **deploy host only** + smoke; then `GUARD_MOCK_WAZUH=false`. S0 D1–D10 remain source of truth. **Not** full SIEM.
**Goal:** second upsell surface — **agent inventory + critical alerts + per-org enroll** — without shipping a SIEM.
**Epic:** P5 per [`docs/AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3, §3 Phase E, §5.3.
**Branch convention:** S0 on `main` via docs PR; implement on `feat/guard-*`.

---

## 1. Problem

Scan attach (P1) and Workspace (P2) cover **periodic exposure checks** shared by a team. Runtime host compromise still needs a **sensor bus**:

| Gap today | Pain |
|-----------|------|
| No agent inventory | AM cannot show “which VPS are watched” for Secure upsell |
| No critical runtime signal | Customer only sees scan diffs; silent post-breach |
| Global `ApiKey` only | Unfit as multi-tenant agent / enroll identity |
| No org-scoped enroll | Would force shared Wazuh credentials → cross-tenant risk |

Commercial: Guard is **second line** after Scan attach on colo/VPS; hospitality multi-asset later. Not a replacement for Scan SKU.

---

## 2. Goals

1. **Org-scoped Guard workspace** on active JWT `org_id` (reuse Workspace membership + roles).
2. **Agent inventory** per org: name, status, last-seen, optional IP/version — projected DTOs only.
3. **Critical alerts list** per org: rule level, description, time, agent — **no** raw `full_log` UI.
4. **Per-org enroll** via SaaS-issued token (hash at rest) + **server-side** manager enroll proxy.
5. **One shared lab/manager** (Pattern A): isolation = **agent group** `org_<uuid>` + SaaS ACL + optional agent labels for indexer filters.
6. **Poll workers** (inventory + alerts) with watermarks; mockable client for pytest without live Wazuh.
7. **Settings/env** for manager + indexer URLs and service credentials — **never** in public markdown with real hosts/secrets.
8. **Thin SPA**: `/guard` inventory + alerts + enroll snippet; Sidebar entry.
9. Tests: AuthZ matrix (viewer vs admin), IDOR across orgs, enroll hash, mock sync.
10. Docs: this spek + guide/handoff/README status; ops runbook later (private host notes).

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **Full SIEM / Discover / raw log search** | Scope creep; P5 is inventory + critical only |
| **SOAR, cases, correlation, active-response UI** | Later / never v1 |
| **Per-tenant Wazuh managers** | Cost/ops; Pattern B later for enterprise only |
| **Customer access to Wazuh dashboard** | Isolation false friends (OpenSearch tenants ≠ agents) |
| **Webhooks to customer endpoints** | Poll first; integrator later |
| **Force Wazuh events into `scan_findings`** | Separate domain; guide §4 |
| **Reuse global `ApiKey` as org enroll** | Redesign; store Guard enroll hashes in own tables |
| **Same PR epic as Workspace rewrite** | Workspace already shipped; Guard is additive |
| **Hard rebrand / domain cutover** | P4 soft already; must not gate Guard |
| **P3 full asset registry** | Agents are not assets; optional link: [`asset-guard-link.md`](asset-guard-link.md) |
| **Committing manager IPs, passwords, customer agent lists** | Public repo hygiene |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| **Runtime topology** | **D1** Single shared manager + indexer (lab/GMD); multi-tenant via **groups** |
| **Tenant boundary** | **D2** Wazuh group name `org_<organization_id without hyphens or with hyphens — pick one in S1 and stick>` + row in SaaS `guard_org_bindings` |
| **Credentials** | **D3** Only SaaS service account (manager JWT + indexer read user). **Never** give tenants manager password |
| **Enroll** | **D4** SaaS proxy: validate org enroll token → `POST /agents` (manager) → assign group → return one-time key/install snippet to caller once |
| **Inventory source** | **D5** Manager `GET /agents?group=…` (`lastKeepAlive`, `status`, `name`, `id`, …) |
| **Alerts source** | **D6** Indexer `wazuh-alerts-*` search; **`rule.level >= 12`** (configurable `GUARD_ALERT_MIN_LEVEL`, default 12); field whitelist |
| **Delivery** | **D7** Celery/beat **poll** (inventory ~5m, alerts ~1–2m); no customer webhook v1 |
| **UI raw logs** | **D8** No `full_log` / full payload in SPA |
| **AuthZ** | **D9** List inventory/alerts: **viewer+**; create/rotate enroll, enable Guard: **admin+**; platform `is_admin` ≠ org owner |
| **Disable path** | **D10** Soft-disable agent in SaaS; hard delete in Wazuh = ops runbook only |
| **Language** | Spec English; user chat Bahasa; UI dual-brand soft (Sinexis Guard / engine whisper) |
| **When Wazuh down** | API returns last synced snapshot + `sync_error` / degraded flag; do not 500 entire app |

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **Org viewer** | Read agents + critical alerts in active org |
| **Org member** | Same as viewer for Guard v1 (no enroll) — keep matrix simple |
| **Org admin / owner** | Enable Guard, create/revoke enroll tokens, view install snippet once |
| **Platform admin** | Ops health of manager link; **not** automatic access to all orgs’ agents via hotel UI bugs |
| **SaaS worker** | Holds Wazuh service credentials; polls and writes projected rows |
| **Host agent** | Wazuh agent on customer VPS/colo; talks to manager, not to browser |

---

## 6. Architecture (thin)

```text
┌──────────────┐   JWT org_id    ┌─────────────────────┐
│ SPA /guard   │ ──────────────► │ FastAPI Guard API    │
│ inventory +  │ ◄────────────── │ org AuthZ + DTOs     │
│ critical +   │                 │ enroll proxy         │
│ enroll UI    │                 └──────────┬──────────┘
└──────────────┘                            │
                               ┌────────────┼────────────┐
                               ▼            ▼            │
                         Manager API   Indexer API       │
                         agents/groups  alerts search    │
                               ▲                         │
                               │ agents                  │
                         Customer hosts                  │
```

**Wazuh is an implementation detail** behind the control plane. Product APIs are org-scoped only.

---

## 7. Data model (proposed)

Align with existing SQLAlchemy style (`UUID`, timestamptz, CheckConstraints, Alembic descriptive revision ids). Names illustrative.

### 7.1 `guard_org_bindings`

Maps org → Wazuh group / enablement.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK organizations | **UNIQUE**; ON DELETE CASCADE |
| `wazuh_group` | str(128) | e.g. `org_<uuid>` |
| `enabled` | bool | default false until admin enables |
| `last_inventory_sync_at` | timestamptz NULL | |
| `last_alert_sync_at` | timestamptz NULL | |
| `last_sync_error` | text NULL | sanitized; no secrets |
| `created_at` / `updated_at` | timestamptz | |

### 7.2 `guard_agents`

Projected inventory (cache of manager view).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | SaaS id |
| `organization_id` | UUID FK | ON DELETE CASCADE; indexed |
| `wazuh_agent_id` | str(32) | manager agent id; unique per org or globally with org |
| `name` | str(255) | |
| `status` | str | `active` \| `disconnected` \| `pending` \| `never_connected` \| `unknown` |
| `ip` | str(64) NULL | optional |
| `version` | str(64) NULL | |
| `last_keep_alive` | timestamptz NULL | from manager |
| `synced_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

**Constraints:** `UNIQUE (organization_id, wazuh_agent_id)`.

### 7.3 `guard_alerts`

Projected critical alerts (deduped).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK | CASCADE; indexed |
| `external_id` | str(128) | indexer `_id` or composite; **UNIQUE (organization_id, external_id)** |
| `rule_id` | str(32) NULL | |
| `rule_level` | int | |
| `rule_description` | str(512) | |
| `agent_wazuh_id` | str(32) NULL | |
| `agent_name` | str(255) NULL | |
| `occurred_at` | timestamptz | alert timestamp |
| `synced_at` | timestamptz | |
| `created_at` | timestamptz | |

**No** column for full_log / raw JSON in v1 product table (optional ops-only later behind flag — default off).

### 7.4 `guard_enroll_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK | CASCADE |
| `token_hash` | str(64) | **sha256** of raw token (same pattern as org invites) |
| `label` | str(128) NULL | |
| `created_by_user_id` | UUID FK users | |
| `expires_at` | timestamptz | e.g. 24h |
| `revoked_at` | timestamptz NULL | |
| `used_at` | timestamptz NULL | optional one-time |
| `created_at` | timestamptz | |

**Rules:** store hash only; raw token returned **once** on create; enroll endpoint accepts raw token (or install script calls backend with token).

### 7.5 Migration

- New Alembic revision e.g. `add_guard_tables`, `down_revision = "add_workspace_orgs"`.
- No backfill required beyond empty tables.
- Register models for metadata; import in tests `conftest` if needed.

---

## 8. AuthZ matrix

| Action | viewer | member | admin | owner | platform admin |
|--------|--------|--------|-------|-------|----------------|
| List agents / alerts (active org) | ✓ | ✓ | ✓ | ✓ | only if also org member **or** dedicated ops route (prefer membership) |
| Enable Guard / set binding | — | — | ✓ | ✓ | — |
| Create / revoke enroll token | — | — | ✓ | ✓ | — |
| Redeem enroll (token) | public-ish endpoint with **token** secret; rate-limited | | | | |
| Cross-org id access | **403/404** always | | | | |
| Call Wazuh with user JWT | **Forbidden** — server only | | | | |

Use `require_membership` + `role_at_least` from `organization.py`. Stamp all rows with `organization_id` from JWT active org (never trust client body org id without check).

---

## 9. API (proposed)

Prefix: `/api/guard` (register in `router.py`). All JWT unless noted.

| Method | Path | Min role | Behavior |
|--------|------|----------|----------|
| `GET` | `/api/guard/status` | viewer | Binding enabled?, last sync, degraded error |
| `POST` | `/api/guard/enable` | admin | Create group on manager (or record intent + mock); upsert binding |
| `GET` | `/api/guard/agents` | viewer | List projected agents for active org |
| `GET` | `/api/guard/alerts` | viewer | List recent critical alerts (limit/cursor) |
| `POST` | `/api/guard/enroll-tokens` | admin | Create token; return raw once + expires |
| `GET` | `/api/guard/enroll-tokens` | admin | List metadata (no raw) |
| `DELETE` | `/api/guard/enroll-tokens/{id}` | admin | Revoke |
| `POST` | `/api/guard/enroll` | **enroll token** (header or body) | Proxy manager agent create + group; return key + manager host from **settings** (not user-supplied) |
| `POST` | `/api/guard/sync` | admin or internal | Optional manual sync trigger; worker also periodic |

**Internal worker tasks** (not public): `guard.sync_inventory`, `guard.sync_alerts` — iterate enabled bindings, filter by group, upsert rows, advance watermarks.

OpenAPI: English descriptions consistent with existing routes.

---

## 10. Config / env (names only)

Document in `.env.example` with **placeholders**; never real lab IPs in git.

| Env | Purpose |
|-----|---------|
| `WAZUH_MANAGER_URL` | Manager API base (e.g. `https://manager:55000`) |
| `WAZUH_MANAGER_USER` / `WAZUH_MANAGER_PASSWORD` | Service account |
| `WAZUH_INDEXER_URL` | Indexer base |
| `WAZUH_INDEXER_USER` / `WAZUH_INDEXER_PASSWORD` | Read-only preferred |
| `WAZUH_VERIFY_TLS` | bool; lab may disable with documented risk |
| `GUARD_ALERT_MIN_LEVEL` | default `12` |
| `GUARD_ENABLED` | master kill-switch for feature routes/workers |
| `GUARD_MOCK_WAZUH` | if true, in-memory/fake client for dev/CI |

Map to `Settings` in `backend/app/config.py` (`wazuh_*`, `guard_*`).

---

## 11. Frontend (minimum)

| Surface | Behavior |
|---------|----------|
| Route | `/guard` under `ProtectedRoute` + `AppShell` (lazy page) |
| Sidebar | Nav item **Guard** (Shield icon already used elsewhere — pick distinct or reuse carefully) |
| Status | Enabled / last sync / error banner |
| Agents table | name, status, last-seen |
| Alerts list | time, level, rule description, agent |
| Enroll (admin) | Generate token + copy install one-liner (points at **SaaS** enroll URL, not manager) |
| Empty | Copy: enable Guard + install agent on VPS |

Client: `frontend/src/api/guard.ts` importing shared `api` from `scans.ts`.

---

## 12. Implementation slices

| Slice | Deliverable | Depends | Code? |
|-------|-------------|---------|-------|
| **S0 Spec + docs** | This file; guide/handoff/README tip + P5 un-park **thin** + risk accept note | User request | **This PR** |
| **S1 Schema + settings** | Models + Alembic `add_guard_tables`; Settings + `.env.example`; `GUARD_MOCK` client interface | S0 | Wait implement |
| **S2 Services** | Wazuh client (auth JWT cache, agents, groups, indexer search); enroll proxy; sync upsert | S1 | Wait |
| **S3 API + AuthZ** | `guard_routes.py`; tests IDOR + roles + mock enroll | S2 | Wait |
| **S4 Workers** | Beat/celery poll tasks; optional manual sync | S2 | Wait |
| **S5 FE** | `guard.ts`, page, Sidebar, App route; basic tests | S3 | Wait |

**Recommended build order:** S0 → S1 → S2 → S3 → S4 → S5 (S4 can parallel S5 after S3 contract stable).

**Deploy:** backend + worker/beat + frontend via `deploy-services.sh`; no postgres volume wipe; Wazuh remains **external** (not required in `docker-compose.yml` v1).

---

## 13. Security

- **IDOR:** every list/detail filters `organization_id` + membership.
- **Enroll tokens:** high entropy; hash at rest; TTL; revoke; rate-limit redeem.
- **No browser → manager:** JWT to SaaS only; manager JWT cached server-side, refresh on 401.
- **Indexer:** least privilege read user; always constrain by org group/label or agent id set from DB.
- **No full_log in API responses** for v1 list endpoints.
- **Secrets:** env/vault on deploy host only; public repo placeholders.
- **Default group:** never leave customer agents in Wazuh `default` group.
- **Global ApiKey:** unchanged; not Guard enroll.

---

## 14. Decisions (D1–D10) — **LOCKED defaults** 2026-08-10

| ID | Decision |
|----|----------|
| **D1** | Single shared manager + indexer; group-per-org |
| **D2** | SaaS `guard_org_bindings` + `wazuh_group` string |
| **D3** | No tenant Wazuh credentials |
| **D4** | Enroll via SaaS proxy + hashed org tokens |
| **D5** | Inventory from Manager agents API |
| **D6** | Alerts from Indexer; min level 12 default |
| **D7** | Polling workers; no customer webhooks v1 |
| **D8** | No raw log UI |
| **D9** | viewer read; admin+ enroll/enable |
| **D10** | Soft lifecycle in product; hard delete ops-only |

User may override before S1 code; changes must update this table.

---

## 15. Acceptance checklist (DoD thin)

- [ ] Spec S0 merged; guide/handoff/README reflect P5 thin + risk accept
- [ ] Migration creates Guard tables; head after `add_workspace_orgs`
- [ ] Admin can enable Guard for active org (real or mock)
- [ ] Admin can create enroll token; redeem creates agent under org group (mock OK in CI)
- [ ] Viewer can list agents + critical alerts **only** for orgs they belong to
- [ ] Cross-org agent/alert id → 404/403
- [ ] Sync job updates `last_*_sync_at` or records sanitized error
- [ ] SPA `/guard` shows inventory + alerts + enroll for admin
- [ ] No Wazuh passwords or lab IPs in git
- [ ] Tests with `GUARD_MOCK_WAZUH` (or equivalent) pass without live manager
- [ ] Explicit **non-goals** still true (no SIEM UI)

### Residual / out of DoD

- Live lab manager smoke (private ops)
- Customer webhook, multi-manager, dashboard SSO
- GTM finance `service_id` for Guard SKU (human; commercial docs later)

---

## 16. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Scope creep to SIEM | Non-goals + thin DoD; reject Discover-like features in PR review |
| Cross-tenant agent leak | Dual filter: DB org_id + manager `group=` query; IDOR tests |
| Wazuh unavailable | Degraded status; cached rows; feature kill-switch |
| Enroll abuse | TTL, rate limit, revoke, unique agent names `org_…-…` |
| AI/time waste | S0 first; implement slice-by-slice; mock CI |
| Confusion with Scan findings | Separate tables/routes/nav; no dual-write to `scan_findings` |

---

## 17. References (code anchors)

| Area | Path |
|------|------|
| Org AuthZ | `backend/app/services/organization.py` (`require_membership`, `role_at_least`, invite hash) |
| JWT org | `backend/app/services/auth.py` (`get_current_user`, `get_active_org_id`) |
| Router | `backend/app/api/router.py` |
| Settings | `backend/app/config.py` |
| Alembic head (pre-Guard) | `backend/alembic/versions/add_workspace_orgs.py` |
| FE patterns | `frontend/src/api/schedules.ts`, `App.tsx`, `Sidebar.tsx` |
| Workspace spek style | `docs/specs/workspace-v1.md` |
| Priority | `docs/AGENT_EXECUTION_GUIDE.md` |

External: Wazuh Manager API (agents, groups, auth), Indexer alert search — implement against current Wazuh docs; pin behavior in client tests.

---

## 18. Open questions (non-blocking for S0)

1. Exact `wazuh_group` string format (hyphens stripped or not).
2. One-time vs multi-use enroll tokens (default: multi-use until expiry/revoke **or** one-time — prefer **multi-use with TTL** for several hosts, revoke on incident).
3. Whether `POST /api/guard/enable` creates Wazuh group immediately or lazy on first enroll.
4. Guard SKU price line in commercial docs (human/P0 follow-up).

Record answers in this section when decided; do not block S1 on commercial price.
