# GTM + P11 ops runbook (human)

**Status:** execution checklist for **humans** (finance / AM / ops). Not a second SKU. **No** customer SIDs, FQDNs, IPs, tokens, or passwords in this file.
**Policy:** [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) · email: [`am-wave1-email-id.md`](am-wave1-email-id.md) · P11: [`../specs/status-hostname-lifecycle.md`](../specs/status-hostname-lifecycle.md).
**Agents:** may **remind** and update this checklist. May **not** invent CRM rows, merge Dependabot, or call Cloudflare with secrets from git.

---

## A. GTM (P0 still open)

Do in order. Success = CRM + billing, **not** a GitHub PR.

| # | Owner | Action | Done when (private) |
|---|--------|--------|---------------------|
| 1 | Finance | Three **`service_id`**: Basic / Pro / Multi. Line names per SKU B2. **Do not** silent-bundle into VPS | AM can quote a distinct add-on line |
| 2 | Ops | Confirm live admin **`pricing`**: domain / IP / mobile / **`statushost`**. Typical smoke: domain **2**, IP **1**; `statushost` seed **0** until N is set | Note in CRM (not git) |
| 3 | AM | Pick **10 wave-1 SIDs** matching SKU §5 patterns (VPS+domain, colo IP, multi-service, existing security line, CORPORATE) | Private CRM list only |
| 4 | AM | Send [`am-wave1-email-id.md`](am-wave1-email-id.md) from AM identity; log date + tier | CRM activity |
| 5 | AM + product | Name **pilot #1** (prefer multi-service VPS+domain; hotel = #2) | CRM + 1 mo sponsored flag; **list price still recorded** |
| 6 | Ops | Fulfill SKU §3: credits, org `sku`, `/assets`, 1:1 schedule, notify, first executive HTML (Bahasa) | Buyer has HTML; beat healthy |
| 7 | AM | Follow-up 7–10d; **AM owns renew** | Next date in CRM |

**Do not promise in wave-1:** SIEM, Guard/Wazuh, “100% aman”, unlimited scans, 24/7 SOC, nested multi-property Projects.

**Workspace:** multi-user **is shipped** (P2). AM may mention “undang rekan (viewer)” for Pro/Multi. Do **not** sell org wallet.

---

## B. P11 custom hostname (post-#471)

Product: `hostname_status=active` **only** if Cloudflare Custom Hostname **SSL = active**. Credits: debit **N** from admin pricing key **`statushost`** (≤10 chars) on **first** transition to Active (and after hostname change). Seed **0**. No debit on Save / Pasang / `pending_txt`. No refund on Lepas. HTTP 402 → keep previous status.

### B.1 Admin pricing

1. Platform admin → Pricing.
2. Set **`statushost`** to agreed **N** (integer credits). **0** = free attach (current seed).
3. Do **not** hardcode “3 credits” in copy.

### B.2 Operator (SPA)

1. Status page published; custom host field filled.
2. **Pasang** (not Save) creates CF hostname when token is on the **deploy host**.
3. Customer DNS: **CNAME** → `customers.sinexis.app` (or documented `status-edge.sinexis.app`) + **TXT** from the instruction card. Sinexis does **not** edit their zone.
4. Click **Cek status** until SSL active. TXT card stays while `pending_txt`.
5. Confirm public apex is **status HTML**, not the marketing landing. Platform `/status/{slug}` unchanged.
6. **Lepas** deletes CF hostname; no credit refund.

Frozen testids: `status-page`, `status-page-host`, `status-page-publish`, `status-page-create`, `status-page-slug`, `status-page-save-slug`.

### B.3 Edge / CF (ops only — env names, not values)

| Item | Rule |
|------|------|
| Secrets | GitHub / host env: `STATUS_PAGE_CF_API_TOKEN`, `STATUS_PAGE_CF_ZONE_ID`, stub flag for CI |
| Zone | SaaS on `sinexis.app`. **`appmedia.id` is not a CF zone** |
| Origin | Do **not** open origin `:443` to the internet; do **not** put origin IPs in git |
| SKU | Custom host = **multi** until a later meter SKU |
| Public HTML | Never leak monitor URL, origin IP, headers, or TXT tokens |

### B.4 Do not re-implement

PRs **#464–#471** (apex, CF create/poll/delete, env inject, SSL-gated Active, `statushost` debit) are **on `main`**. Next = human SSL + set N.

---

## C. Guard / SIEM (standing)

| Item | Rule |
|------|------|
| Live org `sx-erpstg` | **Online — do not re-enroll or wipe** |
| Lab `tc5` | Wipe-first [`AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §4.1 if user asks enroll |
| Playwright | ≠ host enroll |
| SIEM | Prod flag **ON**; `SIEM_INCLUDE_FULL_LOG` false; **no** Discover on `/guard` |
| 1514 | Do not open to `0.0.0.0/0` |

---

## D. Engineering default (agents)

- **Do not** mass-merge Dependabot. Merge **one** PR only if the user **names the number** and CI is green.
- **Do not** start P6 S1 UI, Uptime advanced settings, or legal pages without implement.
- **Do not** recapture screenshots in parallel (OOM).
- Prefix git with `GIT_MASTER=1`. Never commit on `main`.

---

*2026-08-28. If this file disagrees with the execution guide on epic order, the guide wins.*
