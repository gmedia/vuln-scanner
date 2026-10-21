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
| `active`, `period_end >= now` | `active` |
| `active`, `period_end < now` | `grace` (inside the grace window) |
| `past_due`, `period_end >= now` | `pending_payment` |
| `past_due`, `period_end < now` | `expired` |
| `canceled` | `expired` |
| `incomplete` + invoice `sent` | `pending_payment` |
| `incomplete` + invoice `draft` | `draft` |
| `incomplete`, no invoice | `unbilled` |

`plan.sku` still comes from `organizations.sku` (the capacity source). The subscription row owns lifecycle only: status, period, cycle, `cancel_at_period_end`.

## 2.2 Backfill

`alembic/versions/backfill_subscriptions.py` seeds one subscription per org whose latest non-void Scan invoice is `paid`, using that invoice's period.

Status is **derived, never hardcoded**:

| Latest paid Scan invoice | Backfilled status |
|---|---|
| `period_end >= now()` | `active` |
| `period_end < now()` | `past_due` |

A lapsed customer must not be seeded as `active`: the read path would then show a false "grace period" badge until the lifecycle beat caught up.

It uses `ON CONFLICT (organization_id) DO NOTHING`, so it is idempotent and never overwrites a row created by the live payment path. Downgrade is a no-op by design. `backend/tests/test_backfill_subscriptions.py` guards these invariants (source-level, because the SQL is Postgres-only and the test database is SQLite).

## 2.3 Lifecycle beat

`workers/tasks/billing.py::finalize_periods` runs hourly on the `ip_scan` queue:

1. `cancel_at_period_end = true` and `current_period_end <= now` → `canceled`, `ended_at = now`, flag cleared.
2. The latest non-void **Scan** invoice is `sent` and `due_date + grace <= now` → `past_due`.
3. The same invoice is still `sent` and `due_date + terminal <= now` → `canceled` (terminal deadline, `BILLING_PAST_DUE_CANCEL_DAYS`, default **45**). This is what stops a `past_due` row from living forever.

Grace is `BILLING_PAST_DUE_GRACE_DAYS` (default **7**) and the terminal deadline is `BILLING_PAST_DUE_CANCEL_DAYS` (default **45**). `past_due` keys off the invoice **due date**, not `current_period_end`: a net-30 invoice must not be chased on day 7 after the service period. The job never deletes data. Write access is enforced separately by the read-only gate (§9).

## 2.4 Invoice reminders

`workers/tasks/billing.py::send_due_reminders` runs hourly on `ip_scan` and scans invoices with `status='sent'`, `paid_at IS NULL`, and a `due_date`.

| Stage | Offset from `due_date` |
|---|---|
| `due_soon` | −3 days |
| `due_today` | 0 |
| `overdue_1` | +3 |
| `overdue_2` | +7 |
| `final` | +14 |
| `suspend_notice` | +30 |

- The sweep sends only the **latest** stage that has come due, so a worker outage does not emit a burst of old reminders.
- `billing_reminders` is unique on `(invoice_id, stage)`; `stage_rank` prevents re-sending an earlier stage.
- Recipients: verified `owner`/`admin` members of the organization, deduped by email, localized from `users.locale`.
- `attempts` stops at 3 when no recipient accepted the mail; `sent_count`/`failed_count`/`last_error` are recorded for ops.
- A stage that fails to send is **retried** on the next sweep while it is still the current stage (up to 3 attempts), instead of being suppressed by the ledger.
- If an invoice is sent **after** its due date, the first contact is capped at `overdue_1` (`first_contact_stage`) so a late-sent invoice never opens with a "final notice".
- `suspend_notice` is a **conditional escalation**, not an automatic suspension: access enforcement is still a separate product decision. Copy says non-payment "may lead to" suspension and asks the customer to contact their account manager.
- Email kind `billing_reminder` is written to `email_send_logs`; it is intentionally **not** in `INBOX_KINDS` (it is addressed to billing contacts, not the in-app inbox).

`due_date` defaults to `period_start` (`INVOICE_DEFAULT_TERM_DAYS`, default 0) and can be overridden per invoice. `sent_at` is stamped when the invoice moves `draft → sent`.

## 3. State machine

Statuses: `incomplete`, `active`, `past_due`, `canceled`.

`trialing` and `unpaid` were removed: no code path ever produced them, and both were behaviourally redundant (`trialing` behaved as `active`; `unpaid` behaved as `past_due` in the gate). A trial, if ever needed, is a contract/pilot field, not a lifecycle state; a write-off is an invoice state, not a subscription state.

| From | Allowed to |
|---|---|
| `incomplete` | `active`, `canceled` |
| `active` | `past_due`, `canceled` |
| `past_due` | `active`, `canceled` |
| `canceled` | `active` (reactivation by paying a new Scan invoice) |

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

Admin UI: `/admin/subscriptions` (`frontend/src/pages/admin/AdminSubscriptions.tsx`) — status filter, payment history, record payment, cancel.

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

## 9. Read-only gate

A lapsed workspace becomes **read-only**, never locked. The customer keeps visibility and billing so they can see what they owe and settle it.

`app/services/billing_access.py` resolves the active org's subscription:

| Subscription state | Writes | Reads / exports / billing |
|---|---|---|
| `active`, `incomplete` | allowed | allowed |
| `past_due` | **403** (`payment_overdue`) | allowed |
| `canceled` | **403** (`subscription_canceled`) | allowed |
| no row | allowed | allowed |
| org `sku = enterprise` | allowed | allowed |

The two "allow" escape hatches are deliberate:

- **No row** must never lock an org. The lifecycle beat creates rows; backfill only covers orgs that paid. A missing row is missing data, not evidence of non-payment.
- **Enterprise** is a custom contract. Self-serve status must not override it.

Three dependency variants, chosen by how the handler finds its target org:

| Constant | Judges | Use when |
|---|---|---|
| `BILLING_WRITE` | the JWT's **active** org | the handler resolves its target with `get_active_org_id(request)` |
| `BILLING_WRITE_ORG` | the **`{org_id}` path param** | the handler writes to an org named in the path |
| `BILLING_WRITE_MEMBER` | path org, **except self** | member removal, where leaving must stay possible |

The split matters: a user can hold several memberships, so judging a path-scoped route by the JWT's active org lets a healthy workspace unlock a lapsed one — and blocks the reverse. Enforced on write routes:

| Area | Blocked writes |
|---|---|
| Scans | `POST /scan/ip`, `/scan/domain`, `/scan/mobile` |
| Assets | create, update, delete, tag colors, asset schedule |
| Schedules | create, update, delete |
| Uptime | create, update, pause, delete, rotate heartbeat token |
| Host Protect | create/update/delete site, enqueue scan, quarantine, restore, ignore |
| Guard | enable, link asset, disable agent, host token, enroll token create/revoke, sync |
| API keys | generate, revoke, delete |
| AI keys | create, delete |
| Workspace | update org, change role, remove another member, create/revoke invite |

Never blocked: all GET routes, exports, invoice/billing endpoints, subscription overview, and plan-change requests. A read-only customer must be able to pay or upgrade without contacting support. A member removing **themselves** (`DELETE /orgs/{org_id}/members/{self}`) is also never blocked: leaving is not spend, and blocking it would trap a user in a lapsed workspace until support intervenes.

Deliberately **not** gated: agent-token ingest routes (`/agent/results`, `/agent/waf-events`, `/heartbeat/{token}`, `/enroll`) and org creation/join. Those are not customer-initiated spend.

`GET /api/orgs/{org_id}/subscription` exposes `capabilities.read_only` and `capabilities.read_only_reason` so the SPA can explain the state instead of only surfacing a 403.
