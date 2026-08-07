# Spec: Scan Attach Loop v1 (P1)

**Status:** engineering spec for implementation — **do not implement until user explicitly says implement / kerjakan / buat** (or points at a checked acceptance slice).
**Goal:** productize recurring external scan so GMD can sell **Sinexis Scan** attach (see `docs/commercial/`).
**Non-goals:** Workspace/org multi-tenant (P2), full asset CMDB (P3), Wazuh/Guard (P5), hard rebrand, mobile-as-hero SKU.

---

## 1. Problem

Today users run **one-shot** IP/domain scans from the dashboard. Upsell needs:

1. **Schedule** (cadence without babysitting)
2. **What changed** (baseline diff vs prior completed job on same target)
3. **Manager-readable** summary (email and/or executive HTML)
4. **Credits** that still make sense with existing metering

---

## 2. Actors & tenancy (v1)

| Actor | Behavior |
|-------|----------|
| Authenticated **User** (owner of schedule) | CRUD own schedules; sees own jobs |
| Platform **admin** | May list/disable abusive schedules (optional stretch) |
| **Org** | **Out of scope** — design FKs as `user_id` now; nullable `organization_id` later **or** migrate in P2 |

AuthZ: same pattern as scans today — `resource.user_id == current_user.id` (unless admin).

---

## 3. Scope by slice (implement as separate PRs if large)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **S1 Schedule** | Model + API + Celery enqueue domain/IP | Existing scan pipeline |
| **S2 Baseline diff** | Compare findings N vs N−1; store summary | S1 or manual two jobs |
| **S3 Notify** | Email and/or in-app on new critical/high | S2 (or S1 + trivial “any critical”) |
| **S4 Executive export** | Management HTML (PDF stretch) | S2 summary fields |
| **S5 Credits + tests + deploy notes** | Policy + pytest + Playwright smoke if feasible | S1–S4 as landed |

Default build order: **S1 → S2 → S3 → S4 → S5**.

---

## 4. Data model (proposed)

### 4.1 `scan_schedules`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK users | required v1 |
| `organization_id` | UUID NULL | reserved P2 |
| `name` | str | optional label |
| `scan_type` | `ip` \| `domain` | **not** mobile in v1 schedule |
| `target` | str | normalized domain or IP |
| `cadence` | `weekly` \| `monthly` | |
| `timezone` | str | default `Asia/Jakarta` |
| `next_run_at` | timestamptz | |
| `last_run_at` | timestamptz NULL | |
| `last_job_id` | UUID NULL FK scan_jobs | |
| `enabled` | bool | default true |
| `notify_email` | str NULL | default user.email |
| `created_at` / `updated_at` | timestamptz | |

Constraints: unique active `(user_id, scan_type, target)` optional soft-unique; validate target like existing scan APIs.

### 4.2 `scan_baselines` (or columns on job)

Prefer **derived** from last two **completed** jobs for `(user_id, scan_type, target)` to avoid dual source of truth; optional cache table:

| Column | Notes |
|--------|-------|
| `job_id` | completed job |
| `fingerprint` | hash set of finding keys |
| `summary_json` | counts + new/resolved/worsened ids |

**Finding identity (diff key):** stable tuple e.g. `(title|cve|port|path normalized)` — document exact algorithm in implementation PR; must be deterministic.

### 4.3 Diff summary shape (API + email)

```json
{
  "compared_to_job_id": "...",
  "new_critical": 1,
  "new_high": 2,
  "resolved": 3,
  "worsened": 0,
  "unchanged": 10,
  "new_finding_ids": ["..."],
  "resolved_finding_ids": ["..."]
}
```

**Notify rule (v1):** send when `new_critical + new_high > 0` OR first successful baseline (optional “initial report” flag).

---

## 5. Scheduling runtime

- Reuse **Celery beat** (already used for maintenance). Add periodic task e.g. every 5–15 minutes:
  `SELECT schedules WHERE enabled AND next_run_at <= now() LIMIT N`
  For each: create `ScanJob`, enqueue existing ip/domain task, set `last_run_at`, compute `next_run_at`, link `last_job_id` when terminal.
- **Concurrency:** skip if prior scheduled job for same schedule still `pending`/`running` (no pile-up).
- **Credits:** before enqueue, same eligibility check as manual scan; if insufficient credits → disable notify once + mark schedule error state / last_error (do not infinite retry burn).
- **Idempotency:** beat tick safe to overlap (row lock or `FOR UPDATE SKIP LOCKED`).

---

## 6. API (draft)

Prefix under existing auth JWT.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/schedules` | list mine |
| `POST` | `/api/schedules` | create |
| `PATCH` | `/api/schedules/{id}` | update cadence/enabled/target |
| `DELETE` | `/api/schedules/{id}` | soft or hard delete |
| `GET` | `/api/schedules/{id}/runs` | recent jobs for schedule |
| `GET` | `/api/scan/{id}/diff` | diff vs previous completed same target |

OpenAPI descriptions in Bahasa or EN — match existing API style.

**Frontend (minimum):** Schedules page — list, create domain/IP, enable toggle; job detail shows diff badge if present. Can ship API-only first if user agrees.

---

## 7. Executive report (S4)

- Extend existing **HTML export** path with a **management** template:
  cover (target, period, risk counts), “what’s new”, top 5 critical/high, plain-language next steps (no exploit PoC).
- Bahasa-friendly copy strings.
- PDF: optional via HTML print or library — **stretch**; HTML download is MVP.

---

## 8. Notifications (S3)

- Prefer existing SMTP settings used for auth mail.
- Template: subject `[Sinexis Scan] N temuan baru critical/high — {target}`.
- Body: counts + link to `FRONTEND_URL` job detail.
- Rate-limit: max one mail per schedule per completed job.

---

## 9. Security & abuse

- Cap schedules per user (e.g. Basic 1, Pro 3, Multi 10) — enforce constants or settings; commercial tiers documented in SKU doc (hard caps can be global until billing entitlements exist).
- Same SSRF / target validation as manual scans.
- No secrets in schedule rows.
- Admin kill-switch setting optional.

---

## 10. Acceptance criteria (Definition of Done)

### S1 Schedule

- [ ] User can create weekly/monthly domain schedule via API (and UI if in scope)
- [ ] Beat enqueues job within one tick after `next_run_at`
- [ ] Overlap skipped while job running
- [ ] pytest for create/list/authz isolation

### S2 Diff

- [ ] Two completed jobs same user/type/target → `GET .../diff` returns stable counts
- [ ] New critical finding appears under `new_*`
- [ ] Unit tests for fingerprint stability

### S3 Notify

- [ ] With SMTP test double, mail sent iff new critical/high
- [ ] No mail on zero new high/critical (unless initial-report flag on)

### S4 Report

- [ ] Executive HTML includes diff section and top findings
- [ ] No raw customer PII beyond target + account email

### S5

- [ ] Insufficient credits → no enqueue + visible error
- [ ] CI green; deploy via `deploy-services.sh` for backend/workers/beat
- [ ] Docs: short operator note (env, beat must run)

### Explicitly not required for P1 DoD

- [ ] Org membership
- [ ] Wazuh
- [ ] Perfect PDF pixel polish
- [ ] Mobile schedules

---

## 11. Implementation notes (codebase anchors)

| Area | Path (approx.) |
|------|----------------|
| Models | `backend/app/models/` |
| Scan create / credits | `backend/app/services/scanner.py` |
| Routes | `backend/app/api/` |
| Workers | `workers/tasks/` |
| Beat | `workers/celery_app.py` + existing maintenance schedule |
| Export | existing scan export HTML |
| SPA | `frontend/src/pages/` (new Schedules) |

Match existing patterns: Alembic migration, pytest, no `as any` / bare except, conventional commits on `feat/scan-schedule-*` branches **from latest main**.

---

## 12. Test plan

| Layer | Cases |
|-------|--------|
| Unit | next_run_at monthly/weekly TZ; diff fingerprint; credit gate |
| API | authz other user 404; create validation bad IP |
| Integration | beat tick → job row (may mock enqueue) |
| E2E (optional) | create schedule with `E2E_PASSWORD` secrets — do not hardcode passwords |

---

## 13. Rollout

1. Migrate + deploy backend + workers + **celery_beat**
2. Feature flag or admin-only enable if needed
3. Internal dogfood on one schedule
4. Pilot customer (hybrid OK)
5. Sales uses commercial SKU doc

---

## 14. Open engineering questions (resolve in implement PR)

- [ ] Exact finding fingerprint fields per scan_type
- [ ] Store diff on job row vs separate table
- [ ] In-app notification center vs email-only v1
- [ ] Cap limits: settings vs hardcode

---

## 15. References

- Commercial: [`../commercial/sinexis-one-pager.md`](../commercial/sinexis-one-pager.md), [`../commercial/sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md)
- Roadmap: [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3, §3 Phase C1
