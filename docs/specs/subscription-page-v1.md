# Spec: Subscription page v1 (request-only)

**Status:** Phase 1 shipped. Customer surface is read-only plus a plan-change **request**; ops still issues the invoice and applies the SKU.

**Route:** `/settings/subscription` (`frontend/src/pages/Subscription.tsx`)
**Admin queue:** `/admin/subscription-requests` (`frontend/src/pages/admin/AdminSubscriptionRequests.tsx`)
**Design contract:** [`frontend/design/subscription.md`](../../frontend/design/subscription.md)

## 1. Scope

In:

- Current plan summary derived from `organizations.sku` + the latest non-void Scan invoice.
- Capacity meters for Scan assets, Host sites, Uptime monitors, Guard agents, and workspace seats.
- Bundle + à-la-carte list prices (read-only), annual 10/12 display.
- Plan-change request (upgrade/downgrade), pending state, cancel request.
- Invoice list for owner/admin, reusing `WorkspaceInvoiceCard` / `InvoicePrintSheet`.
- Admin queue: list, approve, reject with note.

Out:

- Payment gateway / checkout, proration, auto-renew, dunning, self-serve cancel.
- Annual invoice generation.
- Per-product tier selection.
- Bundle as an invoice line.
- Tax/NPWP.

## 2. Decisions

| ID | Decision |
|---|---|
| S1 | One tier applies to the whole organization (`org.sku`). |
| S2 | `enterprise` is quote-only; not a request target and has no public price. |
| S3 | Downgrade is blocked when current usage exceeds the target tier cap. |
| S4 | One pending request per organization; duplicate → 409. |
| S5 | Request approval records the decision only. Ops still issues the invoice; a paid **Scan** invoice applies `org.sku`. |
| S6 | Bundle savings are not shown as a badge because Guard is free while Host Protect is active and the à-la-carte sum double-counts it. |
| S7 | Annual is display + request only until annual invoices exist. |
| S8 | Viewer/member sees plan + capacity; invoices and change CTA are owner/admin only. |

## 3. Plan status derivation

| Condition | `plan.status` | `plan.source` |
|---|---|---|
| `org.sku = enterprise` | `enterprise` | `custom` |
| No non-void Scan invoice, `org.sku = basic` | `unbilled` | `default` |
| No non-void Scan invoice, `org.sku != basic` | `unbilled` | `ops` |
| Latest Scan invoice `sent` | `pending_payment` | `invoice` |
| Latest Scan invoice `draft` | `draft` | `invoice` |
| `subscriptions.status = active`, `period_end >= now` | `active` | `subscription` |
| `subscriptions.status = active`, `period_end < now` | `grace` | `subscription` |
| `subscriptions.status = past_due`, `period_end >= now` | `pending_payment` | `subscription` |
| `subscriptions.status = past_due`, `period_end < now` | `expired` | `subscription` |
| `subscriptions.status = canceled` / `unpaid` | `expired` | `subscription` |
| Latest Scan invoice `paid`, `period_end >= now` (no row) | `active` | `invoice` |
| Latest Scan invoice `paid`, `period_end < now` | `expired` | `invoice` |

**Precedence:** if a `subscriptions` row exists, its status/period/cycle win over the invoice derivation (`source = "subscription"`). `sku` still comes from `organizations.sku`. See [`billing-core-v1.md`](billing-core-v1.md) §2.1. The invoice row is then only used for `amount_idr`, `invoice_id`, and `invoice_number`.

`period_start`, `period_end`, `renewal_at`, `amount_idr`, `invoice_number` come from the subscription row when it exists (invoice fills `amount_idr`/`invoice_id`/`invoice_number`). No synthetic renewal date.

`plan.billing_status` exposes the raw `subscriptions.status` so the page can distinguish a failed renewal (`past_due`) from an unpaid invoice. `plan.cancel_at_period_end` drives the "ends on" banner.

`grace` means the period ended but the lifecycle beat has not yet marked `past_due`; access is intentionally still on. Do **not** render it as expired.

`recent_attempts` (last 5 `payment_attempts`) is populated only for owner/admin; viewers always receive `[]`.

### Capacity meters

- Scale: `quotaState()` (`frontend/src/lib/quota.ts`) — warn at 80%, cap at 100%.
- `used > limit` is possible for Guard because Wazuh sync (`services/guard_apply.py`) does not enforce `GUARD_SKU_LIMITS`, while manual enroll does. Render **"Over by N"** (`data-testid="subscription-usage-over-{product}"`) instead of "Capacity full"; the bar stays at 100%. Do not block sync to fix the meter — dropping agents would hide real hosts.

## 4. API

Org (JWT + membership):

| Method | Path | Role |
|---|---|---|
| GET | `/api/orgs/{org_id}/subscription` | viewer |
| POST | `/api/orgs/{org_id}/subscription/requests` | admin |
| DELETE | `/api/orgs/{org_id}/subscription/requests/{request_id}` | admin |

Admin (`get_current_admin`):

| Method | Path |
|---|---|
| GET | `/api/admin/subscription-requests?status=&page=` |
| POST | `/api/admin/subscription-requests/{id}/approve` |
| POST | `/api/admin/subscription-requests/{id}/reject` |

`POST` body: `{ target_sku: basic|pro|multi, cycle: monthly|annual, note?: string }`.
Approve/reject body: `{ note?: string }`.

## 5. Data

`subscription_requests`:

- `organization_id`, `requested_by_user_id`
- `direction` (`upgrade|downgrade`), `current_sku` (incl. `enterprise`), `target_sku` (`basic|pro|multi`)
- `cycle` (`monthly|annual`), `note`
- `status` (`pending|approved|rejected|canceled`), `resolution_note`
- `resolved_by_user_id`, `resolved_at`, timestamps

Migration: `backend/alembic/versions/add_subscription_requests.py`.

## 6. Copy rules

- Say **request**, not “upgrade now” or “checkout”.
- State that the plan does not change immediately.
- Say “list price, excluding tax; final pricing on the invoice”.
- Say “Guard is free while Host Protect is active”.
- Never imply Enterprise has a public price.
- Never imply credits are a meter.

## 7. Tests

- Backend: `backend/tests/test_subscription.py` (overview, role gates, duplicate, downgrade guard, paid invoice active, cancel, admin approve, enterprise).
- Frontend: `frontend/src/test/Subscription.test.tsx`, `frontend/src/test/admin/AdminSubscriptionRequests.test.tsx`.
- Design contract: `frontend/src/test/docContract.test.ts` (13 surface files).
