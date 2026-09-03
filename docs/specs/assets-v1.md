# Spec: Asset registry v1 (P3 — light)

**Status:** **S1–S5 on `main`** (#380 + follow-up). CRUD, SKU **hard cap**, SPA `/assets`, 1:1 schedule, `POST /api/assets/{id}/schedules`, `GET /api/assets/pack` JSON hook. §11 locked: hard block · top-level `/assets` · 1:1.
**Goal:** light **named assets** so Multi-asset / Pro tiers can schedule and report against labeled targets without a full CMDB.
**Epic:** P3 per [`docs/AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3, §5.3.
**Depends:** P1 Scan Attach (schedules, baseline) · P2 Workspace (org membership, JWT `org_id`) · FE org-scoped React Query keys (**#282** residual).
**Commercial:** tier target counts in [`docs/commercial/sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md) (Basic **1** · Pro **≤3** · Multi-asset **≤10**).
**Not this epic:** Guard agents, full CMDB, IoT/PMS, SIEM.

---

## 1. Problem

| Today | Pain |
|-------|------|
| Schedules are free-text `target` + optional `name` | No shared catalog of “what we protect” per org |
| Multi-asset SKU sold as “up to 10 targets” | Ops tracks labels in CRM / notes; product cannot enforce or pack |
| Guard agents (P5) are host sensors | Not the same as scan targets; must not merge into SIEM/CMDB |
| Baseline diff is per schedule/job chain | Pack report across related assets is manual |

Upsell needs a **thin registry**: name a VPS/domain once, attach schedules, respect tier limits, export multi-target pack later.

---

## 2. Goals

1. **Org-scoped assets** (JWT `org_id` + membership AuthZ) — not global user-only lists.
2. **CRUD** named assets: display name, scan type (`ip` \| `domain`), normalized target, optional notes/tags (v1 minimal).
3. **Link** (or create) **schedules** from an asset so cadence + baseline stay one row per target.
4. **Tier / pack limits:** **hard block** asset count by org `sku` (Basic **1** · Pro **3** · Multi **10**). Enabled **schedules** still cap at **10 / org** (`MAX_SCHEDULES_PER_ORG`).
5. **SPA**: simple Assets list + form; entry from Workspace / Dashboard; no CMDB graphs.
6. **Tests:** AuthZ matrix, org isolation (IDOR), validation of target normalization, limit behavior.
7. **Docs:** this spek + guide status; no customer SID/domain lists in git.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **Full CMDB** (CI, ownership graphs, change tickets) | P3 is light registry only |
| **IoT / PMS / cloud inventory sync** | Out of attach SKU |
| **Auto-discovery of assets from nmap** | Nice-later; v1 is manual CRUD |
| **Merging Guard agents into assets** | Agents ≠ scan assets; optional *link* later only |
| **Org wallet / billing automation** | Credits remain personal (Workspace D1) |
| **Nested projects / multi-workspace trees** | 1 org = 1 workspace |
| **Mobile APK/IPA as scheduled asset type** | Schedules stay ip/domain |
| **Same epic as Guard SIEM expansion** | Guard stays thin; assets are scan-side |
| **Hard rebrand / domain cutover** | P4 must not gate |
| **PII / customer host lists in public markdown** | Public repo hygiene |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Tenancy | **Asset belongs to `organization_id`**; AuthZ via Workspace roles |
| Roles | **viewer+** read; **member+** create/update own or org policy; **admin+** delete / manage all in org (match schedule patterns where possible) |
| Identity | UUID PK; **unique (organization_id, scan_type, normalized_target)** |
| Schedule link | Prefer **1:1 asset → schedule** for attach SKU; free-text schedules without asset remain valid (legacy) |
| Cap | **Hard block** assets at SKU limit. Enabled schedules remain **MAX_SCHEDULES_PER_ORG = 10**. |
| Credits | Unchanged — debit acting user / schedule owner |
| Guard | No FK required in v1; do not block asset CRUD on Guard enable |
| Language | Spec English; user chat Bahasa; UI dual-brand soft |

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **Org viewer** | List assets; open linked scan history if membership allows |
| **Org member** | Create/edit assets used for schedules they manage (policy detail in S1) |
| **Org admin / owner** | Full CRUD; set labels for pack export |
| **Platform admin** | Ops only; not hotel workspace owner via `is_admin` |
| **AM / ops (human)** | Fulfill Multi-asset packs using registry + schedules |

---

## 6. Proposed data model (sketch)

### 6.1 `assets` (name TBD: `scan_assets`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK organizations | required |
| `name` | str | display label (e.g. “Edge VPS — web”) |
| `scan_type` | `ip` \| `domain` | |
| `target` | str | normalized |
| `notes` | text NULL | short; no secrets |
| `created_by` | UUID FK users | |
| `created_at` / `updated_at` | timestamptz | |
| unique | `(organization_id, scan_type, target)` | |

### 6.2 Schedule relation

| Option | Notes |
|--------|-------|
| **A (preferred)** | Nullable `scan_schedules.asset_id` FK | Backfill null for legacy |
| **B** | Join table only if many schedules per asset needed later | Defer |

v1 recommendation: **Option A**.

---

## 7. API sketch (not binding)

| Method | Path | AuthZ |
|--------|------|-------|
| `GET` | `/api/orgs/me/assets` or `/api/assets` | viewer+; active org |
| `POST` | same | member+ (or admin+ if locked tighter) |
| `PATCH` / `DELETE` | `/api/assets/{id}` | admin+ or creator policy |
| `POST` | `/api/assets/{id}/schedules` | create schedule prefilled from asset (1:1; 409 if already linked) |
| `GET` | `/api/assets/pack` | viewer+; JSON pack hook (name/type/target/schedule_id) |

All list/detail must enforce **org membership** on asset’s `organization_id` (IDOR tests mandatory).

---

## 8. SPA sketch

- Route e.g. `/assets` or section under Workspace Settings (product pick in S0 UI).
- Table: name, type, target, linked schedule status, last scan link.
- Empty state: CTA “Tambah aset” + link to Jadwal.
- No network topology, no agent map.

---

## 9. Slices (implement only after explicit verb)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **S0** | This spek approved + guide checkbox | — **done** |
| **S1** | Model + migration + API CRUD + AuthZ tests | S0 **done #380** |
| **S2** | `asset_id` on schedules + create-from-asset | S1 **done** (`POST …/schedules`) |
| **S3** | SPA list/form + org switch cache keys | S1 **done** `/assets` |
| **S4** | SKU hard block UI + `GET /api/assets/pack` JSON | S2–S3 **done** |
| **S5** | Docs/ops + edge smoke notes | S1–S4 **this PR** |

Default order: **S0 → S1 → S2 → S3 → S4 → S5**.

---

## 10. Acceptance (epic-level)

- [x] Org can CRUD named assets scoped to active org only (IDOR green)
- [x] Schedule can reference asset; legacy schedules without asset still work
- [x] SPA lists assets per org; switch org does not show other org’s assets
- [x] No CMDB/Guard merge; no secrets/IPs of real customers in git
- [x] SKU **hard block** Basic 1 / Pro 3 / Multi 10; schedule org cap remains 10

---

## 11. Locked decisions (was open before S1)

1. **Hard block** API+UI when asset count exceeds SKU (Basic 1 · Pro 3 · Multi 10). Schedule cap remains 10 enabled/org.
2. **Top-level** SPA `/assets`.
3. **1:1** — at most one schedule per `asset_id` (partial unique).

---

## 13. Tag colors (follow-on)

Org-scoped palette on `organizations.tag_colors` (`JSONB` map tag → `gray|green|blue|amber|red|violet`). `GET`/`PATCH /api/assets/tag-colors`. SPA `/assets` paints badges + a swatch row. Filter still matches **name**, not color. No free hex.

---

## 12. References

- Guide §1.3 P3, §5.3 sketch
- [`workspace-v1.md`](workspace-v1.md) — org AuthZ patterns
- [`scan-attach-v1.md`](scan-attach-v1.md) — schedules / baseline
- [`guard-v1.md`](guard-v1.md) — agents are **not** assets
- [`sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md) — target counts
