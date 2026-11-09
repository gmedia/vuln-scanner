# AI wallet top-up operations

Runbook for the prepaid AI wallet top-up queue. It covers the manual bank
transfer path, Midtrans settlement side effects, refund resolution, the expiry
worker and the alerts. No account numbers, keys, hosts or customer data belong
in this file; copy them from the environment or a private ops note.

Related: [`specs/ai-topup-v1.md`](specs/ai-topup-v1.md),
[`ai-gateway-ops.md`](ai-gateway-ops.md), [`payments-ops.md`](payments-ops.md),
[`deploy.md`](deploy.md).

## 1) Where the queue lives

The admin queue is `/admin/ai/topups` (platform admin only). It is deliberately
not gated by `AI_GATEWAY_ENABLED`: an already-paid or refunded order must still
be resolvable while the customer-facing gateway is switched off.

The API surface is:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/ai/topup/orders` | List/filter the queue (`status`, `organization_id`, `page`, `limit`) |
| `GET` | `/api/admin/ai/topup/orders/{id}` | One order |
| `GET` | `/api/admin/ai/topup/orders/{id}/proof` | Download the private transfer proof (admin only, `nosniff`, no public URL) |
| `POST` | `/api/admin/ai/topup/orders/{id}/approve` | Credit a manual order; optional `force` when a gateway attempt is still pending |
| `POST` | `/api/admin/ai/topup/orders/{id}/reject` | Reject with a reason; no credit |
| `POST` | `/api/admin/ai/topup/orders/{id}/resolve-refund` | Clawback or write-off a `refund_review` order |
| `POST` | `/api/admin/ai/topup/orders/admin-credit` | Direct wallet credit as an `admin_credit` order; send one `idempotency_key` per grant and reuse it on retry |

## 2) Order statuses

| Status | Meaning | Who acts |
|---|---|---|
| `pending_payment` | Order created, no credit. Manual transfer waiting for proof, or Midtrans waiting for the provider. | Customer; expiry worker |
| `awaiting_verification` | Proof uploaded. **Never auto-expires**; the queue has an alert instead. | Admin |
| `paid` | Wallet credited exactly once. Terminal for credit. | Nobody |
| `rejected` | Proof refused. No credit. Terminal for the customer. | Nobody |
| `expired` | Local expiry passed with no payment. A later provider `succeeded` is still credited. | Nobody |
| `canceled` | Customer/admin canceled before payment. A later provider `succeeded` is still credited. | Nobody |
| `refund_review` | A refund or chargeback was recorded after settlement. No automatic clawback. | Admin |
| `refunded` | An admin resolved the refund (clawback or write-off). Terminal. | Nobody |

Rules that matter during an incident:

- `paid` is terminal for credit. Only a refund moves money out.
- `expired`, `canceled` and `rejected` are terminal for **customer intent**,
  not for money. A provider-confirmed `succeeded` that arrives later still
  credits the order once.
- Approval is idempotent: approving an already-paid order returns it unchanged.
- The wallet ledger unique index allows one `kind='topup'` row and one
  `kind='refund'` row per order. Never hand-write a second credit row.

## 3) Approve or reject a manual transfer

1. Open `/admin/ai/topups`, filter `awaiting_verification`.
2. Open the order and download the proof. Confirm the amount matches the
   order's `amount_idr` and the transfer reference matches `reference_code`
   or the recorded `bank_ref`.
3. Approve with the bank reference. This credits `credit_idr` exactly once and
   records `verified_by_user_id` and `verified_at`.
4. Reject with a short reason if the proof is wrong or unreadable. Rejection
   writes no ledger row and leaves the wallet unchanged.

If approval returns 409 because a gateway attempt is still `pending`, either
wait for the provider to settle the attempt or approve with `force=true`. A
forced approval retires the pending attempt locally; the provider may still
send a settlement for it, and the webhook will refuse a second credit.

## 4) Resolve a refund (clawback vs write-off)

`refund_review` is created by a provider refund/chargeback webhook. Nothing is
withdrawn automatically — an admin decides.

| Action | Effect | Use when |
|---|---|---|
| `clawback` | Withdraws `credit_idr` from the wallet and writes one `kind='refund'` ledger row. Refuses with 409 if the balance is lower than the credit. | The money was returned to the customer and the remaining balance can absorb it. |
| `write_off` | No ledger movement. The customer keeps the credit. | The amount is small, the balance was already consumed, or finance accepts the loss. |

Both actions set `refunded`, record the acting admin and the trimmed
`resolution_note` (max 255 characters), and are idempotent: a second call
returns the order unchanged without another ledger row. When a clawback is
refused for insufficient balance, resolve as `write_off` or arrange a manual
adjustment with finance — do not partially claw back.

## 5) Rotate the bank destination

The manual transfer screen reads the bank destination from environment only:

| Variable | Meaning |
|---|---|
| `INVOICE_BANK_NAME` | Bank name shown to the customer |
| `INVOICE_BANK_ACCOUNT` | Account number shown to the customer |
| `INVOICE_BANK_HOLDER` | Account holder name shown to the customer |

Change the values in the deployment environment, restart/redeploy the backend,
then create a fresh test order to verify the new destination is rendered. The
old values are not stored on existing orders, so a pending order keeps the
reference code it was issued; if a customer already transferred to the old
account, reconcile that transfer manually (section 6) before advertising the
new destination.

## 6) "My transfer is missing"

1. Ask for the order reference code (`reference_code`) and the transfer proof.
   Do not ask for a full account number in chat or email.
2. Confirm the order exists and its status. A `pending_payment` manual order
   only moves after a proof is uploaded; an `awaiting_verification` order is
   waiting for an admin, not for the bank.
3. If the customer paid through Midtrans, open the Midtrans dashboard and
   look up the provider order id (`<reference_code>-A<seq>`). Do not rely on a
   screenshot alone.
4. If the money landed but the order is still unpaid, approve the manual order
   (bank transfer) or settle the gateway attempt through the provider's
   reconciliation. **Never** issue a second credit "to be safe": the ledger
   records the order and a duplicate will be refused, but a hand-written
   top-up is not tied to the order and is not idempotent.
5. If no money landed, ask the customer to re-check the reference code and the
   destination. Do not mark the order paid.

## 7) Expire worker and beat

`ai_topup.expire_stale_orders` runs on the `ip_scan` queue every 15 minutes
from `celery_app.py`. It selects at most 200 `pending_payment` orders whose
`expires_at` is in the past, moves each to `expired`, and retires a `pending`
`payment_attempts` row for that order to `expired` with
`provider_status='expired'` and `failed_at=now`.

- It never touches `awaiting_verification` (that is a human backlog) or `paid`.
- It is idempotent: a second run finds nothing and returns `{"expired": 0}`.
- An order retired here can still be credited by a later provider `succeeded`;
  never treat `expired` as "the customer cannot pay anymore" for Midtrans.

If orders pile up overdue, check that celery beat is running the schedule and
that the task is routed to the `ip_scan` queue, then read the worker logs for
`Expired stale AI top-up orders`.

## 8) Metrics and alerts

All top-up metrics are scrape-time database reads, not in-process counters.
They are exported from `backend/app/metrics.py` next to the payment metrics.

| Metric | Type | Meaning |
|---|---|---|
| `vuln_ai_topup_orders_total{status,method}` | gauge | Order counts grouped by status and payment method |
| `vuln_ai_topup_pending_age_seconds{method}` | gauge | Age of the oldest `pending_payment` order per method |
| `vuln_ai_topup_pending_overdue_total` | gauge | `pending_payment` orders past `expires_at` |
| `vuln_ai_topup_awaiting_verification_total` | gauge | Proofs waiting for an admin |
| `vuln_ai_topup_refund_review_total` | gauge | Refunds waiting for clawback/write-off |
| `vuln_ai_topup_webhook_failed_total` | gauge | Failed top-up webhook events in the last 24h |
| `vuln_ai_topup_proofs_purged_total` | gauge | Terminal orders whose proof was cleared in the last 24h (derived from `updated_at`) |

Alert meanings:

- **Verification backlog > 20 for 2h** — customers are waiting too long for a
  manual review. Open the queue and clear it.
- **Pending overdue > 0 for 15m** — the expiry sweep is not running or is
  behind. Check beat and the worker.
- **Refund review > 0** — a refund is unresolved. Decide clawback vs write-off.
- **Webhook failures > 0 for 15m** — a top-up webhook failed and the wallet was
  not credited. Check the backend logs and the provider dashboard before
  crediting manually.
- **Terminal/refund backlog > 50 for 1h** — abandoned checkouts or unresolved
  refunds are accumulating; inspect the flow and the queue.
- **Pending age > 3 days** — an order outlived its TTL; the expire worker is
  not retiring it.
- **Proof purge > 100 in 24h** — informational. The gauge is inferred from
  `updated_at`, so it is an upper bound. A sustained value means an unexpected
  bulk purge; check the worker logs and that object storage was reachable.

Existing `vuln_payment_*` gauges are scoped to `payable_kind='invoice'`, so a
top-up backlog must never page as an invoice SLO breach.

## 9) Proof storage and backup

Proof files are private. They live wherever `OBJECT_STORAGE_BACKEND` points:
the local backend writes under the `scan_data` volume, which is shared by the
backend and workers. They are never served by a public URL; the only read path
is the admin download endpoint above.

- Back up the `scan_data` volume together with the database. A proof without
  its order row is useless, and an order waiting for `awaiting_verification`
  without its proof cannot be reviewed.
- **`scripts/deploy.sh` wipes volumes.** It is not the routine deploy path.
  Use `scripts/deploy-services.sh` for a normal release; it keeps volumes and
  runs migrations unless `--skip-migrate` is set.
- Do not copy proofs into tickets, chat, or logs. If an audit needs a proof,
  download it through the admin endpoint and store it in the approved private
  location.
- There is no antivirus/OCR in v1; verify the file visually as part of review.

## 10) Proof retention

`ai_topup.purge_expired_topup_proofs` runs daily on the `ip_scan` queue
(`celery_app.py`, 03:15 UTC). It deletes the stored transfer-proof object 90
days after the order reached a terminal status, then clears
`proof_object_key`, `proof_mime`, `proof_size_bytes`, and `proof_uploaded_at`.
The order row itself is never deleted: it stays as the payment audit trail.

- Only `expired`, `rejected`, and `canceled` orders are eligible. `paid`,
  `refunded`, and `refund_review` keep their proof indefinitely, because the
  proof is evidence for a completed payment.
- `updated_at` is the terminal timestamp: every status change stamps it, and
  `expire_stale_orders` sets it explicitly when it retires an order.
- The purge is idempotent: a second run finds nothing because
  `proof_object_key` is already NULL. At most 200 orders are handled per run.
- The storage backend must be reachable during the run. `delete_proof` is
  best-effort, so a storage error never aborts the batch, but it also cannot be
  told apart from success: the row is cleared either way and the object can be
  left orphaned. Confirm COS (or the shared `scan_data` volume for the local
  backend) is reachable, and reconcile orphans from the storage inventory if a
  purge ran during an outage.

Verify the job ran:

```bash
# Worker log line, present only when at least one proof was purged
docker compose logs worker_ip | grep "Purged expired AI top-up proofs"
```

`vuln_ai_topup_proofs_purged_total` counts terminal orders with no proof whose
`updated_at` is within 24h. It is an approximation: `updated_at` also moves on
other terminal transitions, so treat it as an upper bound.

## 11) Migration and deploy notes

S6 adds `ai_topup_orders.resolution_note` (nullable, varchar(255)) with
revision `ai_topup_v1_s6`, whose parent is `ai_topup_v1_s1`. A green `main`
deploy already runs `alembic upgrade head`; do not run a second manual
migration after a successful deploy. If a deploy fails, follow the deploy
runbook rather than improvising a schema change.

## 12) Launch readiness

Before announcing the top-up flow, run the read-only readiness check from
`backend/` (or inside the backend container with the deployment environment
loaded):

```bash
cd backend && python -m scripts.check_topup_ready
```

It only reads settings and the `ai_topup_packs` table: no writes, no provider
calls, and it never prints the bank account value, keys, or hosts. Read the
table as follows:

| Status | Meaning | Action |
|---|---|---|
| `PASS` | The check holds. | None. |
| `WARN` | Valid launch, but a non-default path is off (for example the gateway is disabled, so manual transfer only). | Confirm that is intended. |
| `FAIL` | The feature is unusable as configured. | Fix before launch; the command exits `1`. |

Checks, in order:

1. `AI_GATEWAY_ENABLED` — `FAIL` when false, because customer routes return
   `404` and nothing is sellable.
2. `ACTIVE_TOPUP_PACKS` — `FAIL` when no active pack exists; otherwise the
   count and the cheapest/highest amount range are printed.
3. `BANK_COPY` — `FAIL` when any of the bank name, account, or holder is empty
   (manual transfer returns `503`); the output only says `set`/`missing`.
4. `PAYMENT_GATEWAY_ENABLED` — `WARN` when the gateway is off. Manual bank
   transfer alone is a valid launch.
5. `MIDTRANS_PROVIDER` — `WARN` only when the gateway is enabled but the
   provider is not fully configured. Use `python -m scripts.check_payment_config`
   for the detailed blocking issues.

Exit code `0` means no `FAIL` (warnings allowed); exit code `1` means at least
one check failed, so the command can gate an ops checklist.

### Fixing a `FAIL`

| Failed check | Fix |
|---|---|
| `AI_GATEWAY_ENABLED` | Set `AI_GATEWAY_ENABLED=true` in the deployment env and recreate the backend. |
| `ACTIVE_TOPUP_PACKS` | Open `/admin/ai/packs` and add at least one active pack (or `POST /api/admin/ai/topup/packs`). Prices are an owner decision; the migration deliberately seeds none. |
| `BANK_COPY` | Set `INVOICE_BANK_NAME`, `INVOICE_BANK_ACCOUNT`, `INVOICE_BANK_HOLDER` and recreate the backend. Without them manual orders return `503`. |

Re-run the command after each fix; the target is `TOP-UP READINESS: OK` with
exit code `0`. A remaining `WARN` on `PAYMENT_GATEWAY_ENABLED` is fine when the
launch is manual-transfer only.
