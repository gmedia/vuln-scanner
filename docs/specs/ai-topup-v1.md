# Spec: AI Wallet Top-Up v1 (Midtrans + manual transfer)

**Status:** **Design locked 2026-11-07** (issue #1311). Implementation follows the slice plan in §12.
**Depends on:** [`ai-gateway-v1.md`](ai-gateway-v1.md) (wallet, ledger, `/v1`), [`payments-v1.md`](payments-v1.md) (provider engine, webhook authority), [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) (I10: top-up is not an invoice), [`promo-codes-v1.md`](promo-codes-v1.md) (PC18: a promo never creates wallet credit).
**Supersedes:** the `ai-gateway-v1.md` §4 motion row (“Prepaid IDR top-up by admin/ops”) and the §5 actor row that grants top-up to platform admin only. Those become the **additional** platform-admin path; org owner/admin self-serve is added by this spec.

---

## 0) Why

The AI wallet (`ai_wallets`, `ai_wallet_ledger`) already exists and is charged per request. The only
way to add money is `POST /api/admin/ai/wallets/{org_id}/topup`, which:

- is platform-admin only, so a customer cannot fund themselves;
- credits immediately with no order, no payment reference, and no audit trail beyond one ledger row;
- commits inside the service (`ai_wallet.py:260`), so it cannot join a larger transaction;
- is not idempotent — a double click credits twice, because the ledger unique index only covers
  `(kind, reservation_id)` and `topup` rows have `reservation_id = NULL` (`ai_gateway.py:260-267`).

This spec adds a customer-facing top-up with two paths: **automatic** (Midtrans Snap redirect,
already integrated for invoices) and **manual** (bank transfer + proof upload + admin verification).

## 1) Locked decisions

| ID | Topic | Decision |
|----|--------|----------|
| TU1 | Order model | **Dedicated `ai_topup_orders`**. Do not add `product='ai'` to `OrgInvoice`: `INVOICE_PRODUCTS` excludes it (`models/invoice.py:21`), and invoice semantics (SKU, period, seat, tax, dunning) do not describe a prepaid balance. |
| TU2 | Catalog | **`ai_topup_packs`**. Amount and credit come from the server row, never from the request body. |
| TU3 | Payment engine | **Reuse `payment_attempts` + the existing webhook pipeline.** No second payment stack. |
| TU4 | Discriminator | `payment_attempts.payable_kind ∈ {invoice, topup}`. Never infer the payable from nullable FKs. |
| TU5 | Exactly-once | Unique `ai_wallet_ledger (topup_order_id) WHERE kind = 'topup' AND topup_order_id IS NOT NULL`, plus an order row lock, plus an `IntegrityError` savepoint. |
| TU6 | Settlement authority | The **webhook is the only thing that may settle a crypto/VA payment**. `succeeded` is authoritative **even after the local order expired**; a provider-confirmed payment is never discarded. |
| TU7 | Provider | **Midtrans only**, redirect flow, matching PY2/PY15. No Snap.js, no iframe, no hosted fields. |
| TU8 | Manual default | Manual bank transfer stays available when `PAYMENT_GATEWAY_ENABLED=false` (PY1). |
| TU9 | Access | Org **owner/admin** may create, upload, checkout, cancel. Member/viewer read-only (PY3). |
| TU10 | Amount | Exactly the pack or order amount. No partial payment, no client-supplied amount, no currency other than IDR (PY5). |
| TU11 | One method per order | Switching method = cancel + new order. |
| TU12 | Pending guard | Manual approval is **409 while a gateway attempt is pending**, mirroring PY13, unless `force=true` with a recorded reason. |
| TU13 | Refunds | Recorded and queued for ops, **no automation** (PY14). An admin resolves `refund_review` manually. |
| TU14 | Credit expiry | None in v1. |
| TU15 | Bonus | Column exists, value 0 in v1 until finance sets a pack. |
| TU16 | Money type | `BIGINT` for every IDR amount that accumulates. Postgres `INTEGER` caps at 2,147,483,647. |
| TU17 | Proof storage | Private, never publicly addressable, **fail closed** when the storage backend cannot guarantee it. |
| TU18 | Tab budget | New pages are routes, not tabs. Both `/ai` and `/admin/ai` already use the 5-tab maximum. |

### Explicitly not this spec

- No change to `OrgInvoice`, `SkuCatalog`, `sku_tiers`, subscriptions, or dunning.
- No promo code may create or increase wallet credit (PC18).
- No merging with `users.credits` / `credit_logs` (scan credits).
- No auto-renew, no recurring card tokens, no card data of any kind.
- No multi-currency, no instalments, no partial payments.
- No new environment variables (bank destination reuses `INVOICE_BANK_*`).

## 2) Data model

### 2.1 `ai_topup_packs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `code` | varchar(32) unique | stable identifier |
| `label` | varchar(64) | admin-facing |
| `amount_idr` | bigint > 0 | what the customer pays |
| `bonus_idr` | bigint >= 0 default 0 | reserved; 0 in v1 |
| `active` | boolean default true | only active packs are sellable |
| `sort_order` | integer default 0 | |
| `created_at`, `updated_at` | timestamptz | |

The migration seeds **no rows**. Prices are an owner/finance decision, not a code constant. Pack CRUD
ships before the customer page so the catalog is never empty.

### 2.2 `ai_topup_orders`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK `organizations` cascade, indexed | |
| `created_by_user_id` | UUID FK `users` set null | |
| `pack_id` | UUID FK `ai_topup_packs` set null | |
| `pack_code` | varchar(32) null | snapshot, survives pack deletion |
| `reference_code` | varchar(32) unique | customer bank-transfer reference |
| `amount_idr` | bigint >= 0 | money actually received |
| `credit_idr` | bigint > 0 | money credited to the wallet |
| `bonus_idr` | bigint >= 0 default 0 | |
| `currency` | varchar(3) default 'IDR' | CHECK `= 'IDR'` |
| `payment_method` | varchar(20) | `manual_transfer` \| `midtrans` \| `admin_credit` |
| `status` | varchar(24) | see §2.4 |
| `proof_object_key` | varchar(512) null | **internal only**, never in a client DTO |
| `proof_mime`, `proof_size_bytes`, `proof_uploaded_at` | | |
| `bank_ref` | varchar(64) null | admin-entered transfer reference |
| `verified_by_user_id`, `verified_at`, `rejection_reason` | | |
| `paid_at`, `expires_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

Constraints:

```text
CHECK (credit_idr = amount_idr + bonus_idr)
CHECK (currency = 'IDR')
CHECK (payment_method IN ('manual_transfer','midtrans','admin_credit'))
CHECK (status IN ('pending_payment','awaiting_verification','paid','rejected',
                  'expired','canceled','refunded','refund_review'))
CHECK (status <> 'awaiting_verification' OR proof_object_key IS NOT NULL)
CHECK (payment_method <> 'admin_credit' OR amount_idr = 0)
CHECK (payment_method <> 'admin_credit' OR bonus_idr = credit_idr)
CHECK (payment_method = 'admin_credit' OR amount_idr > 0)
INDEX (organization_id, created_at DESC)
INDEX (status, created_at)
```

`admin_credit` is goodwill: no money is received, so `amount_idr = 0` and the whole credit is bonus.
Without those two CHECKs a goodwill grant either records phantom revenue or violates `amount_idr > 0`.

### 2.3 `payment_attempts` additions

```text
+ topup_order_id UUID NULL FK ai_topup_orders ON DELETE SET NULL, indexed
+ payable_kind  VARCHAR(10) NOT NULL DEFAULT 'invoice'
+ CHECK (payable_kind IN ('invoice','topup'))
+ CHECK (payable_kind <> 'invoice' OR invoice_id IS NOT NULL)
+ CHECK (payable_kind <> 'topup'   OR topup_order_id IS NOT NULL)
+ CHECK (NOT (invoice_id IS NOT NULL AND topup_order_id IS NOT NULL))
+ UNIQUE INDEX uq_payment_attempt_pending_topup (topup_order_id)
+   WHERE status = 'pending' AND topup_order_id IS NOT NULL
```

`uq_payment_attempt_pending_invoice` is unchanged and unaffected: a top-up row has
`invoice_id = NULL`, so it never enters that partial index.

Both new partial indexes must declare `postgresql_where` **and** `sqlite_where`
(pattern: `models/billing.py:132-146`). A Postgres-only predicate makes the SQLite test schema
create a full unique index, which would reject the second attempt for an order forever.

`ck_payment_attempt_invoice_required` is added as `NOT VALID` on Postgres. `payment_attempts.invoice_id`
was nullable before this feature, so a historical row without an invoice would otherwise abort
`alembic upgrade head` and therefore every deploy. `NOT VALID` still rejects a new `invoice`-kind row
with a NULL invoice; it only skips the one-time scan of pre-existing rows. No backfill is invented.

### 2.4 State machine

```text
                 (manual, proof uploaded)
pending_payment ───────────────────────► awaiting_verification ──approve──► paid
      │                                          │
      │ (midtrans webhook succeeded)             └──reject──► rejected
      ├──────────────────────────────────────────────────────► paid
      ├──(local TTL / provider expiry)──────────────────────► expired
      ├──(user/admin cancel)────────────────────────────────► canceled
      └──(webhook failed)───────────────────────────────────► pending_payment (retryable)

paid ──(refund / chargeback)──► refunded       (admin resolved, clawback applied)
paid ──(refund / chargeback)──► refund_review  (default; ops decides)
```

Rules:

- `paid` is terminal for credit; only a refund moves money out.
- `rejected`, `expired`, `canceled` are terminal for **customer intent**, not for **money**. A
  provider `succeeded` that arrives afterwards still credits the order (TU6). Only an order that is
  already `paid`/`refunded`/`refund_review` refuses a second credit.
- `awaiting_verification` never auto-expires; it raises a backlog alert instead.
- Manual orders expire after 3 days. Midtrans follows the provider expiry (24h) and, at checkout,
  `order.expires_at = min(order.expires_at, attempt.expires_at)` so the local sweep and the provider
  never disagree.
- Approving a manual order while a gateway attempt is `pending` is 409 unless `force=true` (TU12).

### 2.5 `ai_wallet_ledger` additions

```text
+ topup_order_id UUID NULL FK ai_topup_orders ON DELETE SET NULL
+ UNIQUE INDEX uq_ai_wallet_ledger_topup_order (topup_order_id)
+   WHERE kind = 'topup' AND topup_order_id IS NOT NULL
+ kind gains 'refund'
```

The predicate **must** include `kind = 'topup'`. A unique index on `topup_order_id` alone makes a
clawback row for the same order impossible, which would make refunds unimplementable.

Every balance mutation still writes exactly one ledger row in the same transaction as the wallet
update, so `sum(delta_idr) == balance_idr` continues to hold.

## 3) Service design

### 3.1 `ai_wallet.credit()` and `ai_wallet.adjust()`

`topup()` today commits internally and refuses amounts `< 1`. Both facts are wrong for settlement and
refund. Split it:

```python
async def credit(db, *, organization_id, amount_idr, kind="topup",
                 topup_order_id=None, actor_user_id=None, note=None, commit=False) -> AiWallet
async def adjust(db, *, organization_id, delta_idr, kind="manual_adjust",
                 topup_order_id=None, actor_user_id=None, note=None, commit=False) -> AiWallet
```

- `credit()` requires `amount_idr >= 1`; `adjust()` accepts a signed delta and still relies on the DB
  `balance_after_idr >= 0` check.
- Both pass `topup_order_id` and `note` to `_ledger()`. The `note` column already exists in the model
  but was never written.
- `commit=False` is the default so the caller can compose order + ledger + payment event atomically.
- The legacy `topup()` becomes `credit(..., commit=True)` **and keeps `await db.refresh(wallet)`**, so
  the admin response does not return a stale balance (`tests/test_ai_wallet.py:286-292`).

### 3.2 `TopupService`

| Method | Contract |
|--------|----------|
| `list_packs(db, active_only)` | Catalog read. |
| `create_order(db, org, actor, pack_id, method)` | Pack must be active; amounts copied from the pack; unique `reference_code`; `expires_at` per method; status `pending_payment`. |
| `submit_proof(db, order, actor, upload)` | Status must be `pending_payment`; magic-byte sniff; 5 MB cap; store private object; status `awaiting_verification`. |
| `approve(db, order, admin, bank_ref, force)` | `SELECT … FOR UPDATE`; 409 if a pending gateway attempt exists and `force` is false; idempotent when already `paid`; `credit(commit=False)`; insert a `PaymentAttempt(provider='manual', status='succeeded', payable_kind='topup', topup_order_id=…)`; set `paid`. |
| `reject(db, order, admin, reason)` | `rejected`, no credit. |
| `cancel(db, order, actor)` | Only `pending_payment`/`awaiting_verification`; cancels a pending attempt through `PaymentService.cancel_attempt` (best effort at the provider). |
| `expire_stale(db, now)` | `pending_payment` with `expires_at < now()` → `expired`; never touches `awaiting_verification`; never removes the right to credit a later `succeeded`. |
| `handle_gateway_event(db, attempt, order, record, provider, event)` | Amount check, rank guard, transition, credit; fills `record.error` on failure. |
| `resolve_refund(db, order, admin, action, note)` | `clawback` → `adjust(delta=-credit_idr, kind='refund')`; `write_off` → no ledger movement. Both audited. |

Amount is always the server-side pack value. The request body never carries a price.

### 3.3 `PaymentService` generalization

Extract `_create_checkout(payable, …)` where `payable` exposes `id`, `organization_id`, `number`,
`amount_idr`, `status`, `description`, `payable_kind`.

- `create_checkout(inv, …)` keeps its signature and delegates.
- `blocking_attempt` / `pending_attempts` take an explicit `invoice_id` **or** `topup_order_id`.
  The `max(attempt_seq)` query and the `IntegrityError` recovery must use the **same** key; today both
  hard-code `invoice_id` (`payments/service.py:179-184`, `:207`), which would compute sequences across
  invoices and fail the double-click recovery.
- Top-up `order_id` = `<reference_code>-A<seq>` — no double `AI-AI-` prefix, ≤ 50 chars, must pass
  Midtrans `_ORDER_ID_RE` (`payments/midtrans.py:157-159`).
- Top-up `customer_email` is the acting user's email, not the invoice billing profile.
- After checkout: `order.expires_at = min(order.expires_at, attempt.expires_at)`.
- Update the `fake_blocking` monkeypatch in `tests/test_payment_checkout.py:414-423` for the new key.

### 3.4 Webhook settlement branch

In `BillingService._apply_gateway_event`, branch on `attempt.payable_kind` **before** the invoice
lookups:

```python
if attempt.payable_kind == "topup":
    order = await self.db.get(AiTopupOrder, attempt.topup_order_id, with_for_update=True)
    if order is None:
        record.error = "unknown top-up order"
        return "failed"
    return await TopupService(self.db).handle_gateway_event(attempt, order, record, provider, event)
```

| Event | Action |
|-------|--------|
| `succeeded` | Verify provider status, amount == `order.amount_idr`, rank guard, then credit if and only if no `kind='topup'` ledger row exists for the order. Client `pending`/`expired` no longer blocks a provider-confirmed payment. |
| `pending` | Update attempt provider status/method; order stays `pending_payment`. |
| `failed` | Attempt `failed`; order stays `pending_payment` (retryable). |
| `expired` / `canceled` | Attempt `expired`; order `expired`/`canceled` unless a `succeeded` already settled it. |
| `refunded` / `partially_refunded` / `chargeback` | Only after the attempt ever succeeded (mirror `billing.py:714-731`); set `refund_review` for ops. |
| `ignored` | No change. |

Wrap `credit()`/`adjust()` in `begin_nested()`. On a unique-ledger `IntegrityError`: roll back the
savepoint, re-read the order `FOR UPDATE`, and return `duplicate` when it is already `paid` with a
ledger row. Otherwise re-raise.

The invoice branch (`_apply_gateway_succeeded`) is **not** modified.

### 3.5 Idempotency matrix (honest version)

| Scenario | Guarantee |
|----------|-----------|
| Same `event_id`, sequential | `payment_events` unique → `duplicate` |
| Same `event_id`, concurrent | Loser's insert raises → `duplicate` (`billing.py:487-491`) |
| Different `event_id`, same order, sequential | Order already `paid` → `duplicate` |
| Different `event_id`, same order, concurrent | Wallet row lock serialises; loser hits the ledger unique → savepoint rollback → `duplicate` **if** the savepoint handling above is implemented. Without it the loser returns 500 and relies on the provider retry. **Test asserts exactly one credit.** |
| Admin approve twice | `FOR UPDATE` + status guard + savepoint → 200 idempotent |
| Approve racing a webhook | Order lock + savepoint; loser returns 200 `duplicate`, not 500 |
| Checkout double click | `uq_payment_attempt_pending_topup` + recovery keyed on `topup_order_id` |
| Expire worker racing approve | Order lock; expire only while `pending_payment` |
| Expire, then `succeeded` | `succeeded` is authoritative → one credit (TU6) |
| Refund after credit | `adjust()` with `kind='refund'` → does not violate the `kind='topup'` unique index |

## 4) API

### 4.1 Customer — JWT + active org

Customer routes 404 when `AI_GATEWAY_ENABLED=false` (the `ai_routes._disabled` pattern).

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/ai/topup/packs` | viewer | active packs only |
| POST | `/api/ai/topup/orders` | **org owner/admin** | `{pack_id, method}`; server-side amount |
| GET | `/api/ai/topup/orders` | viewer | paginated history for the org |
| GET | `/api/ai/topup/orders/{id}` | viewer | status + bank copy while payable |
| POST | `/api/ai/topup/orders/{id}/proof` | **org owner/admin** | multipart `file` |
| POST | `/api/ai/topup/orders/{id}/checkout` | **org owner/admin** | `{provider:"midtrans"}` → `{redirect_url}` |
| POST | `/api/ai/topup/orders/{id}/cancel` | **org owner/admin** | |

Rules:

- **Do not use `require_billing_write`.** `billing_access.READ_ONLY_STATUSES = ("past_due","canceled")`
  (`billing_access.py:32`) would block the exact customer who needs AI balance, and a prepaid top-up
  is not a new commitment. Gate on owner/admin + `AI_GATEWAY_ENABLED` instead. This mirrors the
  existing rule for invoice checkout (`payments-v1.md` §7: use `require_membership(min_role="admin")`,
  not `BILLING_WRITE_ORG`).
- `checkout` requires `payment_method='midtrans'`; otherwise 409.
- Manual works with `PAYMENT_GATEWAY_ENABLED=false` (TU8).
- Customer and admin DTOs differ. A customer response never contains `proof_object_key`, `bank_ref`,
  `verified_by_user_id`, or an internal rejection reason.
- Bank copy only while `pending_payment` + `manual_transfer`. If `INVOICE_BANK_*` is unset, creating a
  manual order returns 503 with an ops-facing message instead of an empty account block.
- Rate limits: create 10/min, proof 10/min, checkout 20/min per user (pattern `payment_routes.py:27-38`).

### 4.2 Admin — platform admin

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/ai/topup/orders` | filter by `status`, `organization_id` |
| GET | `/api/admin/ai/topup/orders/{id}` | detail + proof metadata (never the object key) |
| GET | `/api/admin/ai/topup/orders/{id}/proof` | streamed, admin auth only |
| POST | `/api/admin/ai/topup/orders/{id}/approve` | `{bank_ref?, force?}` |
| POST | `/api/admin/ai/topup/orders/{id}/reject` | `{reason}` |
| POST | `/api/admin/ai/topup/orders/{id}/resolve-refund` | `{action: "clawback"\|"write_off", note}` |
| GET/POST/PATCH | `/api/admin/ai/topup/packs` | pack CRUD |
| POST | `/api/admin/ai/wallets/{org_id}/topup` | **legacy**, unchanged; gains an optional `idempotency_key` |

**The admin queue must stay alive when `AI_GATEWAY_ENABLED=false`.** If ops disables AI while proofs
are pending, a customer has already paid and must still be creditable. Only the customer routes 404.

## 5) Proof-of-transfer storage

- Private object storage. Key: `topup-proofs/<org_id>/<order_id>/<uuid4>.<ext>`.
- **Fail closed.** `LocalObjectStorage.put_file()` ignores the `key` and returns a local path
  (`object_storage.py:72-75`), and the default `upload_dir=/tmp/scans` (`config.py:93`) is a container
  volume wiped by `deploy.sh`. Uploading proofs there would silently lose them. When
  `OBJECT_STORAGE_BACKEND=local` in production, reject the upload with 503; or implement a dedicated
  local proof store with random file names plus a documented backup. Never call `put_file` as-is for
  proofs.
- No original filename in the key or the database. A name like `transfer-BCA-<account>.jpg` is PII.
- Allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- **Mandatory magic-byte sniff**, not optional (pattern `scan_routes.py:314-317`). Store the sniffed
  MIME, not the client `Content-Type`.
- Max 5 MB, a service constant.
- Serving: allowlisted `Content-Type`, `X-Content-Type-Options: nosniff`,
  `Content-Disposition: attachment`, no public URL.
- The SPA must fetch with `responseType: 'blob'` and `URL.createObjectURL`. An `<img>`/`<iframe>`
  cannot send the bearer token, and the CSP (`object-src 'none'`) blocks PDF frames. PDF is
  download-only.
- Replace flow: write the new object, commit, then delete the old one. On a DB failure delete the new
  object so it does not orphan.
- Never log file contents, original names, or PII. No antivirus/OCR in v1.

## 6) Frontend

| Route | Page | Notes |
|-------|------|-------|
| `/ai/topup` | new AiTopup page | pack list + method choice |
| `/ai/topup/:orderId` | new AiTopupStatus page | bank instructions / Midtrans redirect / proof upload / final status |
| `/admin/ai/topups` | new AdminAiTopups page | verification queue |

Source files land under `frontend/src/pages/ai/` and `frontend/src/pages/admin/`; the page-registry rows are added in S4/S5 together with the files (the `check-design-docs` gate requires the source to exist).

- **Routes, not tabs.** `Ai.tsx:36` and `AdminAi.tsx:36` already hold 5 tabs; a 6th is forbidden by
  the design invariant.
- `AiWalletPanel` CTA derives the role from the **active-org membership**, not `user.is_admin`
  (`Ai.tsx:49` is wrong today). Owner/admin → `/ai/topup`; member/viewer → "ask an owner".
- Manual flow: create → bank copy + `reference_code` → upload → poll status. Midtrans flow: checkout →
  redirect → return → poll. **Never** trust `?status=finish`.
- Poll 3s and stop after 60s with a "check again" button (pattern `PayInvoice.tsx:43-44,222-238`).
- Admin queue: status filter defaulting to `awaiting_verification`, row actions through a dropdown
  (2+ actions), destructive last, `AlertDialog` for reject, `invalidateQueries` + toast after mutation.
- New `topup` i18n namespace, en + id, registered in `i18n/index.ts` (`resources` **and** `ns`; note
  that `ai` is currently missing from the `ns` list — do not copy that omission). No raw route paths in
  copy (`i18n.test.ts:20-30`).
- Every mutation surfaces `onError` (`apiErrorMessage` / `useApiFormErrors`) and a visible `onSuccess`.
- `Select` not native `<select>`; `Label` + `Input`; `FieldError` per field; row actions right-aligned;
  mobile trigger ≥ 44px via a `desktop` prop.

## 7) Worker, metrics, alerts

- New task `expire_stale_topup_orders` on the `ip_scan` queue, beat every 15 minutes. It only moves
  `pending_payment` past `expires_at` to `expired`.
- Existing Midtrans reconciliation already covers top-up attempts because it looks up by
  `provider_order_id`.

Metrics are **scrape-time DB reads**, not in-process counters (the API is multi-process and workers are
separate). Pattern: `_read_payment_*` in `metrics.py:310-435`.

| Metric | Type |
|--------|------|
| `vuln_ai_topup_orders_total{status,method}` | gauge |
| `vuln_ai_topup_pending_age_seconds{method}` | gauge |
| `vuln_ai_topup_pending_overdue_total` | gauge |
| `vuln_ai_topup_awaiting_verification_total` | gauge |
| `vuln_ai_topup_refund_review_total` | gauge |
| `vuln_ai_topup_webhook_failed_total` | gauge |

**Every exported `vuln_*` name must appear literally in an alert rule** (`check-alert-metrics.mjs`).

**Isolation is mandatory:** `payment_attempts` now holds top-up rows. Every existing
`vuln_payment_*` reader must be scoped to `payable_kind = 'invoice'`, or a top-up backlog will page as
a fake invoice SLO breach.

## 8) Security

- Server-side amounts only; the client cannot name a price.
- Admin proof download is the only read path; no signed public URL.
- Webhook signature, `order_id`, `status_code`, `fraud_status`, and amount are verified (PY10).
- No card data, no Snap.js, no iframe (PY15). Secrets never in the SPA, git, logs, or
  `payment_events.payload` (PY16).
- Audit: `verified_by_user_id` + ledger `actor_user_id` + `bank_ref` on every manual approval.
- Public repo hygiene: the spec and runbook carry no host, port, account number, key, or customer data.

## 9) Observability and ops

- Alert: verification backlog > 20 for 2h.
- Alert: `pending_overdue > 0` for 15m.
- Alert: any `refund_review`.
- Alert: any failed top-up webhook event.
- Runbook `docs/ai-topup-ops.md`: how to read the queue, approve, reject, resolve a refund, rotate the
  bank destination, and what to do when a customer claims a transfer is missing.

## 10) Test plan

**Backend**

- Catalog: only active packs are sellable; the request body cannot override the amount.
- Auth: owner/admin create; member/viewer 403; foreign org 404; flag off 404; `past_due` **allowed**.
- Manual: create → proof → approve → `paid` + one credit; double approve idempotent; reject leaves the
  balance unchanged; cancel cancels the attempt; expire never credits.
- Midtrans: one pending attempt on double click; amount mismatch fails without credit; duplicate
  `event_id`; two `event_id`s for one order = one credit; expired → `succeeded` still credits; refund
  before settle ignored; `order_id` passes the Midtrans regex and ≤ 50 chars.
- Concurrency (Postgres suite): parallel webhooks = one credit; approve vs webhook = one credit and a
  200/duplicate loser; parallel checkouts = one attempt; manual approve with a pending gateway
  attempt = 409.
- Ledger: `sum(delta_idr) == balance_idr` across topup + reserve + settle + release + clawback;
  `note` equals the reference code; exactly one `kind='topup'` row per order.
- Worker: expire task leaves `awaiting_verification` alone; a later `succeeded` still credits.
- Regression: the full invoice/payment/billing suites stay green; `test_ai_wallet.py:286-292` stays green.
- Migrations: one head, `make check-alembic`, revision id ≤ 32 chars, both dialect predicates present.
- Metrics: a top-up attempt never counts toward `vuln_payment_*`.

**Frontend**

- Form feedback on every mutation; i18n parity; no native `<select>`; upload accept/size; polling
  never marks paid from the query string; both routes registered; design-invariant tests.

## 11) Open decisions (owner/finance)

| # | Question | Default |
|---|----------|---------|
| 1 | Pack values and any bonus | no bonus, values entered by owner |
| 2 | PPN on prepaid balance | no tax line in v1; `amount = credit` |
| 3 | Credit expiry | none |
| 4 | Midtrans fee bearer | Sinexis |
| 5 | Receipt PDF / email notification | none in v1 |
| 6 | Small-transfer auto-approval | no; every manual order is verified |

## 12) Rollout slices

| Slice | Contents | Gate |
|-------|----------|------|
| S0 | This spec + amendments to `ai-gateway-v1.md`, `payments-v1.md`, page registry | docs only |
| S1 | Migration, models, `credit`/`adjust`, pack CRUD, ledger invariant tests | `alembic heads`, pytest |
| S2 | Manual orders, proof storage (fail-closed), customer + admin API | pytest |
| S3 | `PaymentService` seam, `payable_kind` webhook branch, Midtrans, concurrency tests | PG suite |
| S4 | Customer UI `/ai/topup` + status | lint, tsc, vitest, form-feedback |
| S5 | Admin queue `/admin/ai/topups` | design invariants, vitest |
| S6 | Expire worker, metrics, alerts, runbook | alert-metrics |

Manual (S1–S2, S4) ships and is verifiable before Midtrans (S3) touches the invoice webhook path.

## 13) Definition of done

- [ ] A customer can create a manual order, transfer, upload proof, and see the status.
- [ ] An admin can open the queue, view the proof, and approve or reject.
- [ ] A customer can pay by Midtrans and the wallet is credited from the webhook.
- [ ] Each order credits exactly once, proven by a concurrency test.
- [ ] Ledger sum equals balance; drift gauge zero.
- [ ] Invoice and subscription behaviour unchanged (regressions green).
- [ ] i18n, form feedback, design invariants, alert-metrics green.
- [ ] Single Alembic head; no new env var; runbook published without PII.
