# Spec: Promo codes v1

**Status:** **Shipped** (owner-named 2026-11-04; code closed 2026-11-05). The finance cap in §1
item 5 is enforced in code (#1243 / PR #1264): high-value codes are created inactive and need a
different platform admin to approve, `reactivate` refuses while unapproved, and editing the
discount terms resets the approval. Residual is **owner/ops** only (#1244 PPh23 base with
finance). Do **not** re-implement; the PR chain in §11 is historical.
**Amends:** [`pricing-architecture-v1.md`](../commercial/pricing-architecture-v1.md) P7 → **P9** (below). Annual P2 remains locked and excluded.
**Related:** [`payments-v1.md`](payments-v1.md), [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md), [`subscription-page-v1.md`](subscription-page-v1.md).

---

## 0) Why

Sales and pilots need a time-boxed, capped discount without a bespoke invoice edit and without weakening the locked list-price policy. A promo code is a **billing discount object**, not a checkout, not a credit wallet, and not a payment method.

## 1) Locked decisions

| ID | Topic | Decision |
|----|--------|----------|
| **PC1** | Scope | Global codes only in v1. No per-organization private codes. |
| **PC2** | Code format | Case-insensitive input, stored uppercase, unique. `^[A-Z0-9][A-Z0-9_-]{7,31}$` (minimum 8 characters). |
| **PC3** | Kind | `percent` (basis points 1–10000) **xor** `fixed` (IDR > 0). Exactly one. |
| **PC4** | Thresholds | `min_amount_idr` is checked against the **pre-discount** list amount. `max_discount_idr` caps the computed discount. |
| **PC5** | Product scope | Optional `applies_to_sku` and optional `applies_to_product`. Both null = all. SKU codes are shared across products, so product scope must be explicit if a code is scan-only. |
| **PC6** | Window | `starts_at` / `ends_at` UTC, plus an `active` kill switch. SQLite-naive values normalize through `as_utc`. |
| **PC7** | Limits | `max_redemptions` total (counts `applied` only), `max_redemptions_per_org` default 1. |
| **PC8** | Annual | **Rejected.** Annual is prepay 10/12 and does not stack (P2). The customer input is disabled on the annual tab. |
| **PC9** | One redemption per invoice | `promo_redemptions.invoice_id` is unique. A redemption is written in the **same transaction** as the invoice. |
| **PC10** | Tax | The discount reduces the taxable base. Non-PKP `pph23` stays **0** (existing pinned behavior). For PKP, DPP/PPN/PPh23 are computed from `base − discount`. Finance confirms the PPh23 base before the first real discounted invoice. |
| **PC11** | Invoice shape | `amount_idr` stays the list/subtotal snapshot. New `discount_idr` + `promo_code`. `total_idr = amount_idr − discount_idr + ppn_idr`. |
| **PC12** | Void | Releases the redemption (`status='released'`, `released_at` set, quota returns). The row is never deleted. |
| **PC13** | Lifetime | One-shot. The annual renewal beat never applies a promo. |
| **PC14** | Immutability | After the first `applied` redemption, discount terms are immutable. `code` is always immutable. `active` changes only through deactivate/reactivate. |
| **PC15** | Authorization | Admin CRUD: platform admin. Validate/attach: org owner/admin. Viewer 403. |
| **PC16** | Audit | `promo_code_history` is append-only; `promo_redemptions` is the usage ledger. |
| **PC17** | Discovery | The customer field is hidden unless `capabilities.promo_codes` is true (an active, in-window, non-exhausted code exists). The validate endpoint is still authoritative. |
| **PC18** | Isolation | Never touches `users.credits` or `ai_wallets`. |
| **PC19** | Request linkage | A request may be consumed at most once: same org, status `pending|approved`, no existing redemption. |
| **PC20** | 100% | Auto-settles at invoice creation: invoice `paid`, subscription activated, `PaymentAttempt(amount=0, method="promo", provider="promo")`. Not a dead-end. |

### P9 — Promo codes (replaces P7)

Platform-admin-created promo codes are an **approved discount mechanism** when all of the following hold:

1. The code is created in `/admin/promo-codes`, not by editing an invoice by hand.
2. `percent_off_bp`, `amount_idr`, `max_discount_idr`, `max_redemptions`, and the window are set at creation and audited in `promo_code_history`.
3. Annual invoices are excluded (P2). The pilot (P3) remains a separate, non-stacking instrument.
4. Promo codes are **not** a payment method and do not create credit balances.
5. Finance caps: any code above **50%** or **IDR 5.000.000** total discount requires a second platform admin to enable it. (Enforced by the admin UI/flow in the promo UI PR; recorded here so the policy is explicit.)

Owner sign-off: product owner named this feature on **2026-11-04**.

## 2) Where the code enters

There is no checkout. Subscription changes are request-only, and the invoice is the only price event.

1. Customer enters a code in the plan-change request dialog. The backend validates it (no price promise) and stores `subscription_requests.promo_code`.
2. Admin sees the code on the request and in the invoice form. The invoice form prefills from the latest pending/approved request.
3. `InvoiceService.create_invoice` re-validates under a row lock and applies the discount authoritatively.
4. Admin may also type a code directly at invoice creation.

A code on a request is **intent**, not a guarantee. The invoice is the contract.

## 3) Money math

```
base     = catalog list × (10 if annual else 1)      # annual is rejected before this
discount = clamp(percent or fixed, cap=max_discount_idr, max=base)
taxable  = base − discount
non-PKP: dpp = taxable, ppn = 0, pph23 = 0, total = taxable
PKP:     dpp = round(taxable × 11/12), ppn = round(dpp × 0.12),
         pph23 = round(taxable × 0.02), total = taxable + ppn
```

- Percent uses basis points with half-up integer rounding: `(base × bp + 5000) // 10000`.
- `min_amount_idr` compares against `base`.
- Invariant: `total_idr = amount_idr − discount_idr + ppn_idr`, enforced by a DB check.
- Non-PKP `pph23 = 0` is locked by `backend/tests/test_billing_profile.py`.

## 4) Data model

`promo_codes`:

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| code | String(32) not null | unique; `CHECK code = upper(code)`; Postgres regex check |
| description | String(200) not null default "" | admin-facing |
| kind | String(10) not null | `percent` / `fixed` |
| percent_off_bp | Integer nullable | 1–10000 |
| amount_idr | Integer nullable | > 0 |
| min_amount_idr | Integer not null default 0 | ≥ 0 |
| max_discount_idr | Integer nullable | > 0 |
| applies_to_sku | String(20) nullable | FK `sku_tiers.code` RESTRICT |
| applies_to_product | String(20) nullable | check in `INVOICE_PRODUCTS` |
| starts_at / ends_at | DateTime(tz) nullable | `ends_at > starts_at` |
| max_redemptions | Integer nullable | ≥ 1 |
| max_redemptions_per_org | Integer not null default 1 | ≥ 1 |
| active | Boolean not null default true | |
| created_by_user_id / updated_by_user_id | UUID nullable | FK users SET NULL |
| created_at / updated_at | DateTime(tz) not null | |

`promo_redemptions`:

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| promo_code_id | UUID not null | FK RESTRICT |
| organization_id | UUID not null | FK orgs CASCADE |
| invoice_id | UUID not null | **unique**, FK invoice CASCADE |
| subscription_request_id | UUID nullable | FK request SET NULL; **partial unique** when not null |
| code_snapshot | String(32) not null | uppercase check |
| discount_idr | Integer not null | > 0 |
| status | String(10) not null | `applied` / `released` |
| created_by_user_id | UUID nullable | |
| created_at | DateTime(tz) not null | |
| released_at | DateTime(tz) nullable | `(status='released') = (released_at IS NOT NULL)` |

`promo_code_history`: mirrors `sku_tier_history` (no FK on `promo_code_id`, `action`, `actor_user_id`, `changes` JSONB, `created_at`).

`org_invoices`: add `discount_idr` (not null default 0), `promo_code` (nullable, uppercase check), `CHECK total_idr = amount_idr − discount_idr + ppn_idr`.

`subscription_requests`: add `promo_code` (nullable, uppercase check).

`SkuUsage` gains `promos`, and `SkuTierService.delete` counts `promo_codes.applies_to_sku` so the FK RESTRICT returns a friendly 409 instead of a 500.

## 5) Service and transaction rules

`PromoService`:

- CRUD + history + redemptions list.
- `validate(...)` for UI (no side effects).
- `lock_and_quote(...)`: `SELECT … FOR UPDATE` on the promo row, then re-check **everything** under the lock (active, dates, scope, min amount, annual, total limit, per-org limit) and recompute the discount.
- `record_redemption(...)`, `release_for_invoice(...)`, `has_active_codes(...)`.
- Must not import `InvoiceService`.

`InvoiceService.create_invoice`:

1. Lock the **Organization** row (`FOR UPDATE`) to serialize invoice creation per org.
2. Lock/quote the promo if present.
3. Overlap check.
4. Compute prices.
5. Insert invoice → `flush()`.
6. Insert redemption (with flushed invoice id).
7. Commit once; rollback on any exception.

`next_invoice_number` retries on `IntegrityError` (3 attempts). Non-committing `_create_invoice` / `_mark_paid` / `_void` internals are shared with payments.

`void` releases the redemption in the same transaction.

## 6) API

Admin:

| Method | Path |
|---|---|
| GET | `/api/admin/promo-codes?page=&page_size=&status=&q=` |
| GET | `/api/admin/promo-codes/{id}` |
| POST | `/api/admin/promo-codes` (201, duplicate 409) |
| PATCH | `/api/admin/promo-codes/{id}` (immutable terms 409) |
| POST | `/api/admin/promo-codes/{id}/deactivate` |
| POST | `/api/admin/promo-codes/{id}/reactivate` |
| DELETE | `/api/admin/promo-codes/{id}` (204 only with zero redemptions) |
| GET | `/api/admin/promo-codes/{id}/redemptions` |
| GET | `/api/admin/promo-codes/{id}/history` |
| POST | `/api/admin/promo-codes/validate` |

Invoice creation adds `promo_code` and `subscription_request_id` to the body.

Customer:

| Method | Path |
|---|---|
| POST | `/api/orgs/{org_id}/promo-codes/validate` |
| POST | `/api/orgs/{org_id}/subscription/requests` (adds `promo_code`) |

Validation returns `{valid, description, discount_idr, total_idr}` for the target SKU/cycle. It is the same information as the public catalog, so it is not treated as a secret; enumeration is controlled by the 8-character minimum, the strict limiter, and generic errors. Annual returns a generic 400.

## 7) Frontend

- `/admin/promo-codes`: lean page (target 350–500 lines), filter bar, table + mobile cards, Sheet form, row actions, delete confirm, redemptions sheet. Do not clone the 1,285-line `AdminSkuTierPanel`.
- Subscription request dialog: promo field (hidden unless the capability is true), "Terapkan" button, inline accepted/rejected state, annual disabled, no final-price promise.
- Admin invoice form: promo input + validate + discount preview; prefill from the request.
- Invoice surfaces: "Diskon (CODE)" row; total from `total_idr`.
- i18n `en`/`id` parity; design invariants and row-action spec apply.

## 8) Security

- Admin CRUD platform-admin only; validate/attach owner/admin; viewer 403.
- Codes are not secrets but must not be enumerable: ≥8 chars, strict limiter, generic errors, hashed logging.
- **`X-E2E-Test` must not bypass** the promo limiter. Fix the global bypass and stop sending the header from the SPA unconditionally.
- Org-scoped request linkage prevents reusing another org's request.

## 9) Out of scope

- Per-org private codes.
- Stacking with annual or pilot.
- Recurring/subscription-level discounts.
- Automatic campaigns, referral programs, or credit balances.
- Refunding a discounted invoice (payments spec).
- Public promo landing pages.

## 10) Tests

Money: percent/fixed/cap/min/clamp/100%, half-up, PKP and non-PKP vectors, `total == amount − discount + ppn`.

Service: case, dates, SQLite naive datetimes, scope, total/per-org limits, immutable code/terms, delete 409, release returns quota, wrong-org request, double-consume request.

Invoice: rollback leaves no invoice/redemption; duplicate period does not consume; void releases; 100% auto-settles; annual 400.

Admin: 403, CRUD, duplicate 409, pagination, validate.

Tier delete: `SkuUsage.promos` in both counts; delete returns 409.

Postgres concurrency (`backend/tests/test_pg_concurrency.py`, CI job `postgres-concurrency-tests` against `postgres:16-alpine`): concurrent global quota (promo row `FOR UPDATE`), same-org/same-period invoice race, and invoice-number allocation across a real unique violation. The file also guards the partial unique index predicates in every CI run. Locally the concurrency tests skip unless `TEST_POSTGRES_URL` is set.

Usage and discount are observable through the `vuln_promo_*` Prometheus gauges (see `docs/payments-ops.md` §10).

## 11) Rollout

1. `promo_v1` migration (parented to `payments_v1` after it merges).
2. Backend service + admin API + strict limiter.
3. Admin page + customer field + invoice surfaces.

## 12) Residual risks

- A leaked code is usable by anyone; caps and `max_redemptions_per_org` are the control, not secrecy.
- Finance must confirm the PPh23 base with a discount before the first real discounted invoice.
- One promo discounts one invoice line; a tier that is invoiced as scan + host + uptime + guard gets the discount on one line only. Customer copy must not promise "diskon paket".
- Plan cards show bundle prices while invoices are per-product; never compute a final price in the SPA.
