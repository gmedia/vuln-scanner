# Spec: Sinexis Invoice v1 (independent of GMD)

**Status:** **Shipped on `main`** (I1–I9 pay loop). Owner: Sinexis bills Scan SKU **in-app**, not as a GMD colo/VPS `service_id`.
**Seller copy:** env `INVOICE_BANK_*` only. **Tax update:** buyer identity (NPWP/NITKU/PKP) lives in `org_billing_profiles`, and invoices store `dpp_idr`/`ppn_idr`/`pph23_idr`/`total_idr` (see [`billing-core-v1.md`](billing-core-v1.md) §2.8). Faktur pajak XML/PJAP export is still out of scope. **HTML print** = product-depth track **S1b** in [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md). **I10 PDF shipped:** `GET .../export?format=pdf` reuses `render_scan_pdf` (no new PDF library, no gateway).
**Does not** add Midtrans/Xendit. Does **not** merge AI Gateway IDR wallet. Does **not** mix HPP COGS into invoices. Does **not** revive Scan credits as a meter.

---

## 0) Locked

| ID | Topic | Decision |
|----|--------|----------|
| **I1** | Who bills | **Sinexis** issues invoices. GMD rack/VPS invoices stay in GMD. No silent-bundle. |
| **I2** | What is sold | **Scan SKU seats** (Basic / Pro / Multi; P0 lock 300_000 / 650_000 / 2_000_000) **and Host Protect SKU seats** (H4 **locked 2026-10-12**: 150_000 / 350_000 / 900_000). **H9 shipped:** Host catalog `invoicable=true`. Paid Host does **not** set `organizations.sku`. Unique period is per `(organization_id, product, period_start)` — Scan + Host same month OK. **Invoice-ok** for the short “ganti Imunify” line is **this Sinexis in-app path** (I1), **not** GMD `service_id` — see [`vps-displace-imunify-dev-plan.md`](vps-displace-imunify-dev-plan.md) §7.3. |
| **I3** | Payment | **Manual bank transfer.** Admin marks `paid` after ops sees the transfer. No gateway, no auto-charge. **Updated:** DPP/PPN lines are printed for PKP buyers; non-PKP invoices keep `ppn_idr = 0`. |
| **I4** | Period | `cycle=monthly` → calendar month (UTC). `cycle=annual` → 12 months from the first of the start month. Invoices may not **overlap** for the same `(organization_id, product)`; Scan + Host same period OK. |
| **I5** | SKU mutation | Org admin **cannot** `PATCH /orgs/{id}` `sku` (403). Paid Scan invoice (or platform-admin set) is the gate. |
| **I6** | New org default | `organizations.sku` default **`basic`** for **new** rows. Existing orgs unchanged. |
| **I7** | Unpaid | Does **not** auto-downgrade `org.sku`. Void + admin set sku is ops. Seat caps still follow current `org.sku`. |
| **I8** | Customer surface | Org owner/admin: read-only invoice list + bank copy when `sent`. No self-serve upgrade. |
| **I9** | Bank copy | Env `INVOICE_BANK_NAME` / `INVOICE_BANK_ACCOUNT` / `INVOICE_BANK_HOLDER`. CI `append_if_set` on `push` to `main` (empty GitHub secret does not wipe host). Compose **backend** must interpolate those keys (host `.env` is not auto-mounted). Never commit real account numbers. |
| **I10** | **PDF shipped** | `format=pdf` on admin and org invoice export. Reuses `render_scan_pdf`. Bank block only when `sent`. Still **out:** gateway, dunning, PPN, auto-renew, AI top-up, GMD API, customer SID/PII in git. HTML print remains [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md) **S1b**. |

List prices (do not invent):

| SKU | Seats | IDR / mo |
|-----|-------|----------|
| basic | 1 | 300_000 |
| pro | 3 | 650_000 |
| multi | 10 | 2_000_000 |

---

## 1) Runtime

### Catalog `sku_catalog`

PK `(product, sku)`. Products = `scan` + `host` (both `invoicable=true` after H9). **Widened 2026-10-14** to also hold `uptime` + `guard` (both `invoicable=true`), matching the owner-locked à-la-carte lines in [`pricing-architecture-v1.md`](../commercial/pricing-architecture-v1.md) §4 — before this the code could not bill them at all.

| Column | Type |
|--------|------|
| product | `scan` \| `host` \| `uptime` \| `guard` |
| sku | `varchar(20)` → FK `sku_tiers.code` (`ON DELETE CASCADE`) |
| list_idr | int ≥ 0 |
| seats | int ≥ 1 |
| invoicable | bool |
| updated_at | timestamptz |
| updated_by | uuid → `users.id` (nullable, `ON DELETE SET NULL`) — audit actor, added 2026-10-13 |

Seed Scan from I2. Seed Host 150_000 / 350_000 / 900_000. Alembic `host_sku_invoicable` sets Host `invoicable=true`.

**Audit trail (2026-10-13):** every `PUT` records the acting admin in `updated_by` (migration `sku_catalog_updated_by`); `GET /api/admin/sku-catalog` returns `updated_by` + `updated_by_email` and `/admin/skus` shows "by &lt;email&gt;" under the updated date. Mirrors the existing `HppRate.updated_by` pattern. No history table — last-writer only.

**Tier catalogue (2026-11-02):** `sku_tiers` is now the source of truth for tier identity — `code`, `label`, `rank`, `active`, `requestable`, `sales_led`, `is_default`, `bundle_idr`, the four product caps, feature gates (`allow_status_page` / `allow_custom_host` / `allow_waf_protect` / `allow_siem` / `billing_unrestricted`) and workspace seat limits (`NULL` = unlimited). Every `sku` column (`organizations`, `subscriptions`, `org_invoices`, `subscription_requests.current_sku`/`target_sku`, `sku_catalog`) is a FK to `sku_tiers.code`; the old `sku IN (...)` CHECK constraints are gone. The Python constants (`INVOICE_SKUS`, `*_SKU_LIST_IDR`, `BUNDLE_LIST_IDR`, `*_SKU_LIMITS`, `SKU_RANK`, `SKU_LABEL`) are **seed-only** now — no runtime path reads them. A tier can be created/edited/retired from `/admin/skus` → **Tier & Fitur** without a deploy; `pro_plus` is the worked example.

**Retire vs delete (2026-11-02):** deactivate (`active=false`) is the normal "remove a plan" action. Grandfathered orgs keep their caps/features, keep receiving annual renewal drafts, and can still pay an existing invoice for that tier. New orgs and upgrade requests are rejected. Hard delete is only allowed when `organizations`, `subscriptions`, `org_invoices` and `subscription_requests` have **zero** references (the API returns `409` with per-table counts); `sku_catalog` rows are owned by the tier and cascade.

**Uptime / Guard list prices (2026-10-13, invoicable 2026-10-14):** the owner locked à-la-carte list prices for Uptime (75_000 / 200_000 / 500_000) and Guard (100_000 / 250_000 / 600_000) in [`pricing-architecture-v1.md`](../commercial/pricing-architecture-v1.md) §4. They are **seeded as `sku_catalog` rows** with `invoicable=true` (migration `add_uptime_guard_catalog`), so `/admin/invoices` can bill them and `/admin/skus` can edit them. `seats` carries the tier capacity (Uptime 10/50/200, Guard 1/3/10) for display only and is synchronised from `sku_tiers.limit_*` on every tier write.

HPP overlay `_SCAN_LIST_IDR` / `_HOST_LIST_IDR` **read from catalog** only; the constant fallbacks were removed on 2026-11-02. A tier with no catalog row is reported as unpriced instead of borrowing another tier's price.

**Bundle + annual (2026-10-14):** the owner-locked bundle **"Sinexis Secure"** (`BUNDLE_LIST_IDR` basic 450_000 / pro 1_000_000 / multi 2_900_000) and the annual policy (`ANNUAL_MONTHS_PAID` 10 / `ANNUAL_MONTHS_SERVED` 12, P2) are now **code constants**, exposed read-only via `GET /api/admin/sku-prices` (`bundles` + `annual`) and shown on `/admin/skus`. The bundle saving is **derived** from the four à-la-carte line prices, so editing a line price changes the comparison — a test pins the locked arithmetic. The bundle is **not** an `INVOICE_PRODUCTS` member and Enterprise is **not** in the catalog (custom/quote-only per P6), so neither can be invoiced from this surface.

### Invoices `org_invoices`

| Column | Type |
|--------|------|
| id | UUID PK |
| organization_id | FK orgs CASCADE |
| number | unique `SX-YYYYMM-NNNN` |
| product | `scan` \| `host` \| `uptime` \| `guard` |
| sku | basic\|pro\|multi |
| amount_idr | int ≥ 0 (snapshot of catalog at create) |
| period_start / period_end | timestamptz UTC month bounds |
| due_date | timestamptz; defaults to `period_start` (`INVOICE_DEFAULT_TERM_DAYS`, default 0); overridable per invoice |
| sent_at | timestamptz nullable; stamped on `draft → sent` |
| status | `draft` \| `sent` \| `paid` \| `void` |
| bank_ref | varchar 64 nullable (ops paste) |
| notes | varchar 500 default '' |
| paid_at | timestamptz nullable |
| created_by_user_id | FK users SET NULL |
| created_at / updated_at | timestamptz |

Unique: one non-void invoice per `(organization_id, product, period_start)`.

**Mark paid:** set `paid_at`, `status=paid`. If `product=scan`, set `organizations.sku` to invoice sku.

**Void:** only `draft` or `sent`. Does not change sku.

### SKU PATCH

`OrganizationService.update_org`: if `sku` is set and user is **not** platform `is_admin` → **403** `sku is billed; ask ops`. Platform admin may still PATCH (ops escape).

### New orgs

`ensure_personal_org` / `create_org`: pass `sku="basic"`. Alembic: change **server_default** to `basic` (existing rows untouched).

---

## 2) API

Admin (`get_current_admin` + existing limiter):

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/sku-catalog` | all rows, each with `label` + `active` joined from `sku_tiers` |
| GET | `/api/admin/sku-prices` | read-only list price for every **non-sales-led** tier × all four services (added 2026-10-13). Rows and bundles are built from `sku_tiers` + `sku_catalog`; a missing catalog row renders as `0` / non-invoicable rather than borrowing a fallback. Also returns `bundles` (tier `bundle_idr` vs derived à-la-carte sum + saving) and `annual` (P2 policy), added 2026-10-14. Single source for the `/admin/simulator` prefill. |
| GET | `/api/admin/sku-tiers` | all tiers incl. inactive, with `usage` (orgs/subscriptions/invoices/requests) and `has_catalog` |
| POST | `/api/admin/sku-tiers` | create a tier; `sales_led=false` requires prices for all four products (catalog rows are created with `seats = limit_*`) |
| PATCH | `/api/admin/sku-tiers/{code}` | edit tier; code is immutable; catalog rows are synchronised |
| POST | `/api/admin/sku-tiers/{code}/deactivate` | retire (default tier cannot be retired) |
| POST | `/api/admin/sku-tiers/{code}/reactivate` | un-retire |
| DELETE | `/api/admin/sku-tiers/{code}` | 204 only when unused; else 409 with per-table counts |
| PUT | `/api/admin/sku-catalog/{product}/{sku}` | `{ list_idr, invoicable? }`; `seats` follows `sku_tiers.limit_*`; records `updated_by` |
| GET | `/api/admin/invoices` | filter `status`, `organization_id`; page |
| POST | `/api/admin/invoices` | `{ organization_id, sku, product?, period_start?, due_date? }` `product` = `scan` (default) \| `host` \| `uptime` \| `guard`; amount from catalog; `due_date` defaults to `period_start` + `INVOICE_DEFAULT_TERM_DAYS` |
| POST | `/api/admin/invoices/{id}/send` | draft→sent |
| POST | `/api/admin/invoices/{id}/paid` | `{ bank_ref? }` → paid; apply `org.sku` only when `product=scan` |
| POST | `/api/admin/invoices/{id}/void` | draft\|sent → void |

Org (membership admin+):

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/orgs/{org_id}/invoices` | own invoices; include bank fields only when status=`sent` and env set |
| GET | `/api/orgs/{org_id}/invoices/{id}` | same |

Bank payload on customer GET when `sent`: `{ bank_name, bank_account, bank_holder }` from env (may be null).

---

## 3) SPA

- `/admin/invoices` — catalog table + invoice list + create/send/paid/void. Filter bar = Credit History (`gap-3`, `h-10`). `nav-admin-invoices`.
- `/admin/skus` (added 2026-10-13) — two tabs, `nav-admin-skus`:
  - **Harga** — edit catalog `list_idr` + `invoicable` per `scan|host|uptime|guard` × every non-sales-led tier; `seats` read-only from `sku_tiers.limit_*`. Confirm-before-write; existing invoices keep their `amount_idr` snapshot. Plus the **read-only** "Bundle & annual (locked)" card (`sku-bundle-card`, added 2026-10-14).
  - **Tier & Fitur** (added 2026-11-02) — create/edit/retire tiers, feature gates, product caps, workspace seat limits and prices. Delete is irreversible and only enabled for unused tiers; retire is one click. Enterprise stays `sales_led`, quote-only, no catalog row.
- Workspace: card **Billing** (owner/admin) — list invoices; if `sent`, show bank copy. No pay button. Empty: ops-issued, no self-serve upgrade. Load error is not painted as empty. Platform admin may link to `/admin/invoices`.

Do **not** restyle kit. Tokens from `:root`. `Button` / `Select` only.

**Invoice document — product-aware (fixed 2026-10-14):** `services/invoice_html.py` printed `SCAN_SKU_SEATS` (1/3/10) for **every** product and had no friendly label for `uptime`/`guard`, so an **Uptime Multi** invoice told the customer "10 seats" when the locked cap is **200**. Both are now product-aware: `_PRODUCT_LABEL` covers all four (`Sinexis Scan` / `Sinexis Host Protect` / `Sinexis Uptime` / `Sinexis Guard`), and seats/labels come from `sku_tiers` (updated 2026-11-02) — no constant lookup and no drift.

**Invoice document — print contract parity:** the PDF (`render_invoice_html` → WeasyPrint) implements the same locked grammar as the SPA print sheet, [`design/foundation.md`](../../frontend/design/foundation.md) §§0–8 — header flex, two-column parties, hairline table, right-aligned totals with the 2px ink rule on the grand row, payment box only when `sent`. It is **localized server-side** via `app.i18n` (`invoice` namespace, `id`/`en`, default `id`, same wording as the `workspace` catalog), emitting `lang="{locale}"`. Medium-forced differences: inline `<style>`, system font fallback chains, no print isolation. Same behavioral contracts: bank copy only when `sent`, per-product seats/labels, `@page` A4/16mm. SPA sheet untouched.

---

## 4) Out

- Payment gateway, e-meterai, auto-renew beat job.
- Guard/SIEM `service_id`. Host invoice is **in** (H9).
- HTML print UI — **S1b shipped** [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md) (browser `window.print`). **I10 PDF** is `format=pdf` via `render_scan_pdf`, not a second library.
- Invoice **Send** is a **status flip**, not SMTP. User-side mail log is [`inbox-delivered-v1.md`](inbox-delivered-v1.md) — **do not** email invoices in that epic.
- Writing `users.credits` or `ai_wallets`.
- Mixing this page into `/admin/hpp`. **Retired 2026-10-12:** the former `/admin/pricing` page is removed, not an invoice destination.

---

## 5) DoD

- [x] pytest: org admin PATCH sku → 403; platform admin PATCH sku → 200.
- [x] pytest: new org sku == basic.
- [x] pytest: create invoice snapshots list_idr; second Scan invoice same period → 409.
- [x] pytest: mark paid sets org.sku; void does not.
- [x] Vitest: `/admin/invoices` paid action; Workspace billing card read-only.
- [x] pytest: `bank_copy` empty vs set; send includes bank, draft does not.
- [x] Vitest: Workspace Billing shows bank copy on `sent`, dashes when null, hidden on draft.
- [x] Vitest: empty Billing is ops-issued (no upgrade CTA); load error is not empty; platform admin may link `/admin/invoices`.
- [x] pytest: create Host invoice snapshots Host list_idr; Scan+Host same period OK; duplicate Host 409; paid Host does not set `org.sku`; `invoicable=false` → 400.
- [x] Vitest: admin Host product picker + SKU filter; print Host line/footer; billing copy Scan+Host.
- [x] No real bank account in git.
- [x] pytest: admin and org `export?format=pdf` returns `%PDF`; bank account only when `sent`; 404/403; 503 detail `PDF rendering unavailable`.
- [x] Vitest: PDF button on `sent`/`paid` only; download uses invoice number.
