# Spec: Metering v2 — SKU included attach, credits = overage

**Status:** **implementing** (2026-09-11). Owner asked to execute the packaging fix: dual meter (invoice SKU vs in-app credits) was confusing buyers and HPP overlay.
**Epic:** commercial metering follow-on to P0/P1. Does **not** reopen Host Protect S1–S12, WAF packs, or Guard.
**Legal / GTM:** Scan list IDR (A1) and Host working list (H4) unchanged. Finance `service_id` still human. Do not silent-bundle Host into Scan or VPS.

---

## 0) Locked decisions

| ID | Topic | Decision |
|----|--------|----------|
| **M1** | What the invoice sells | **Named assets + cadence** (Basic 1 / Pro 3 / Multi 10). Headline is **not** “10 credits.” |
| **M2** | Scheduled attach | **Included.** Beat enqueue of `scan_schedules` does **not** debit `users.credits`. Job `credit_cost = 0`. |
| **M3** | Zero credits (was E2) | **Must not** `enabled=false` on a sold schedule. Manual / extra / mobile still 402 when wallet empty. |
| **M4** | Credits still exist | Prepaid wallet for **overage**: on-demand IP/domain beyond the attach story, **mobile** (A5), `statushost` debit. Top-up = AM/admin (D5). |
| **M5** | Host / Guard / Uptime / WAF | **Not** credit-metered. Host = sites/month (H2). Host scan stays **credit 0**. |
| **M6** | HPP overlay | What-if “all credits → IP vs domain” is **not** P&L. Report **line margin**: Scan vs Host (list × billed orgs − fully loaded COGS). Label **estimasi**. |

**Supersedes:** SKU **E2** (zero credits disable schedule). **A4** bundle 10/24/60 becomes **optional overage pack**, not the attach headline. **A3** overage still = top-up **or** upgrade tier.

---

## 1) Why (evidence, not a new philosophy)

- Credits landed **2026-06-22** (one-shot scanner wallet). SKU P0 **2026-08-08** layered list price + asset caps **on top** of that wallet. P1 spec: “credits that still make sense with **existing** metering.”
- There was **no** written “quota vs credits” bake-off. A4 math was a sales guide, not a monthly reset job.
- Industry continuous-scan (Tenable/Qualys/Intruder/Detectify) meters **assets/targets**; scheduled rescans are included. Pentest-Tools **left credits (2019)** for scanned-assets + unlimited rescans. Snyk credits (2026) are for **lumpy** jobs, not daily nmap.

---

## 2) Runtime (agent-executable)

### 2.1 Worker `schedules.run_due`

- **Do not** `SELECT credits` / `UPDATE users SET credits = credits - …` for due schedules.
- **Do not** set `enabled = false` or `last_error` for insufficient credits.
- Insert `scan_jobs` with `credit_cost = 0`. No `credit_logs` row for the tick.
- Keep: skip in-flight last job; dispatch fail → mark job failed + `last_error` on schedule (**leave enabled**); advance `next_run_at`.

### 2.2 Manual scan (`ScannerService.start_scan`)

- Unchanged: debit `pricing.credit_cost` (ip/domain/apk/ipa). HTTP 402 if short.

### 2.3 Host Protect

- Unchanged: no credit debit (`hostscan` HPP key is COGS only).

---

## 3) HPP report (S3 replacement)

Keep: unit rates, overhead pool, journal, per-key volume × rate + share.

**Add** `line_margins` (two rows):

| `line` | Revenue (estimasi) | COGS |
|--------|--------------------|------|
| `scan` | Σ list[org.sku] for orgs with **≥1 enabled** `scan_schedules` (`organization_id` not null) | sum `fully_loaded_hpp_idr` of `ip`+`domain`+`apk`+`ipa`+`statushost` |
| `host` | Σ list[org.sku] using **Host** working list for orgs with **≥1** `host_sites` | `hostscan` fully loaded |

Scan list = A1 (300k / 650k / 2M). Host list = H4 working (150k / 350k / 900k).
**Do not** count personal orgs with default `sku=multi` unless they actually have a schedule or host site. Null-org schedules do not contribute revenue.

Drop hero UI for `sku_estimates` what-if IP/domain. API may omit that array (empty) or remove it in this PR — SPA must not show “margin if all IP” as the P&L.

---

## 4) Copy

- AM email / one-pager: package table = targets + cadence + IDR. Credits = footnote overage/mobile.
- Fulfillment: set org `sku` to sold tier; create schedule; **do not** require bundle top-up for the attach loop to run.
- Ops: [`scan-schedules-ops.md`](../scan-schedules-ops.md) — beat no longer credit-gates.

---

## 5) Out of this PR

- Auto-grant A4 on invoice date (no subscription table — D5).
- Org wallet.
- BOM / bahan-mesin form on `/admin/hpp`.
- Charging Host/Guard/Uptime in credits.
- Changing A1 / H4 list IDR.

---

## 6) DoD

- [ ] pytest: due schedule with wallet **below** domain cost still enqueues; user credits unchanged; schedule stays enabled.
- [ ] pytest: HPP report `line_margins` present; no hero what-if required for 200.
- [ ] Vitest: `/admin/hpp` shows Scan/Host margin cards, not “Margin if all IP.”
- [ ] SKU + one-pager + AM template + guide pointer updated.
- [ ] `GIT_MASTER=1`; branch `feat/metering-v2-sku-included`.
