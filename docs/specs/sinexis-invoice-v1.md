# Spec: Sinexis Invoice v1 (independent of GMD)

**Status:** **Shipped on `main`** (I1–I9 pay loop). Owner: Sinexis bills Scan SKU **in-app**, not as a GMD colo/VPS `service_id`.
**Seller copy:** env `INVOICE_BANK_*` only. No NPWP/PPN engine in v1 (tax_idr implicit 0). **HTML print** = product-depth track **S1b** in [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md) — not this pay-loop PR. **PDF library stays out (I10).**
**Does not** add Midtrans/Xendit. Does **not** merge AI Gateway IDR wallet. Does **not** mix HPP COGS into invoices. Does **not** revive Scan credits as a meter.

---

## 0) Locked

| ID | Topic | Decision |
|----|--------|----------|
| **I1** | Who bills | **Sinexis** issues invoices. GMD rack/VPS invoices stay in GMD. No silent-bundle. |
| **I2** | What is sold | **Scan SKU seats** (Basic / Pro / Multi; P0 lock 300_000 / 650_000 / 2_000_000) **and Host Protect SKU seats** (working list 150_000 / 350_000 / 900_000; H4 not finance-locked). **H9 shipped:** Host catalog `invoicable=true`. Paid Host does **not** set `organizations.sku`. Unique period is per `(organization_id, product, period_start)` — Scan + Host same month OK. **Invoice-ok** for the short “ganti Imunify” line is **this Sinexis in-app path** (I1), **not** GMD `service_id` — see [`vps-displace-imunify-dev-plan.md`](vps-displace-imunify-dev-plan.md) §7.3. |
| **I3** | Payment | **Manual bank transfer.** Admin marks `paid` after ops sees the transfer. No gateway, no auto-charge, no tax line. |
| **I4** | Period | Calendar month (UTC). One non-void invoice per `(organization_id, product, period_start)`. Scan + Host same month OK. |
| **I5** | SKU mutation | Org admin **cannot** `PATCH /orgs/{id}` `sku` (403). Paid Scan invoice (or platform-admin set) is the gate. |
| **I6** | New org default | `organizations.sku` default **`basic`** for **new** rows. Existing orgs unchanged. |
| **I7** | Unpaid | Does **not** auto-downgrade `org.sku`. Void + admin set sku is ops. Seat caps still follow current `org.sku`. |
| **I8** | Customer surface | Org owner/admin: read-only invoice list + bank copy when `sent`. No self-serve upgrade. |
| **I9** | Bank copy | Env `INVOICE_BANK_NAME` / `INVOICE_BANK_ACCOUNT` / `INVOICE_BANK_HOLDER`. CI `append_if_set` on `push` to `main` (empty GitHub secret does not wipe host). Compose **backend** must interpolate those keys (host `.env` is not auto-mounted). Never commit real account numbers. |
| **I10** | Out | Gateway, **PDF library**, dunning, PPN, subscriptions auto-renew job, AI top-up, GMD API, customer SID/PII in git. **Host invoice is in** (H9). HTML print is **not** a PDF library — follow-on [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md) **S1b**. |

List prices (do not invent):

| SKU | Seats | IDR / mo |
|-----|-------|----------|
| basic | 1 | 300_000 |
| pro | 3 | 650_000 |
| multi | 10 | 2_000_000 |

---

## 1) Runtime

### Catalog `sku_catalog`

PK `(product, sku)`. Products = `scan` + `host` (both `invoicable=true` after H9).

| Column | Type |
|--------|------|
| product | `scan` \| `host` |
| sku | `basic` \| `pro` \| `multi` |
| list_idr | int ≥ 0 |
| seats | int ≥ 1 |
| invoicable | bool |
| updated_at | timestamptz |

Seed Scan from I2. Seed Host 150_000 / 350_000 / 900_000. Alembic `host_sku_invoicable` sets Host `invoicable=true`.

HPP overlay `_SCAN_LIST_IDR` / `_HOST_LIST_IDR` **read from catalog** (fallback to the same constants if a row is missing).

### Invoices `org_invoices`

| Column | Type |
|--------|------|
| id | UUID PK |
| organization_id | FK orgs CASCADE |
| number | unique `SX-YYYYMM-NNNN` |
| product | `scan` \| `host` |
| sku | basic\|pro\|multi |
| amount_idr | int ≥ 0 (snapshot of catalog at create) |
| period_start / period_end | timestamptz UTC month bounds |
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
| GET | `/api/admin/sku-catalog` | all rows |
| PUT | `/api/admin/sku-catalog/{product}/{sku}` | `{ list_idr }` only; seats immutable in v1 |
| GET | `/api/admin/invoices` | filter `status`, `organization_id`; page |
| POST | `/api/admin/invoices` | `{ organization_id, sku, product?, period_start? }` `product` = `scan` (default) \| `host`; amount from catalog |
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
- Workspace: card **Billing** (owner/admin) — list invoices; if `sent`, show bank copy. No pay button. Empty: ops-issued, no self-serve upgrade. Load error is not painted as empty. Platform admin may link to `/admin/invoices`.

Do **not** restyle kit. Tokens from `:root`. `Button` / `Select` only.

---

## 4) Out

- Payment gateway, e-meterai, PDF binary, auto-renew beat job.
- Guard/SIEM `service_id`. Host invoice is **in** (H9).
- HTML print UI — **S1b shipped** [`scan-pdf-invoice-print-v1.md`](scan-pdf-invoice-print-v1.md) (browser `window.print`; still **no** PDF library).
- Invoice **Send** is a **status flip**, not SMTP. User-side mail log is [`inbox-delivered-v1.md`](inbox-delivered-v1.md) — **do not** email invoices in that epic.
- Writing `users.credits` or `ai_wallets`.
- Mixing this page into `/admin/hpp` or leftover `/admin/pricing`.

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
