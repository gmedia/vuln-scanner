# Spec: SIEM v1 (P7 — control-plane search + cases)

**Status:** **S0 draft** — spek only. **Do not implement S1+** until the user explicitly says implement / kerjakan / buat (or points at a checked slice) **and** §11 open questions that block tenant isolation are answered.
**Goal:** first **product SIEM surface** for orgs that already run **Guard thin** — org-scoped event search + incident cases — **without** giving tenants the Wazuh/OpenSearch dashboard or a full SOC platform.
**Epic:** **P7** (new). Does **not** replace P5 Guard. Does **not** jump P3 Assets or GTM.
**Depends:** P5 Guard thin on `main` ([`guard-v1.md`](guard-v1.md) D1–D10) · P2 Workspace (JWT `org_id`, membership) · live Manager+Indexer (lab `tc3`) for later smoke only.
**Not this epic:** SOAR, active-response UI, per-tenant managers, customer dashboard SSO, merging events into `scan_findings`.

---

## 0) Relation to Guard (read first)

| Surface | Job | Route |
|---------|-----|--------|
| **Guard (P5, shipped)** | Upsell Secure: “host watched + critical only” | `/guard` — inventory, level ≥12, enroll |
| **SIEM (this spec)** | Analyst / ops: search more events, open cases | **New** `/siem` (or `/detect`) — **not** a rewrite of `/guard` |

**Hard rule:** do **not** ship Discover, raw logs, or cases **under** “Guard.” Guard copy and non-goals stay. SIEM is a **second product module**. Commercial SKU line is a **human/P0 follow-up** (not invented here).

If the user later wants “everything on one page,” that is a **navigation** decision after S5 — not a reason to delete Guard thin.

---

## 1. Problem

Guard v1 is working as designed: one lab agent, critical table empty until level ≥12. That is **not** enough when:

| Gap | Pain |
|-----|------|
| Only critical projected rows | Analyst cannot prove “what happened at 02:00” for a host |
| No case / ack | AM and ops track incidents in chat |
| Indexer is shared | Naive Discover = **cross-tenant leak** |
| Customer asks for “SIEM” | Sales may promise Wazuh dashboard — **unsafe** on shared manager |

Need a **controlled** search + case layer in the SaaS, still Pattern A (one manager).

---

## 2. Goals

1. **Org-scoped event search** over Indexer `wazuh-alerts-*`, always constrained by that org’s agent set / group (never a global `*` query).
2. **Field policy:** default **whitelist** (rule, agent, timestamp, decoder, mitre id if present). **`full_log` off** until §11 Q1 is **yes** and a separate flag is on.
3. **Time range + level filter** (e.g. 7–15), pagination/cursor; hard **max window** and **max page size**.
4. **Incident cases:** create from an event (or manually); status `open` \| `ack` \| `closed`; assignee = org member; notes **without** pasting unrestricted raw dumps by default.
5. **AuthZ:** viewer+ search/list cases; member+ comment; admin+ close/delete case policy (lock in S1 to match Workspace).
6. **SPA `/siem`:** search form + results table + case list/detail. Sidebar item **distinct** from Guard.
7. **Reuse** `HttpWazuhClient` / Guard binding; **new** tables for cases + optional search audit — do not overload `guard_alerts` as a SIEM warehouse.
8. **Tests:** IDOR across orgs, query injection (must not accept raw DSL from client), role matrix, mock Indexer.
9. **Docs:** this file + guide P7; **no** IPs, passwords, customer host lists in git.
10. **Degraded:** Indexer down → last error + empty/partial; app must not 500.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **Replace `/guard` or raise Guard min-level as “SIEM”** | Breaks thin upsell contract |
| **Customer Wazuh Dashboard / OpenSearch Dashboards** | Tenants ≠ OpenSearch tenants; shared cluster |
| **Raw OpenSearch DSL from the browser** | Injection + cross-index |
| **SOAR, playbooks, active-response buttons** | P8+ or never v1 |
| **Correlation engine / UEBA / ML** | Out of v1 |
| **Per-tenant Wazuh managers (Pattern B)** | Cost; enterprise later |
| **Webhooks / SIEM-to-customer** | Integrator later |
| **Force events into `scan_findings`** | Separate domain |
| **Full log retention product / hot-warm tiers UI** | Ops/Indexer only |
| **Windows depth / Sysmon pack as product** | Optional later |
| **Same PR as P3 Assets** | Different module |
| **PII / lab IPs / enroll keys in markdown** | Public repo |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| **Topology** | Same as Guard **D1**: one shared manager + indexer; isolate by **group + SaaS agent inventory** |
| **Query path** | SaaS builds Indexer query server-side from **structured** filters only |
| **Tenant predicate** | `agent.id` **IN** org’s `guard_agents.wazuh_agent_id` **AND/OR** documented group/label filter — **both** if feasible; never trust client agent list alone |
| **Min level (search)** | Default **7** (configurable `SIEM_SEARCH_MIN_LEVEL`); Guard list stays **12** |
| **Max lookback** | **7 days** v1 (`SIEM_MAX_LOOKBACK_HOURS=168`) |
| **Page size** | Max **50** |
| **full_log** | **Off** in API (`SIEM_INCLUDE_FULL_LOG=false`) |
| **Cases** | Stored in **Postgres**; not Wazuh “cases” plugin |
| **Delivery** | On-demand search (no second hot warehouse). Optional later: async export |
| **Kill switch** | `SIEM_ENABLED` (default false in CI until S3+); Guard remains independently `GUARD_*` |
| **Mock** | `GUARD_MOCK_WAZUH` (or `SIEM_MOCK`) returns canned hits in pytest |
| **When Indexer down** | 200 + `degraded` / empty hits + sanitized error — same philosophy as Guard |
| **Language** | Spec English; user chat Bahasa; UI dual-brand soft |

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **Org viewer** | Search events (policy fields); list/read cases in active org |
| **Org member** | + add case comment; create case from hit |
| **Org admin / owner** | + close cases; retention/policy flags later |
| **Platform admin** | Cluster health only; **not** all-org event browser via hotel UI bugs |
| **SaaS API** | Only process holding Indexer credentials |
| **Host agent** | Unchanged — still talks to manager, not browser |

---

## 6. Architecture (thin SIEM)

```text
┌─────────────┐  structured filters   ┌──────────────────────┐
│ SPA /siem   │ ────────────────────► │ FastAPI SIEM API     │
│ search+case │ ◄──────────────────── │ AuthZ + query builder│
└─────────────┘                       └──────────┬───────────┘
                                                 │
                    ┌────────────────────────────┼──────────┐
                    ▼                            ▼          │
             Postgres cases              Indexer search     │
             + guard_agents              (whitelist query)  │
                    ▲                            ▲          │
                    │ inventory                  │          │
             Guard sync (existing)          Wazuh agents    │
```

**Never:** browser → Indexer. **Never:** pass-through JSON query body.

---

## 7. Data model (proposed)

Illustrative names; match existing SQLAlchemy/Alembic style.

### 7.1 `siem_cases`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK | CASCADE; indexed |
| `title` | str(255) | |
| `status` | str | `open` \| `ack` \| `closed` |
| `severity` | int NULL | denorm from seed event level |
| `created_by_user_id` | UUID FK | |
| `assignee_user_id` | UUID FK NULL | must be org member |
| `created_at` / `updated_at` / `closed_at` | timestamptz | |

### 7.2 `siem_case_events`

Link case ↔ indexer hit (by `external_id`, not raw blob).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `case_id` | UUID FK | CASCADE |
| `organization_id` | UUID FK | denorm for IDOR |
| `external_id` | str(128) | Indexer `_id` |
| `rule_id` / `rule_level` / `rule_description` | as Guard alerts | projected |
| `agent_wazuh_id` / `agent_name` | | |
| `occurred_at` | timestamptz | |
| `created_at` | timestamptz | |

**UNIQUE** `(case_id, external_id)`.

### 7.3 `siem_case_notes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `case_id` | UUID FK | |
| `author_user_id` | UUID FK | |
| `body` | text | length cap (e.g. 8k); **no** secret scraping required in v1 |
| `created_at` | timestamptz | |

### 7.4 Optional `siem_search_audit`

Org, user, time range, hit count, hashed filter summary — for abuse review. Defer if S1 too large; call out in PR.

### 7.5 What we do **not** add in v1

- Copying all Indexer documents into Postgres
- `full_log` column on product tables (same as Guard D8)
- FK from cases to `scan_findings`

### 7.6 Migration

- New revision e.g. `add_siem_tables`; `down_revision` = current Guard head at implement time.
- No backfill.

---

## 8. AuthZ matrix

| Action | viewer | member | admin | owner | platform admin |
|--------|--------|--------|-------|-------|----------------|
| Search events (active org) | ✓ | ✓ | ✓ | ✓ | only if org member |
| List/get cases | ✓ | ✓ | ✓ | ✓ | membership |
| Create case + attach event | — | ✓ | ✓ | ✓ | — |
| Add note | — | ✓ | ✓ | ✓ | — |
| Ack / close / reassign | — | — | ✓ | ✓ | — |
| Cross-org case or event id | **403/404** | | | | |
| Raw Indexer credentials | **never** | | | | |

Reuse `require_membership` + `role_at_least`. Stamp `organization_id` from JWT only.

---

## 9. API (proposed)

Prefix: `/api/siem`. JWT unless noted. Register only if `SIEM_ENABLED` or always 404 when off (pick one in S1; prefer **404/403 feature flag**).

| Method | Path | Min role | Behavior |
|--------|------|----------|----------|
| `GET` | `/api/siem/status` | viewer | Flag enabled, Indexer reachability, lookback/min-level policy |
| `GET` | `/api/siem/events` | viewer | Query params: `since`, `until`, `min_level`, `max_level`, `agent_id`, `q` (simple string on **whitelisted** fields only), cursor |
| `GET` | `/api/siem/events/{external_id}` | viewer | One projected hit; 404 if not in org predicate |
| `GET` | `/api/siem/cases` | viewer | List |
| `POST` | `/api/siem/cases` | member | Create; optional `external_id` seed |
| `GET` | `/api/siem/cases/{id}` | viewer | Detail + events + notes |
| `PATCH` | `/api/siem/cases/{id}` | admin | status, assignee, title |
| `POST` | `/api/siem/cases/{id}/events` | member | Attach another hit |
| `POST` | `/api/siem/cases/{id}/notes` | member | Add note |

**Reject:** request body containing `query` / `dsl` / raw bool JSON for OpenSearch.

OpenAPI English, same style as Guard.

---

## 10. Config / env (names only)

Placeholders in `.env.example` only.

| Env | Purpose |
|-----|---------|
| `SIEM_ENABLED` | Master switch (CI default false) |
| `SIEM_SEARCH_MIN_LEVEL` | Default 7 |
| `SIEM_MAX_LOOKBACK_HOURS` | Default 168 |
| `SIEM_INCLUDE_FULL_LOG` | Default false |
| `SIEM_MAX_PAGE_SIZE` | Default 50 |
| Indexer/Manager | **Reuse** existing `WAZUH_*` — do not duplicate passwords |

---

## 11. Open questions (**some block S1**)

Answer in this section before coding slices that depend on them.

| # | Question | Blocks | Default if unanswered |
|---|----------|--------|------------------------|
| **Q1** | May API ever return `full_log` (even admin-only)? | Search DTO | **No** |
| **Q2** | Tenant filter: agent-id allowlist only vs group/label only vs **both**? | Query builder | **Both** if Indexer fields reliable; else agent-id from `guard_agents` |
| **Q3** | Route/nav: `/siem` vs `/detect` vs under Workspace? | FE | **`/siem`** |
| **Q4** | SKU: included in Secure or separate SIEM line? | Commercial copy only | **Do not invent price**; human P0 |
| **Q5** | Retention: who pays Indexer disk if search lookback grows? | Ops | Keep **7d** product window |
| **Q6** | Should viewer see search at all (noisy / legal)? | AuthZ | **Yes** (same as Guard viewer read) |
| **Q7** | Export CSV? | S5+ | **Out** of v1 |

---

## 12. Frontend (minimum, after S3)

| Surface | Behavior |
|---------|----------|
| Route | `/siem` — `ProtectedRoute` + `AppShell` |
| Sidebar | **SIEM** (or Detect) — **not** a tab that hides Guard |
| Search | Time range, level, agent dropdown from Guard inventory, text `q` |
| Results | time, level, rule, agent — click → detail drawer (projected fields) |
| Cases | list + detail + notes |
| Empty | “Pasang agen di Guard dulu” if no agents |
| Copy | Bahasa + English soft brand; **never** “Open Wazuh dashboard” |

---

## 13. Implementation slices

| Slice | Deliverable | Code? |
|-------|-------------|-------|
| **S0** | This file; guide P7 + “do not implement under Guard” | **This PR** |
| **S1** | Models + Alembic + Settings + flag | Wait implement + Q2 |
| **S2** | Query builder + Indexer methods (mockable); **no** raw DSL | Wait |
| **S3** | `/api/siem` + AuthZ + IDOR tests | Wait |
| **S4** | Cases CRUD + notes | Wait (can follow S3) |
| **S5** | SPA `/siem` + Sidebar | Wait |

**Build order:** S0 → S1 → S2 → S3 → S4 → S5.

**Deploy:** backend (+ frontend for S5). Wazuh stays external. No compose Wazuh service required.

---

## 14. Security

- **IDOR** on every event and case id.
- **Query builder allowlist** only; fuzz tests with `q` containing `OR *`, JSON, Lucene meta.
- **Agent allowlist** from DB at request time (stale inventory → miss events, **not** leak others).
- **Rate-limit** search (per org/user).
- **No** `full_log` unless Q1 flipped + flag.
- **Audit** optional but recommended for search.
- Secrets: existing Wazuh env on deploy host only.

---

## 15. Decisions (D1–D8) — **S0 defaults** 2026-08-14

| ID | Decision |
|----|----------|
| **D1** | New module **P7 SIEM**; Guard P5 stays thin |
| **D2** | Shared manager; tenant = Guard group + agent inventory |
| **D3** | Server-side structured search only |
| **D4** | Cases in Postgres, not Wazuh plugins |
| **D5** | `full_log` default off |
| **D6** | Search min level 7; Guard alerts stay 12 |
| **D7** | Max lookback 7 days |
| **D8** | No customer dashboard / no raw DSL |

User may override in this table before S1.

---

## 16. Acceptance (DoD S0)

- [x] Spek exists; P7 named; Guard non-goals untouched in spirit
- [ ] Guide + README mention P7 **draft only**
- [ ] No S1+ code in the S0 PR
- [ ] No lab IPs / secrets in the spek

**DoD for a future S5 (not this PR):** viewer in org A cannot see org B hits; search works with mock; cases CRUD; SPA separate from `/guard`; flag off in CI default.

---

## 17. Risks

| Risk | Mitigation |
|------|------------|
| Sales demo = Wazuh URL | Spek + AM: product is `/siem` only |
| Cross-tenant search | Dual predicate + tests |
| Scope → SOAR | Non-goals; reject playbook PRs |
| Indexer cost | 7d cap + page cap |
| Confusion with Guard empty critical | Product copy: two jobs, two pages |
| Agent implements under `/guard` | Guide: reject; this file wins for SIEM |

---

## 18. References

| Area | Path |
|------|------|
| Guard thin | `docs/specs/guard-v1.md` |
| Guide | `docs/AGENT_EXECUTION_GUIDE.md` |
| Wazuh client | `backend/app/services/wazuh_client.py` |
| Guard service | `backend/app/services/guard.py` |
| Org AuthZ | `backend/app/services/organization.py` |

External: Wazuh Indexer / OpenSearch query DSL — **implementer** reads current docs at S2; pin examples in unit tests only (no live hosts in git).
