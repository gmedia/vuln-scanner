# Spec: Billing core v1 (provider-agnostic)

**Status:** Phase 2 core shipped. Persists subscription lifecycle, payment attempts, and webhook events. **No payment gateway is called.** The manual bank-transfer invoice remains the only live collection path.

**Related:** [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) (invoice v1, still the source of the bill), [`subscription-page-v1.md`](subscription-page-v1.md) (customer page, request-only).

## 1. Scope

In:

- `subscriptions` (one per organization): sku, status, cycle, current period, cancel-at-period-end, provider ids.
- `payment_attempts`: one row per collection attempt, linked to an invoice and/or subscription.
- `payment_events`: inbound webhook dedupe + processing state.
- Admin list/detail, record-payment, cancel.
- Canonical webhook endpoint with shared-secret auth.
- Existing `POST /api/admin/invoices/{id}/paid` now also records a payment attempt and activates the subscription.

Out:

- Live Midtrans/Xendit/Stripe adapter.
- Checkout, payment link, VA issuance, card tokenization.
- Proration, credits, refunds, dunning scheduler, auto-renew beat job.
- Tax/NPWP.
- Per-product tiers (the organization still has one `org.sku`).

## 2. Product rules

| ID | Rule |
|---|---|
| B1 | Only a **Scan** invoice drives the subscription sku/period. A paid Host/Uptime/Guard invoice records an attempt but does not overwrite the Scan subscription. |
| B2 | `organizations.sku` remains the capacity source. A paid Scan invoice still applies it (unchanged invoice v1 behavior). |
| B3 | Manual record-payment is idempotent at the invoice level: `mark_paid` refuses a second payment on the same invoice. |
| B4 | A webhook event is idempotent by `(provider, event_id)`. A previously `failed` event may be retried; a `processed`/`ignored` event returns `duplicate`. |
| B5 | Cancel-at-period-end only sets a flag; it does not revoke access. Immediate cancel sets `canceled` + `ended_at`. |
| B6 | No scheduler finalizes a period-end cancel yet. Ops or a later job must do it. |

## 2.1 Status precedence (single source of truth)

`GET /api/orgs/{org_id}/subscription` reads `subscriptions` first and only falls back to invoice derivation when no row exists (orgs that never paid). `plan.source` is `"subscription"` in that case, `"invoice"`/`"default"`/`"ops"` on the fallback path.

| Subscription status | Plan status shown |
|---|---|
| `active` / `trialing`, `period_end >= now` | `active` |
| `active` / `trialing`, `period_end < now` | `expired` |
| `past_due`, `period_end >= now` | `pending_payment` |
| `past_due`, `period_end < now` | `expired` |
| `unpaid` / `canceled` | `expired` |
| `incomplete` + invoice `sent` | `pending_payment` |
| `incomplete` + invoice `draft` | `draft` |
| `incomplete`, no invoice | `unbilled` |

`plan.sku` still comes from `organizations.sku` (the capacity source). The subscription row owns lifecycle only: status, period, cycle, `cancel_at_period_end`.

## 2.2 Backfill

`alembic/versions/backfill_subscriptions.py` seeds one `active` subscription per org whose latest non-void Scan invoice is `paid`, using that invoice's period. It uses `ON CONFLICT (organization_id) DO NOTHING`, so it is idempotent and never overwrites a row created by the live payment path. Downgrade is a no-op by design.

## 2.3 Lifecycle beat

`workers/tasks/billing.py::finalize_periods` runs hourly on the `ip_scan` queue:

1. `cancel_at_period_end = true` and `current_period_end <= now` → `canceled`, `ended_at = now`, flag cleared.
2. `status = 'active'` and `current_period_end + grace <= now` → `past_due`.

Grace is `BILLING_PAST_DUE_GRACE_DAYS` (default **7**). The job never revokes access, never deletes data, and never marks `unpaid`; access enforcement and dunning remain product decisions.

## 3. State machine

Statuses: `incomplete`, `trialing`, `active`, `past_due`, `unpaid`, `canceled`.

| From | Allowed to |
|---|---|
| `incomplete` | `active`, `canceled` |
| `trialing` | `active`, `past_due`, `canceled` |
| `active` | `past_due`, `unpaid`, `canceled` |
| `past_due` | `active`, `unpaid`, `canceled` |
| `unpaid` | `active`, `canceled` |
| `canceled` | `active` |

Invalid transitions raise `BillingTransitionError` (service-level; API surfaces 409 where applicable).

## 4. Data

`subscriptions`:
- `organization_id` unique, `sku`, `status`, `cycle`
- `current_period_start/end`, `cancel_at_period_end`, `canceled_at`, `ended_at`
- `provider` (default `manual`), `provider_subscription_id`
- timestamps

`payment_attempts`:
- `organization_id`, `subscription_id`, `invoice_id`
- `provider`, `provider_ref`, `created_by_user_id`
- `amount_idr`, `currency`, `status`
- `method`, `failure_code`, `failure_message`, `next_retry_at`
- `succeeded_at`, `failed_at`, timestamps

`payment_events`:
- `provider`, `event_id`, `event_type`, `payload` JSONB
- `status` (`received|processed|ignored|failed`), `error`
- `received_at`, `processed_at`

Migration: `backend/alembic/versions/add_billing_core.py`.

## 5. API

Admin (`get_current_admin`):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/subscriptions?status=&page=` | List with organization name |
| GET | `/api/admin/subscriptions/{org_id}` | Detail + last 20 attempts |
| POST | `/api/admin/subscriptions/{org_id}/record-payment` | `{invoice_id, method?, reference?}`; marks the invoice paid and records an attempt |
| POST | `/api/admin/subscriptions/{org_id}/cancel` | `{at_period_end, note?}` |

Webhook (no JWT; shared secret):

| Method | Path | Header |
|---|---|---|
| POST | `/api/webhooks/payments/{provider}` | `X-Payment-Webhook-Secret` |

`PAYMENT_WEBHOOK_SECRET` empty → 503. Wrong/missing secret → 401. Unknown provider → 404. Only `manual` is supported in v1.

## 6. Canonical webhook payload

```json
{
  "id": "evt_123",
  "type": "payment.succeeded",
  "data": {
    "payment_ref": "pay_123",
    "invoice_id": "uuid",
    "method": "va",
    "failure_code": "insufficient_funds",
    "failure_message": "Card declined",
    "next_retry_at": "2026-10-21T00:00:00Z",
    "organization_id": "uuid",
    "subscription_ref": "sub_123",
    "period_start": "2026-11-01T00:00:00Z",
    "period_end": "2026-11-30T23:59:59Z"
  }
}
```

Supported `type` values:

- `payment.succeeded` — mark attempt succeeded, mark the invoice paid, activate the subscription (Scan only).
- `payment.failed` — mark attempt failed, set `past_due`, store failure/retry fields.
- `payment.expired` — mark attempt expired, set `past_due`.
- `subscription.canceled` — set subscription `canceled` + `ended_at`.
- `subscription.renewed` — update period, set `active`.
- anything else — event stored as `ignored`.

A future Midtrans/Xendit adapter translates its native event into this payload before calling `BillingService.apply_event`.

## 7. Security

- Webhook secret compared with `secrets.compare_digest`.
- Webhook path bypasses the API-key middleware (same as the SES webhook).
- No customer PII in `payment_events.payload` beyond provider refs and amounts.
- `provider_ref` is not unique: bank references can repeat; invoice-level idempotency is the guard.

## 8. Tests

`backend/tests/test_billing_core.py`:

- Existing `/paid` creates subscription + succeeded attempt.
- New record-payment endpoint returns billing state.
- Host invoice does not overwrite the Scan subscription.
- Record-payment rejects an invoice from another org.
- Webhook disabled / wrong secret / duplicate event.
- `payment.succeeded` activates and is idempotent.
- `payment.failed` sets `past_due` + retry fields.
- Unknown event ignored.
- Cancel at period end then immediate; second cancel 409.
- Admin list + role gate.
- Invalid transition raises.
