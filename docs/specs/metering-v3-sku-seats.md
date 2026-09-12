# Spec: Metering v3 — Scan/Host/Uptime = SKU seats only

**Status:** **implementing** (this PR). Owner: drop the Scan **credit wallet** as a customer meter. Everything attach-shaped uses **org SKU seats** (Basic 1 / Pro 3 / Multi 10).
**Does not** change AI Gateway (org **IDR wallet** stays). Does **not** invent Guard/SIEM invoice `service_id`.
**Supersedes:** metering v2 **M4** (credits as overage for ip/domain/mobile/`statushost`). Scheduled attach already `credit_cost = 0` (v2 M2).

---

## 0) Locked

| ID | Topic | Decision |
|----|--------|----------|
| **S1** | Customer meter for Scan | **Seats:** named assets + cadence. Manual IP/domain/APK/IPA **do not debit** `users.credits`. Job `credit_cost = 0`. |
| **S2** | `statushost` | **No debit.** Custom hostname activation is SKU/ops, not Scan credits. Seed cost ignored. |
| **S3** | Host / WAF / Uptime | Unchanged: `host_sites` / monitors / WAF protect = **Multi**. Scan on-box still 0. |
| **S4** | Wallet leftover | `users.credits` + `/credits` + admin adjust **remain** (history, e2e). **Not** a gate. Eligibility always `eligible=true`, `required_credits=0`. |
| **S5** | Abuse | Existing rate limits + SKU asset cap + 10 schedules/org. Not a second currency. |
| **S6** | AI Gateway | **Out.** Still `ai_wallets.balance_idr`. Do not merge into Scan credits. |
| **S7** | A4 packs | Dead as a sell line. Do not quote “10/24/60 credits.” |

---

## 1) Runtime

### Scanner `start_scan`

- Do **not** `UPDATE users.credits`.
- Do **not** insert `credit_logs` deduct/refund for dispatch fail.
- Always persist `scan_jobs.credit_cost = 0`.
- Org membership AuthZ unchanged.

### Status page hostname

- `_debit_hostname_if_activated`: no-op (no 402, no CreditLog).

### `GET /api/credits/eligibility/{scan_type}`

- Still 200 for ip/domain/apk/ipa.
- `required_credits = 0`, `eligible = true` (ignore `pricing.credit_cost`).

### SPA scan forms

- Must **not** disable submit on empty wallet / eligibility false.
- Cost preview may hide or show “included in SKU.”

---

## 2) Copy

SKU / one-pager / AM / GTM: no credit packs. Seats + cadence only.

---

## 3) Out

- Dropping `credits` column or Credit History page (later).
- Per-scan IDR invoice.
- Org Scan wallet.
- Changing Basic/Pro/Multi seat counts.
- AI IDR → SKU seats.

---

## 4) DoD

- [ ] pytest: `start_scan` with 0 credits succeeds; user.credits unchanged; `credit_cost == 0`.
- [ ] pytest: hostname activate does not 402 on 0 credits.
- [ ] eligibility `required_credits == 0`.
- [ ] Vitest: IP/domain/mobile submit not blocked by credits chip.
- [ ] Commercial docs: no A4 headline.
