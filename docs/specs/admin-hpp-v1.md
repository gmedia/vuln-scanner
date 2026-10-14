# Spec: Admin HPP (COGS) v1

**Status:** S0–S3 (this PR). Internal ops only — not customer-facing billing.
**Goal:** Admin can store **IDR unit cost** per completed job type and see a date-range **HPP report** plus a **SKU margin overlay (estimasi)**.
**Not this epic:** SIEM HPP, live finance numbers in git, CRM, mixing HPP with the former `pricing.credit_cost` seed (table retired 2026-10-12). **Uptime/Guard HPP were out of v1 but were added 2026-10-13** (see §1).

---

## 1. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Currency | **IDR integer** only |
| Unit | One **completed** scan job (`ip` / `domain` / `apk` / `ipa`) **or** one **statushost** activation debit **or** one **completed** Host Protect scan (`hostscan`) **or** one **uptime check execution** (`uptimecheck`) **or** one **active Guard agent** (`guardagent`) |
| Out of v1 | SIEM (**Uptime probes / Guard agents added 2026-10-13** — see below) |
| S1–S2 | HPP rates + job × rate report only |
| S3 | SKU list-price overlay labeled **estimasi** (not invoice truth) |
| Page | `/admin/hpp` stays the COGS/margin tool. **Retired 2026-10-12:** `/admin/pricing` is removed, not merged into HPP. |
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
| `key` | PK `varchar(20)` — `ip` \| `domain` \| `apk` \| `ipa` \| `statushost` \| `hostscan` \| `uptimecheck` \| `guardagent` |
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

Report rows: per key `count`, `rate_idr`, `hpp_idr` (= count × rate). Totals. Statushost count = `credit_logs` with `type=deduct` and description prefix `Status hostname:` in range. Hostscan count = `host_scans` with `status=completed` and `finished_at` in range. **Uptimecheck count = `uptime_samples` with `checked_at` in range. Guardagent count = `guard_agents` with `disabled_at IS NULL` (active inventory; no date filter).** Seed `hostscan` **0** — no real COGS in git. The two new keys also seed **0** (migration `add_hpp_uptime_guard_keys`, added 2026-10-13).

S3 overlay **replaced (metering v2):** `line_margins` for **scan** vs **host**. Revenue = list × orgs with an enabled Scan schedule or a Host site (do not count default `sku=multi` personal orgs with neither). Scan COGS = fully loaded ip/domain/apk/ipa/statushost. Host COGS = `hostscan` fully loaded **capped** at included cadence (sites × days in range; hourly × 24) when recorded volume exceeds that (`host_cogs_capped`). Table volume rows stay uncapped. Label **estimasi** — not invoice P&L.

**Uptime/Guard COGS (added 2026-10-13):** `uptimecheck` and `guardagent` appear in the report **lines** (with real volumes) but are **NOT** folded into the scan or host line margin — `_SCAN_COGS_KEYS` stays `ip/domain/apk/ipa/statushost`, and there is no uptime/guard margin line. Reason: Uptime/Guard are **not invoiced** in v1 (`sku_catalog`/`org_invoices` CHECK allows only `scan|host`), so any per-service revenue for them would be hypothetical. Their à-la-carte **list** prices are exposed read-only via `GET /api/admin/sku-prices` for the simulator.

---

## 4. SPA

`/admin/hpp`: rates form (pattern Admin Pricing) + date filter (Credit History `gap-3` / `h-10`) + report table + **Scan / Host line-margin** cards. i18n `admin` + nav `hpp`. No cloud-compare / quote UI.

`/admin/simulator` (added 2026-10-13): internal, admin-only **what-if calculator** for HPP + margin per layanan. Operator inputs a monthly fixed-cost pool, an optional target margin, and per-service `volume` / `unit_cost` / `price` (price may be picked per seat SKU for Scan/Host). Pure client-side arithmetic over `frontend/src/lib/hppScenario.ts` — **no endpoint, no persistence, no writes** to `hpp_rates` / `hpp_overhead` / `hpp_cost_lines` / `sku_catalog` / invoices. Label **SKENARIO**; all four services are operator-entered assumptions, but the unit cost and selling price are **prefilled from real data** (2026-10-14): unit cost = the HPP report's **direct** cost (`hpp_idr / count`, weighted across a service's keys — `ip/domain/apk/ipa` for Scan; `hostscan`/`uptimecheck`/`guardagent` otherwise), selling price = `GET /api/admin/sku-prices`. Prefill never overwrites operator input, and the page does not use `fully_loaded_unit_idr` (that would double-count the operator's own fixed-cost column). Not a customer-facing quote UI.
