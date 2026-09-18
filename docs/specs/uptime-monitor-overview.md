# Spec: Uptime per-monitor overview (`/uptime/:id`)

**Status:** **S0–S2 in this PR** (spec + samples/events range + SPA overview). **S3 30d rollup parked.**
**Goal:** Let an operator answer **“was it up 5 hours / 10 hours / 3 days ago?”** without scrolling a 24-row inline log.
**Epic:** product-depth follow-on to P8 Uptime v1/v2 + advanced settings. **Not** a new P-letter. Guide **§1.3.1**.
**Depends:** `UptimeMonitor` / `UptimeSample` / `UptimeEvent` · `GET /api/uptime/monitors/{id}` · `list_samples` · `list_events` · SPA `/uptime` · sample TTL **7d** / event TTL **90d** (`purge_old_uptime_rows`).
**Commercial:** not a SKU. Seats unchanged. No per-ping credits.
**Not this epic:** Pingdom clone, multi-region, world map, heatmap, public auto-incidents, webhooks, 30d % from raw samples (needs hourly rollup), WeasyPrint, Guard Discover, WAF 1147+.

---

## 0) Relation to existing modules (read first)

| Surface | Today (code / shipped spec) | This spec |
|---------|-----------------------------|-----------|
| SPA `/uptime` | List + sparkline (24 latency pts) + **inline** History panel (24 samples) | List stays. **History navigates** to `/uptime/:id`. Sparkline stays on the list. Frozen e2e testids stay. |
| `GET …/samples` | `from` + **7d floor** + **LIMIT 500** (array) | Envelope `{items, total}` + `until` + `limit`/`offset`. 7d floor **unchanged**. Default `limit=24` (list sparkline). |
| `GET …/events` | Last **100**, no time filter. **SPA never calls it.** | `from`/`until`. Timeline + outage list. Still org-scoped. |
| `uptime_24h` | Sample ratio last 24h on monitor GET/list | Unchanged on list. Detail also shows **range** % via `GET …/stats`. |
| `/uptime/status-page` | Editor. Public HTML is `/status/{slug}` | **Unchanged.** Route **`/uptime/status-page` before `/uptime/:id`**. Never leak URL/IP/headers/token on **public** status. |
| Advanced settings | Sheet timeout / `expect_status` | **Unchanged.** Do not re-implement. |
| Retention | Samples **7d**, events **90d** | Unchanged. 7d chip is the max honest sample window. “3 days ago” = **7d** range, not 30d. |

**Hard rules (inherit):**

1. AuthZ: same `_get_in_org` as GET monitor (viewer+). Outsider / wrong org → **404** (not 403). Do not leak existence.
2. Do **not** write uptime rows into `scan_findings` / `guard_alerts` / SIEM.
3. Do **not** put this page under `/guard` or `/siem`.
4. Frozen list e2e testids stay: `uptime-page`, `uptime-add`, `uptime-actions`, `uptime-delete`, `uptime-history`, `uptime-history-mobile`, `uptime-advanced`, `uptime-row`, `uptime-sparkline`, `uptime-name`, `uptime-target`, `uptime-save`.
5. Design: `--primary` `hsl(142 71% 45%)`, kit `Button`/`Tabs`/`Select`. No native `<select>`. No Palatino / `#0a7`. P15 chrome frozen.
6. i18n `id` / `en` in `frontend/src/locales/{id,en}/uptime.json`. Default locale `id`.
7. `GIT_MASTER=1`. Never work on `main`. Playwright ≠ Guard enroll.
8. No PII / real customer URLs / probe IPs in git.

---

## 1. Problem

| Today | Pain |
|-------|------|
| History = **24 samples** inline under the list | Cannot see 5h / 10h ago without luck (60s × 24 ≈ 24 min). |
| Sparkline = 24 **latency** points | Answers “was it slow?”, not “when was it down?”. |
| `list_samples` LIMIT **500** | 60s × 24h = **1440** rows — 24h window is truncated. |
| Events retained **90d** | SPA never fetches them. Outages are invisible. |
| `uptime_24h` only | No 6h / 7d % on a dedicated page. |
| Advanced spec said “no new page” | That was for timeout/expect_status **sheet**. Overview is a **named** product-depth slice. |

This is a **read-only per-monitor overview** — not a second monitor editor, not a status-page clone.

---

## 2. Goals

1. **S0:** this file + guide §1.3.1 + page registry `/uptime/:id`.
2. **S1 SPA:** `UptimeDetail` at **`/uptime/:id`**. Range chips **`6h | 24h | 7d`**. Header = name + state + target. Back to `/uptime`.
3. **S1 timeline:** horizontal **availability bar from events** (outage segments), not a latency sparkline. Outage list under the bar.
4. **S2 probe log:** paged samples (`limit`/`offset` + `total`), newest first. Reuse history table chrome / `uptime-history-row`.
5. **Range %:** `GET /api/uptime/monitors/{id}/stats?from=&until=` → `{uptime_pct, ok_count, total_count}`. Null % when `total_count=0`.
6. List **History** (desktop + mobile testids) **navigates** to `/uptime/:id`. Inline panel gone from the list page.
7. Tests: samples pager + 7d floor; events `from`/`until`; stats; IDOR; vitest list navigation + detail ranges; Sidebar Uptime active on `/uptime/:id` but **not** on `/uptime/status-page`.
8. Sparkline on the **list** still works (calls samples with `limit=24`).

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| 30d / 90d uptime % from **samples** | Sample TTL **7d**. Needs hourly rollup table = **S3 parked** |
| Pingdom / Better Stack clone, world map, multi-region | v1 Out |
| Public status incidents auto-open | P11 is a different surface; never leak probe internals on public HTML |
| Webhooks, Slack, PagerDuty | v1 Out |
| User-editable confirm count / skip-TLS | Advanced spec deferred |
| Replacing list sparkline with the range bar | List stays scannable |
| New SKU / seat change | Metering v3 |
| Native `<select>` / restyle kit / second palette | AGENTS.md |
| Host Protect, WAF 1147+, inbox bounce, `format=pdf` | Other queues |

---

## 4. Routes & nav

| Path | Page | Notes |
|------|------|-------|
| `/uptime` | `Uptime.tsx` | List. `end: true` **except** treat `/uptime/:id` as Uptime-active (not `status-page`). |
| `/uptime/status-page` | `StatusPage.tsx` | **Declare before** `/uptime/:id`. |
| `/uptime/:id` | `UptimeDetail.tsx` | JWT AppShell. UUID. 404 empty = ScanDetail-style not-found + back to `/uptime`. |

Sidebar `pathActive`: Uptime is active when `pathname === "/uptime"` **or** `pathname.startsWith("/uptime/")` **and** pathname is not `/uptime/status-page`.

---

## 5. API

All under existing `/api/uptime`, flag `UPTIME_ENABLED` (404 when off). Viewer+ in org.

### 5.1 Samples (breaking envelope — same PR updates SPA)

`GET /api/uptime/monitors/{id}/samples`

| Query | Default | Rules |
|-------|---------|-------|
| `from` | 7d floor | Alias. Clamped to `now-7d` if older. |
| `until` | now | Inclusive upper bound. |
| `limit` | **24** | 1…500 |
| `offset` | 0 | ≥0 |

Response:

```json
{ "items": [ { "id", "checked_at", "ok", "latency_ms", "status_code", "error" } ], "total": 1440 }
```

Order: `checked_at DESC`. IDOR → 404.

### 5.2 Events

`GET /api/uptime/monitors/{id}/events?from=&until=`

- No 7d floor (purge 90d is the real cap).
- Default: last 100, `at DESC`.
- `limit` max 200 (optional query; default 100).

Response remains `UptimeEventResponse[]` (`id`, `from_state`, `to_state`, `at`, `notified`, `detail`).

### 5.3 Range stats

`GET /api/uptime/monitors/{id}/stats?from=&until=`

- Same 7d sample floor as samples.
- `uptime_pct` = `round(100.0 * ok / total, 2)` or `null` if total=0.
- `ok_count`, `total_count`, `from`, `until` (echo clamped window).

List/GET monitor **`uptime_24h` unchanged** (still 24h).

### 5.4 Monitor GET

Unchanged. Detail page uses it for header (name, state, target, last error, last latency).

---

## 6. SPA `/uptime/:id`

Copy ScanDetail chrome: `PageHeader` + `PageHeaderBack` to `/uptime`.

1. **Header:** name, state `Badge`, target (mono), last latency, last error + existing hint copy.
2. **Range chips:** kit `Tabs` `6h | 24h | 7d`. Default **24h**. Changing range resets sample page to 0.
3. **KPI:** range `uptime_pct` (or —), sample counts.
4. **Availability bar:** segments from events in the window (plus last event **before** `from` to know starting state). `up` = `--primary`, `down` = destructive, `degraded`/`unknown` = muted. Not a latency sparkline.
5. **Outages:** rows where `to_state === "down"`; duration until next `up` or “ongoing”.
6. **Probe log:** `UptimeHistoryPanel` (or same table) + Inbox-style pager when `total > limit`. Page size **50**.
7. Optional header **Pause** (existing `pauseMonitor`). Edit/delete stay on the list sheet.

Empty samples: existing `historyEmpty` (7d). Empty outages: dedicated copy, not “check Guard”.

Times: `toLocaleString` with `id-ID` / `en-US` (Inbox pattern). Do **not** invent a new TZ helper. Do **not** label the column UTC unless the value is UTC ISO.

---

## 7. List page changes

- `onHistory` → `navigate(/uptime/:id)` (desktop `uptime-history`, mobile `uptime-history-mobile`).
- Remove inline `UptimeHistoryPanel` from `Uptime.tsx`.
- Sparkline: `listSamples(id, { limit: 24 })` and read `.items`.
- Optional: monitor **name** links to detail (`uptime-open`). Do not replace `uptime-row`.

---

## 8. Tests

**Backend** (`backend/tests/test_uptime.py`):

- Samples envelope `{items, total}`; `limit`/`offset`; `from` older than 7d clamped; `until` cuts the window.
- Events filtered by `from`/`until`; outsider 404.
- Stats pct matches ok/total; empty window → `uptime_pct` null.
- Existing IDOR/SKU/purge tests still pass.

**Frontend:**

- `Uptime.test.tsx`: History click **navigates** (no `uptime-history-panel` on the list). Sparkline still fills from `{items}`.
- `UptimeDetail.test.tsx`: not-found; range chips; bar/outages; probe log row; pager when total > page size.
- `Sidebar.test.tsx`: Uptime **not** active on `/uptime/status-page`; **active** on `/uptime/{uuid}`.

**E2E:** do **not** break frozen list testids. New e2e for detail is optional (vitest covers the page).

---

## 9. Slices

| Slice | In | Out |
|-------|----|-----|
| **S0** | This file + guide + registry | App code (same PR may include S1–S2 when user said `kerjakan`) |
| **S1** | Route, detail header, range chips, events timeline + outages, list History → navigate | Sample pager beyond first page |
| **S2** | Samples `{items,total}` + pager + stats % | Hourly rollup |
| **S3 parked** | 30d bar from **hourly** rollup | Do not compute 30d from 7d samples |

---

## 10. Files (expected)

- `docs/specs/uptime-monitor-overview.md` (this file)
- `docs/AGENT_EXECUTION_GUIDE.md` §1.3.1 + phrase table
- `docs/AGENT_PAGE_REGISTRY.md` row `/uptime/:id`
- `backend/app/schemas/uptime.py` — list + stats models
- `backend/app/services/uptime.py` — `list_samples`, `list_events`, `range_stats`
- `backend/app/api/uptime_routes.py`
- `backend/tests/test_uptime.py`
- `frontend/src/api/uptime.ts`
- `frontend/src/pages/UptimeDetail.tsx`
- `frontend/src/pages/Uptime.tsx` — History navigate
- `frontend/src/App.tsx` — route after status-page
- `frontend/src/components/layout/Sidebar.tsx` — pathActive
- `frontend/src/components/uptime/Sparkline.tsx` — `.items`
- `frontend/src/locales/{en,id}/uptime.json`
- `frontend/src/test/Uptime.test.tsx`, `UptimeDetail.test.tsx`, `Sidebar.test.tsx`

---

## 11. Acceptance

Operator opens a monitor → picks **6h / 24h / 7d** → sees whether the bar was down 5h ago, a list of outages, and can page the probe log past 24 rows. List History still uses `data-testid="uptime-history"`. Status page URL is not captured as an id.
