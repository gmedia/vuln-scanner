# Spec: Admin HPP (COGS) v1

**Status:** S0–S3 (this PR). Internal ops only — not customer-facing billing.
**Goal:** Admin can store **IDR unit cost** per completed job type and see a date-range **HPP report** plus a **SKU margin overlay (estimasi)**.
**Not this epic:** Uptime/Guard/SIEM HPP, live finance numbers in git, CRM, mixing with `pricing.credit_cost`.

---

## 1. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Currency | **IDR integer** only |
| Unit | One **completed** scan job (`ip` / `domain` / `apk` / `ipa`) **or** one **statushost** activation debit **or** one **completed** Host Protect scan (`hostscan`) |
| Out of v1 | Uptime probes, Guard agents, SIEM |
| S1–S2 | HPP rates + job × rate report only |
| S3 | SKU list-price overlay labeled **estimasi** (not invoice truth) |
| Page | `/admin/hpp` — **not** mixed into `/admin/pricing` |
| Seed | All rates **0** — no real COGS in git |
| Overhead | Monthly opex (rent/CF) in `hpp_overhead` singleton; **not** mixed into `amount_idr`. Report allocates by unit count in range. |
| Cost journal | `hpp_cost_lines`: dated IDR rows (`opex` \| `variable`). Report pool = singleton + journal sums in range. Not AP invoices. |
| Auth | `get_current_admin` + existing admin rate limiter |

SKU list prices (from `docs/commercial/sku-scan-secure-addon.md`, working list):

| SKU | List IDR / mo | Credits / mo |
|-----|---------------|--------------|
| Basic | 300_000 | 10 |
| Pro | 650_000 | 24 |
| Multi | 2_000_000 | 60 |

---

## 2. Data

Table `hpp_rates`:

| Column | Type |
|--------|------|
| `key` | PK `varchar(20)` — `ip` \| `domain` \| `apk` \| `ipa` \| `statushost` \| `hostscan` |
| `amount_idr` | `int` ≥ 0 |
| `updated_at` | timestamptz |
| `updated_by` | UUID FK users, nullable |

---

## 3. API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/hpp` | `{ items: [{ key, amount_idr, updated_at, updated_by }] }` |
| PUT | `/api/admin/hpp/{key}` | Body `{ amount_idr }` |
| GET | `/api/admin/hpp/report?from=&to=` | ISO date (inclusive). Default: current UTC month. Pool = singleton overhead + journal. |
| GET | `/api/admin/hpp/costs?from=&to=` | Journal lines in range |
| POST | `/api/admin/hpp/costs` | `{ incurred_on, amount_idr, category, note }` |
| DELETE | `/api/admin/hpp/costs/{id}` | 204 |

Report rows: per key `count`, `rate_idr`, `hpp_idr` (= count × rate). Totals. Statushost count = `credit_logs` with `type=deduct` and description prefix `Status hostname:` in range. Hostscan count = `host_scans` with `status=completed` and `finished_at` in range. Seed `hostscan` **0** — no real COGS in git.

S3 overlay: for each SKU, **estimasi** HPP if monthly credits were burned entirely as IP jobs vs entirely as domain jobs (using current `pricing.credit_cost` and `hpp_rates`). Derived **margin** = list − HPP (IDR + % of list). Labelled estimasi — not invoice P&L.

---

## 4. SPA

`/admin/hpp`: rates form (pattern Admin Pricing) + date filter (Credit History `gap-3` / `h-10`) + report table + SKU cards. i18n `admin` + nav `hpp`. No cloud-compare / quote UI.
