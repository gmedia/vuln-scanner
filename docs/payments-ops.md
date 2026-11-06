# Payments operations

Operational runbook for the optional payment gateway (Payments v1, Midtrans first).
The gateway is **off by default**; manual bank transfer remains the primary path.
Nothing here requires a schema change, and every procedure is safe to run with the
gateway disabled.

Related: [`specs/payments-v1.md`](specs/payments-v1.md), [`deploy.md`](deploy.md).

## 1) Enable / disable

Payment behaviour is controlled by env only:

| Flag | Meaning |
|---|---|
| `PAYMENT_GATEWAY_ENABLED` | Master switch for **new checkouts only**. Default `false`. Inbound webhooks and reconciliation keep running while a provider is configured. |
| `PAYMENT_PROVIDERS_ENABLED` | Comma list of providers, e.g. `midtrans`. Empty means none. |
| `MIDTRANS_SERVER_KEY` | Server-side key only. Sandbox keys start `SB-Mid-server-`; production keys start `Mid-server-`. |
| `MIDTRANS_IS_PRODUCTION` | `false` for sandbox, `true` for production. |
| `MIDTRANS_VERIFY_STATUS` | Default `true`; confirms the provider status before marking an invoice paid. |

Before flipping `PAYMENT_GATEWAY_ENABLED=true`, run the preflight inside the backend
container:

```bash
python -m scripts.check_payment_config
```

It prints `ERROR` / `WARN` / `OK` lines and exits **1** when at least one blocking
error exists (missing key, empty or unknown provider list, mode/key mismatch, or a
non-HTTPS `FRONTEND_URL` in production). Fix every error before enabling; warnings
(sandbox mode, status verification off, localhost frontend, providers set while the
gateway is off) are informational and do not block startup. The command never prints
the server key.

Deploy **backend-first**. The backend owns the checkout, webhook, and reconciliation
paths; the SPA only shows the pay action when `GET /api/payments/providers` returns a
provider. Releasing the SPA before the backend is harmless (no providers), the reverse
is not.

Turning `PAYMENT_GATEWAY_ENABLED=false`:

- The pay action disappears; the invoice page falls back to manual bank transfer.
- Existing `payment_attempts` rows are kept; nothing is deleted or voided.
- New gateway checkouts are refused.
- Inbound settlement continues: if `MIDTRANS_SERVER_KEY` is still set (provider
  **configured**) the webhook verifies the signature and marks the invoice paid, and
  the reconciliation sweep polls pending attempts. Only an **unconfigured** provider
  (empty key or mode mismatch) returns `404` and is skipped by reconciliation.
- An operator rolling back sees no new pay buttons, while late payments for
  already-created attempts still settle; keep the server key in place until every
  in-flight attempt is paid, expired, or refunded.

## 2) Sandbox smoke test

Run this on a non-production environment with sandbox credentials before enabling the
gateway for customers.

0. Run `python -m scripts.check_payment_config` inside the backend container and
   confirm `PAYMENT CONFIG: OK` before starting the smoke test.
1. Create an invoice for an **internal test org** with a non-zero total (admin billing
   screen, or `POST /api/admin/invoices`), then send it (`POST /api/admin/invoices/{id}/send`)
   so its status is `sent`.
2. Open `/pay/<invoice-id>` as an owner/admin of that org.
3. Pay with the Midtrans sandbox simulator and wait for the redirect back.
4. Verify every row below. Substitute the invoice id and org id; no PII is needed.

```sql
-- Invoice is paid and has a paid timestamp.
SELECT id, number, status, total_idr, paid_at
FROM org_invoices
WHERE id = '<invoice-id>';

-- The subscription for that org is active.
SELECT organization_id, status, current_period_start, current_period_end
FROM subscriptions
WHERE organization_id = '<org-id>';

-- The attempt is a success and carries the provider references.
SELECT id, invoice_id, provider, status, provider_status, amount_idr,
       provider_order_id, provider_payment_id, failure_code,
       created_at, succeeded_at
FROM payment_attempts
WHERE invoice_id = '<invoice-id>'
ORDER BY created_at DESC;

-- The webhook event was processed (payload keeps order_id only; no PII).
SELECT provider, event_id, event_type, status, error, received_at, processed_at
FROM payment_events
WHERE payload->>'order_id' = '<provider-order-id>'
ORDER BY received_at DESC;
```

Expected: invoice `paid`, subscription `active`, attempt `status='succeeded'`, event
`status='processed'`. A `failed` event here is the bug to chase in §3–§5.

## 3) Webhook not arriving

Symptoms: the provider shows a successful payment but the invoice stays `sent` and the
attempt stays `pending`.

1. **Provider dashboard** — confirm the notification URL is the environment's
   `POST /api/webhooks/payments/midtrans` on the public origin, and that the environment
   (sandbox vs production) matches `MIDTRANS_IS_PRODUCTION`.
2. **Endpoint reachability** — resend the notification from the provider dashboard. A
   healthy endpoint returns `200` for `processed`, `duplicate`, `ignored`, or a
   permanently failed event. `500` means a transient DB error and the provider should
   retry; `401` is a signature problem; `404` means the provider is unknown or unconfigured
   (missing/mode-mismatched server key), not merely that the checkout flag is off.
3. **Body size** — nginx must keep `location /api/webhooks/payments/ { client_max_body_size 64k; }`
   in both configs. A truncated/large body returns `413` and the provider may keep retrying.
4. **Signature** — `401` in the backend logs means the body's `signature_key` did not
   match the server key for this environment. Check that the key is the sandbox key for
   sandbox and the production key for production; never paste a key into a ticket.
5. **Reconciliation** — `payment.reconcile_attempts` runs every 10 minutes and only
   considers attempts older than 10 minutes. It polls the provider status and applies
   the same guards as the webhook. Check its beat entry and worker logs; if it is
   running and the provider still reports success, the payment is real and §5 applies
   to the missing event.

### Provider status verification (`MIDTRANS_VERIFY_STATUS`)

When `MIDTRANS_VERIFY_STATUS=true` (the default), every `payment.succeeded`
notification is confirmed with `GET /v2/{order_id}/status` **before** the invoice is
marked paid. The webhook remains the trigger; the status call is a second,
independent confirmation of the money.

- Provider reports `succeeded` → the event proceeds normally and access activates.
- Provider reports any other kind (`pending`, `failed`, `expired`, …) → the attempt
  fails with `failure_code='provider_status_mismatch'` and the event is `failed`.
  Nothing is activated.
- The status API is unreachable, times out, returns a transient error, or reports the
  order as not found → the attempt fails with
  `failure_code='provider_status_unavailable'` and the event is `failed`.

This is **fail-closed** on purpose. During a Midtrans status-API outage a legitimate
settlement stays unactivated until reconciliation confirms it; activating on an
unverified webhook would risk granting access for money that never arrived. Reconcile
with `payment.reconcile_attempts` and the provider dashboard — never hand-mark the
invoice paid from the webhook body alone.

Verification is skipped for `pending`, `failed`, `expired`, `refunded`, and chargeback
events, for the manual provider, and when `MIDTRANS_VERIFY_STATUS=false`. The status
check does not create an extra `payment_events` row; it only changes the decision for
that event.

## 4) Amount mismatch

`vuln_payment_amount_mismatches_24h` counts attempts whose provider amount differed
from `org_invoices.total_idr`.

- Look for `payment_attempts.failure_code = 'amount_mismatch'` on the attempt.
- The webhook/status check records a **failed** event; the invoice is **not** marked
  paid and access is not activated.
- Compare the checkout total with the invoice total (post-promo, post-tax) and the
  provider transaction detail.
- Never hand-mark the invoice paid unless the settled amount matches the invoice
  exactly. If the customer was charged the wrong amount, refund the provider
  transaction and issue a fresh checkout for the correct total.

```sql
SELECT id, invoice_id, status, amount_idr, failure_code, failure_message, failed_at
FROM payment_attempts
WHERE failure_code = 'amount_mismatch'
ORDER BY failed_at DESC
LIMIT 20;
```

## 5) Duplicate payment

A customer paid twice — typically a bank transfer plus a gateway settlement, or two
provider transactions on the same invoice.

- The second successful settlement sets `payment_attempts.provider_status = 'duplicate'`
  and returns `processed`; the subscription is **not** re-activated.
- `vuln_payment_duplicate_settlements_24h` counts these in the last 24h.
- Do **not** re-activate or extend access for the duplicate. Refund exactly one
  payment through the provider/bank and record the refund reference on the attempt.

```sql
SELECT id, invoice_id, provider, provider_status, status, amount_idr, updated_at
FROM payment_attempts
WHERE provider_status = 'duplicate'
ORDER BY updated_at DESC
LIMIT 20;
```

## 6) Late settlement on a void invoice

The invoice was voided while a checkout was still live, then the customer paid.

- The webhook records a **failed** event (`invoice_void` on the attempt); the void
  invoice is not silently un-voided and access is not activated.
- This is money received against a cancelled obligation. Refund it manually through
  the provider, or — if the customer still wants the service — create a new invoice
  and let them pay that one.
- Do not flip the invoice back to `sent`/`paid` by hand; that breaks the audit trail.

## 7) Refund / chargeback

`refund`, `partial_refund`, and `chargeback` events are recorded on the attempt:
`status='refunded'`, `provider_status` set to the event kind, and
`refunded_amount_idr` populated.

- There is **no automatic access revocation**. Decide whether the org keeps access
  based on the commercial situation.
- `vuln_payment_refunds_24h` counts these attempts in the last 24h; the
  `VulnScannerPaymentRefunds` alert fires while it is above zero.
- Record the decision and its reason in the billing ticket/audit trail, including who
  made it and what was refunded.
- A chargeback is not a normal refund: treat it as a dispute, keep the evidence, and
  do not re-charge the same invoice until the dispute is closed.

### Refund recorded but access still active

1. Confirm the refund or chargeback in the provider dashboard and read the attempt's
   `refunded_amount_idr`.
2. Decide whether the organization keeps access. The system will not revoke it for you.
3. To remove access, cancel the subscription at period end (do not delete the
   subscription or the payment attempt). If an immediate stop is required, cancel
   without the period-end flag and record why.
4. Leave the `payment_attempts` row and the `payment_events` row in place — they are
   the audit trail for the money that left.

## 8) Void / manual paid guard

Voiding an invoice or marking it paid by hand returns `409` while a pending gateway
attempt exists. This prevents "paid twice" and "voided after payment" races.

- Cancel or expire the pending attempt first (admin payment attempts, or the provider
  dashboard), then retry the void/manual-paid action.
- `force=true` is for a platform admin only and **requires a reason**. It cancels/expires
  the pending attempts, writes a warning to the audit log, and then performs the action.
- Never use `force=true` to paper over the fact that the gateway already collected
  money. Use §5/§6 instead.

## 9) Rollback

1. Set `PAYMENT_GATEWAY_ENABLED=false` and redeploy the backend (backend-first).
2. New checkouts are refused and the SPA reverts to manual bank transfer. Inbound
   webhooks and `payment.reconcile_attempts` **keep running** for a provider whose
   server key is still configured, so a payment that was already in flight during the
   rollback still settles. Only an unconfigured provider (no key) is skipped and shows
   up in the `skipped_count` of the reconcile task.
3. Existing attempts remain in the table and stay visible in the gauges. Outstanding
   pending attempts do not disappear; settle or refund them with the provider.
4. Keep the payment tables and the webhook route in place. Do not drop data during a
   rollback; the manual transfer path does not use them.

## 10) Metrics reference

All six gauges are exported on `/metrics` and are read-only. Alerts live in
`monitoring/alerts-vuln-scanner.example.yml`.

| Metric | What it measures | Bad looks like |
|---|---|---|
| `vuln_payment_pending_attempts` | Attempts still `pending`. | Sustained > 20 for 30m: checkouts outrun expiry/reconciliation, or the expiry sweep stopped. |
| `vuln_payment_pending_age_seconds` | Age of the oldest pending attempt; `0` when none. | > 1800 for 15m: past the 24h expiry and 10-minute reconciliation window, so webhooks are being missed. |
| `vuln_payment_failed_events_24h` | Webhook events with `status='failed'` in 24h. | Any non-zero value: an event did not activate access; check signature, amount, unknown attempt, provider dashboard. |
| `vuln_payment_amount_mismatches_24h` | Attempts failed with `failure_code='amount_mismatch'` in 24h. | Any non-zero value: provider amount ≠ `org_invoices.total_idr`; the invoice is not paid. |
| `vuln_payment_duplicate_settlements_24h` | Attempts with `provider_status='duplicate'` updated in 24h. | Any non-zero value: a second settlement hit a paid invoice; refund one payment manually. |
| `vuln_payment_refunds_24h` | Attempts with `status='refunded'` updated in 24h (refund, partial refund, chargeback). | Any non-zero value: money is leaving; access is **not** revoked automatically. Confirm with the provider and decide access manually. |

Thresholds match the product rules: 24h checkout expiry, 10-minute reconciliation, and
a 5-minute `for:` on the money-losing conditions (mismatch, duplicate) so they page
before the customer notices.

### Promo metrics

Promo codes are live, and a discount is money leaving the business the same way a
refund is. These four gauges are exported on `/metrics` (read-only, no behaviour
change) and are alerted in `monitoring/alerts-vuln-scanner.example.yml`. Only
`applied` redemptions count: a `released` redemption belongs to a voided invoice, so
it returned the quota and granted no lasting discount.

| Metric | What it measures | Bad looks like |
|---|---|---|
| `vuln_promo_discount_idr_24h` | IDR discount from `applied` redemptions created in 24h. | > 10,000,000 for 1h: a code is burning faster than expected. |
| `vuln_promo_discount_idr_30d` | IDR discount from `applied` redemptions created in 30d. | > 50,000,000 for 1h: the monthly burn is draining the margin. |
| `vuln_promo_redemptions_24h` | `applied` redemptions created in 24h. | > 50 for 1h: a leaked code or a runaway campaign; sort `/admin/promo-codes` by redemptions and deactivate it. |
| `vuln_promo_pending_approvals` | Codes with `requires_approval=true` and no `approved_at` (queue depth, no time window). | > 0 for 1h: a code above the P9 cap is inactive and the customer cannot use it until a second admin approves it. |

The discount thresholds are **provisional**. Discount is gross-to-net leakage, so
compare the burn with invoice volume before treating it as intentional, and let
finance tune the numbers.

## 11) Postgres concurrency tests

`backend/tests/test_pg_concurrency.py` proves the billing invariants that SQLite cannot:
the promo row `SELECT ... FOR UPDATE`, the per-org invoice lock, the partial unique
index `uq_payment_attempt_pending_invoice`, and the `next_invoice_number` retry on a
real unique violation. It also carries one sync metadata test that guards the index
predicates in every run, with or without Postgres.

- **Switch:** `TEST_POSTGRES_URL` only. Unset it and the four concurrency tests skip;
  the normal `pytest tests/` run never needs Postgres.
- **Schema:** built with `Base.metadata.create_all`, not Alembic, because the tests
  target the model metadata and index predicates. Each test truncates every table
  before and after.
- **CI:** the required `postgres-concurrency-tests` job runs the file against a
  `postgres:16-alpine` service.

Local run (throwaway container on port 55432; use any free port):

```bash
docker run --rm -d --name pg1268 \
  -e POSTGRES_USER=vuln_scanner \
  -e POSTGRES_PASSWORD=e2e-test-password \
  -e POSTGRES_DB=vuln_scanner_test \
  -p 55432:5432 postgres:16-alpine

cd backend
TEST_POSTGRES_URL=postgresql+asyncpg://vuln_scanner:e2e-test-password@localhost:55432/vuln_scanner_test \
  python -m pytest tests/test_pg_concurrency.py -v --no-cov --timeout=300

docker rm -f pg1268
```

## 12) Event retention

Every inbound webhook writes one `payment_events` row (redacted payload). The row is
the dedupe key and the audit trail, not a permanent archive. `payment.prune_events`
runs once a day and deletes rows whose `received_at` is older than **365 days**
(`PAYMENT_EVENT_RETENTION_DAYS` in `backend/app/services/billing.py`; a code
constant, not an env var, because it rarely changes).

Two statuses are **never** pruned, at any age:

- `received` — the event may still be in flight (the worker is applying it, or the
  provider is retrying); deleting it would drop the dedupe key mid-transaction.
- `failed` — a failed event is an ops signal for signature, amount, or
  unknown-attempt problems. It stays available for investigation and metrics.

Everything else (`processed`, `ignored`) is terminal and is deleted once it falls
outside the window. `payment_attempts`, `org_invoices`, subscriptions, and promo
ledgers are **not** touched by this sweep.

To run it by hand (same task beat invokes):

```bash
# Inside the worker container; prints {"deleted": <int>}.
python -c "from tasks.billing import prune_payment_events; print(prune_payment_events())"
```

After a year, an event row is gone. If a provider asks about a specific transaction
older than the retention window, restore the `payment_events` row from the database
backup — do not recreate it from provider data. The corresponding
`payment_attempts`/`org_invoices` rows are still present.
