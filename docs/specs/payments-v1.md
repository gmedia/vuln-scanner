# Spec: Payments v1 (provider-agnostic, Midtrans first)

**Status:** **Named by the owner 2026-11-04** (`lanjut eksekusi`). Design locked; implementation tracked by the PR chain in §12.
**Supersedes:** the "no payment gateway" statements in [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) I3/I10 and [`billing-core-v1.md`](billing-core-v1.md) §1/§8.1. Manual bank transfer remains the default path; the gateway is an **optional additional** path.
**Related:** [`promo-codes-v1.md`](promo-codes-v1.md), [`billing-core-v1.md`](billing-core-v1.md), [`subscription-page-v1.md`](subscription-page-v1.md).

---

## 0) Why

Customers currently pay only by manual bank transfer on an admin-issued invoice. That is correct for enterprise/PO buyers but adds ops latency for self-serve SMB and hospitality. This spec adds an **authenticated, in-app payment page** that can charge the same invoice through a gateway, without replacing the manual path and without turning Sinexis into a checkout product.

It is deliberately **not** a checkout, not a store, not a subscription-billing engine, and not a public payment link.

## 1) Locked decisions

| ID | Topic | Decision |
|----|--------|----------|
| **PY1** | Default | Gateways are **off** by default (`PAYMENT_GATEWAY_ENABLED=false`). Manual bank transfer stays fully functional and is always shown. The flag gates **new checkouts only**: inbound webhooks and reconciliation keep running while it is off so in-flight payments still settle. |
| **PY2** | Provider v1 | **Midtrans Snap, redirect flow only.** Xendit and Stripe are future adapters behind the same interface. |
| **PY3** | Access | **Authenticated org owner/admin only.** No public payment link, no unauthenticated invoice view, no customer portal. |
| **PY4** | Payable invoice | Only `status='sent'` and `total_idr > 0`. `draft`, `paid`, `void` → 409. |
| **PY5** | Amount | Exactly `org_invoices.total_idr` — post-promo and post-tax. No partial payments, no client-supplied amount, no currency other than IDR. |
| **PY6** | Authority | The **webhook** is the only thing that may mark an invoice paid. The SPA never marks paid; polling only reflects server state. |
| **PY7** | One pending attempt per invoice | Across **all** providers. A repeat click with the same provider returns the existing `redirect_url`; a different provider is 409 until the pending attempt is expired or cancelled. |
| **PY8** | Persist first | The `payment_attempt` row is inserted **before** the provider is called. `order_id` comes from a DB sequence per invoice (`attempt_seq`); it is never reused, not even after expiry/failure. |
| **PY9** | Idempotency | `payment_events (provider, event_id)` is unique. Midtrans `event_id` = `transaction_id:transaction_status:status_code:fraud_status`. |
| **PY10** | Verification | Signature, `order_id`, `status_code`, `fraud_status`, and amount are all verified. Any mismatch is a **failed event**, never an activation. |
| **PY11** | State monotonicity | Attempt rank: `pending(0) < failed(1) = expired(1) = canceled(1) < succeeded(2) < refunded(3)`. Lower-rank events are ignored. |
| **PY12** | Expiry + reconciliation | Checkout expires after 24h. An hourly worker reconciles pending attempts and a local sweep expires stale ones. Webhooks can be missed; polling is never the source of truth. |
| **PY13** | Void / manual paid guard | Void or `POST /admin/invoices/{id}/paid` is **409 while a pending gateway attempt exists**. A platform admin may use `force=true` with a reason; that cancels/expires attempts first and is audited. |
| **PY14** | Refunds | Out of scope. `refund`/`partial_refund`/`chargeback` are recorded with `refunded_amount_idr` and alert ops. No automatic access revocation. |
| **PY15** | Card data | Never touches Sinexis. **No Snap.js, no iframe, no hosted fields.** Redirect only. PCI scope stays close to SAQ-A. |
| **PY16** | Secrets | Server key is backend-only. Never in the SPA, git, logs, error bodies, or `payment_events.payload`. |
| **PY17** | Config guard | Production mode with a sandbox key, or sandbox mode with a production key, refuses startup. Gateway enabled with an empty key refuses startup. |
| **PY18** | Observability | Metrics and alerts for pending age, webhook failures, amount mismatch, duplicate payment. Added in the same PR as the metric names. |
| **PY19** | AI wallet top-up | The same attempt + webhook engine also settles AI wallet top-up orders. `payment_attempts` gains `payable_kind ∈ {invoice, topup}` and a nullable `topup_order_id`; a top-up attempt has `invoice_id = NULL` and its own partial unique pending index. Amount is verified against `ai_topup_orders.amount_idr`; `succeeded` is authoritative even after local expiry. Full contract: [`ai-topup-v1.md`](ai-topup-v1.md). Existing `vuln_payment_*` readers must be scoped to `payable_kind = 'invoice'`. |

## 2) Provider abstraction

`backend/app/services/payments/`:

```
base.py      # Protocol + dataclasses
registry.py  # name -> adapter, enabled_providers()
midtrans.py  # Snap adapter
```

```python
class PaymentProvider(Protocol):
    name: str
    def configured(self) -> bool: ...  # key present + mode consistent: can process inbound events
    def enabled(self) -> bool: ...  # configured + gateway flag: may start a new checkout
    async def create_checkout(self, req: CheckoutRequest) -> CheckoutResult: ...
    async def parse_webhook(self, raw_body: bytes,
                            headers: Mapping[str, str]) -> NormalizedEvent: ...
    async def fetch_status(self, attempt: PaymentAttempt) -> StatusResult: ...
    async def cancel(self, attempt: PaymentAttempt) -> bool: ...
```

- `CheckoutRequest`: `order_id`, `amount_idr`, `currency`, `invoice_number`, `description`, `customer_email`, `customer_name`, `return_url`, `cancel_url`, `idempotency_key`.
- `CheckoutResult`: `provider`, `provider_order_id`, `provider_payment_id`, `provider_token`, `redirect_url`, `expires_at`, `amount_idr`, `currency`, `raw`.
- `NormalizedEvent`: `event_id`, `kind` ∈ `{succeeded, pending, failed, expired, canceled, refunded, partially_refunded, chargeback, ignored}`, `provider_order_id`, `provider_payment_id`, `amount_idr`, `currency`, `fee_idr`, `refunded_amount_idr`, `method`, `failure_code`, `failure_message`, `raw`.
- `StatusResult`: `found: bool`, `event: NormalizedEvent | None`, `error: str | None`.

**`raw_body` is mandatory.** Stripe verifies HMAC over raw bytes; a `dict` contract would force a breaking change later. **`cancel` takes the attempt, not the order id**, because Midtrans cancels by Snap token.

These fields exist now so Xendit/Stripe can be added **without a schema migration**.

## 3) Midtrans adapter

| Item | Value |
|---|---|
| Snap base | `https://app.sandbox.midtrans.com` / `https://app.midtrans.com` |
| Status API base | `https://api.sandbox.midtrans.com` / `https://api.midtrans.com` |
| Create | `POST {SNAP_BASE}/snap/v1/transactions`, `Authorization: Basic base64(server_key + ":")` |
| Status | `GET {API_BASE}/v2/{order_id}/status`, Basic auth, 5s timeout |
| Cancel | `POST {SNAP_BASE}/snap/v1/transactions/{provider_token}/cancel` |

Request body:

```json
{
  "transaction_details": {"order_id": "SX-202611-0001-A1", "gross_amount": 715000},
  "item_details": [{"id": "SX-202611-0001", "price": 715000, "quantity": 1, "name": "Sinexis Scan Pro"}],
  "customer_details": {"first_name": "<truncated org name>", "email": "<billing or owner email>"},
  "callbacks": {
    "finish": "https://sinexis.app/pay/<invoice_id>?status=finish",
    "unfinish": "https://sinexis.app/pay/<invoice_id>?status=unfinish",
    "error": "https://sinexis.app/pay/<invoice_id>?status=error"
  },
  "expiry": {"unit": "hours", "duration": 24}
}
```

Rules:

- `order_id` ≤ 50 chars, `[A-Za-z0-9._~-]`, unique per merchant. Format `SX-YYYYMM-NNNN-A<attempt_seq>`.
- `gross_amount` is an integer on create; a **string with two decimals** (`"715000.00"`) in notifications.
- `sum(item_details.price × quantity) == gross_amount` exactly. Use one line at the invoice total in v1.
- `customer_details.first_name` is length-limited; truncate to 50 and fall back to the invoice number. Email is required before calling Snap.
- Signature: `SHA512(order_id + status_code + gross_amount + server_key)` over the **raw** strings from the body, compared constant-time to `signature_key` in the body.
- Status mapping:

| `transaction_status` | Condition | Normalized |
|---|---|---|
| `capture` | `status_code == "200"` and `fraud_status in ("", "accept")` | `succeeded` |
| `capture` | `fraud_status == "challenge"` | `pending` |
| `settlement` | `status_code == "200"` | `succeeded` |
| `pending`, `authorize`, `authorized` | — | `pending` |
| `deny`, `cancel`, `failure` | — | `failed` |
| `expire` | — | `expired` |
| `refund`, `partial_refund` | — | `refunded` / `partially_refunded` |
| `chargeback`, `partial_chargeback` | — | `chargeback` |
| anything else | — | `ignored` |

- Lowercase `transaction_status` before mapping. Midtrans can send uppercase (`PENDING`).
- Amount compare: `Decimal(raw_gross_amount) == Decimal(invoice.total_idr)`. Never `float`, never re-format the raw string for the signature.
- Duplicate `order_id` → `406`. Handle by looking up the existing attempt/provider status, never by silently creating another.

## 4) Webhook

`POST /api/webhooks/payments/{provider}` reads the **raw body** with a 64 KB cap.

| Provider | Verification | Notes |
|---|---|---|
| `manual` | `X-Payment-Webhook-Secret` vs `PAYMENT_WEBHOOK_SECRET` (`compare_digest`) | 503 when the secret is unset |
| `midtrans` | `signature_key` from the body | No shared secret |

- Unknown provider or unconfigured provider → 404.
- A **configured** provider still accepts notifications while `PAYMENT_GATEWAY_ENABLED=false`; the flag only stops new checkouts.
- Bad signature → 401.
- Malformed JSON → 400.
- Body > 64 KB → 413.
- Return 200 for `processed`, `duplicate`, `ignored`, and permanently failed events; 500 only for transient DB errors so the provider retries.
- `nginx`: add `location /api/webhooks/payments/ { client_max_body_size 64k; }` to both configs.
- Redact `customer_details` and `signature_key` before storing `payment_events.payload`.
- Retention: `payment_events` rows are kept for **365 days** (`PAYMENT_EVENT_RETENTION_DAYS`); the daily `payment.prune_events` task deletes terminal (`processed`/`ignored`) rows older than that, while `received` (may be in flight) and `failed` (ops signal) are exempt at any age.

## 5) State machine

```
attempt:    pending(0) -> failed(1) | expired(1) | canceled(1) -> succeeded(2) -> refunded(3)
invoice:    draft -> sent -> paid          draft|sent -> void        zero-total: draft -> paid at creation
subscription: incomplete -> active         active -> past_due (only current-period invoice) -> active
redemption: applied -> released (void only)
event:      received -> processed | ignored | failed
```

- A successful event on an already-paid invoice records the attempt and flags a **duplicate payment**; it never re-activates the subscription.
- A failed/expired event sets `past_due` **only** when the attempt's invoice is the current period. A stale invoice failing must not poison a healthy subscription.

## 6) Data model

`payment_attempts` additions:

| Column | Type | Notes |
|---|---|---|
| provider_order_id | String(128) nullable | Midtrans `order_id` |
| provider_payment_id | String(128) nullable | Midtrans `transaction_id` |
| provider_token | String(512) nullable | Snap token (needed to cancel) |
| checkout_url | String(512) nullable | redirect URL |
| expires_at | DateTime(tz) nullable | |
| provider_status | String(32) nullable | last normalized status |
| fee_idr | Integer not null default 0 | |
| refunded_amount_idr | Integer not null default 0 | |
| attempt_seq | Integer nullable | order-id sequence per invoice |

Indexes:

- `uq_payment_attempt_provider_order (provider, provider_order_id) WHERE provider_order_id IS NOT NULL`
- `uq_payment_attempt_pending_invoice (invoice_id) WHERE status = 'pending'`
- `uq_payment_attempt_pending_topup (topup_order_id) WHERE status = 'pending' AND topup_order_id IS NOT NULL` (top-up orders; [`ai-topup-v1.md`](ai-topup-v1.md))

`provider_ref` stays **non-unique** (manual bank references repeat).

## 7) API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/invoices/{invoice_id}` | owner/admin of the invoice org | **New.** Resolves the org from the invoice so `/pay/:invoiceId` works for multi-org admins. |
| GET | `/api/orgs/{org_id}/invoices/{invoice_id}` | owner/admin | Existing; kept |
| GET | `/api/payments/providers` | authenticated | Enabled providers only, with mode; never keys |
| POST | `/api/orgs/{org_id}/invoices/{invoice_id}/checkout` | owner/admin | `{provider}`; 409 on any pending attempt across providers |
| POST | `/api/admin/payments/attempts/{id}/cancel` | platform admin | Provider cancel if token, else local expire |
| POST | `/api/webhooks/payments/{provider}` | per provider | §4 |

`InvoiceItem` adds `discount_idr`, `promo_code`, `payment_status`, `can_pay`.

**Checkout must use `require_membership(min_role="admin")`, not `BILLING_WRITE_ORG`.** A `past_due` org must be able to pay; the read-only gate would 403 the exact customer who needs to settle.

## 8) Frontend

Route `/pay/:invoiceId` under `ProtectedRoute` + `AppShell`.

- Fetches via `GET /api/invoices/{id}`.
- `ProtectedRoute` preserves `next`; `Login` honours same-origin `next` only.
- States: `draft` (not issued), `void`, `paid`, `sent` + total > 0, `sent` + total 0 (auto-paid shows "Lunas").
- Breakdown: Subtotal, Diskon (code), DPP, PPN, Total.
- Provider selector only when more than one is enabled.
- Primary action: checkout → `window.location.assign(redirect_url)`.
- Poll whenever `payment_status == "pending"` (on mount or return), every 3s up to 60s, then a manual refresh. Do not depend on `?status=finish` alone.
- Manual bank block remains.
- Entry point: "Bayar" on `sent` invoice cards where `can_pay`.

No Snap.js, no iframe, no external script. `window.location.assign` is **not** blocked by `form-action 'self'` (that directive governs form submissions only) and `default-src 'self'` does not govern top-level navigation, so the current CSP stands.

## 9) Env

```
PAYMENT_GATEWAY_ENABLED=false
PAYMENT_PROVIDERS_ENABLED=
MIDTRANS_SERVER_KEY=
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_VERIFY_STATUS=true
```

- Reuse `FRONTEND_URL` for finish/unfinish/error. Do **not** add a second public-URL var.
- `MIDTRANS_CLIENT_KEY` is **not** needed for redirect and must not be added.
- Every var goes into `.env.example` and every backend-rendering compose file; run `./scripts/check-env-inventory.sh`.

## 10) Security

- Signature + amount + order id + `status_code` + `fraud_status` are all required for success.
- Constant-time compare; no secret in logs or responses.
- 64 KB webhook cap at nginx and in the handler.
- Server-side order ids only.
- Rate limit checkout and (for promo) validation with a limiter that **cannot** be bypassed by `X-E2E-Test`.
- No PII beyond org name + billing email sent to Midtrans; redact the payload copy we store.

## 11) Out of scope

- Public/signed payment links.
- Embedded Snap.js, iframes, hosted card fields.
- Partial payments, instalments, multi-currency.
- Refund automation, chargeback automation, automatic access revocation.
- Recurring card tokens / auto-charge.
- Payment of `draft` invoices before `send`.
- Xendit/Stripe adapters (interface only).

## 12) Rollout

1. `payments_v1` migration + adapter + checkout API + webhook + reconciliation (backend only).
2. Payment page UI + `GET /api/invoices/{id}`.
3. Production stays on `PAYMENT_GATEWAY_ENABLED=false` until Midtrans keys and the notification URL are configured. Turning it off later blocks new checkouts only; existing attempts continue to settle through the webhook and reconciliation while the key stays configured.

## 13) Tests

See the plan's test matrix: adapter payload/signature/status mapping/status API, webhook duplicate/forged/mismatch/void/out-of-order/late settlement, checkout reuse/one-pending/zero-total/disabled, `/paid` and `/void` guards, money display (`total_idr`), and the Postgres concurrency suite in `backend/tests/test_pg_concurrency.py`.

That suite runs in CI as the `postgres-concurrency-tests` job against a `postgres:16-alpine` service, so the row-lock and partial-unique-index invariants are executed, not merely reasoned about. It skips locally when `TEST_POSTGRES_URL` is unset; the normal SQLite suite stays Postgres-free. Its sync metadata test (index predicates) runs in every CI run.
