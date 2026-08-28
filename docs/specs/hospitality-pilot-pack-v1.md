# Spec: Hospitality / pilot pack v1 (P6)

**Status:** **S1–S3 implemented** — Workspace checklist, pack HTML, AM one-pager ([`hospitality-am-one-pager.md`](../commercial/hospitality-am-one-pager.md); print to PDF).
**Goal:** Give AM/ops a **repeatable beachhead pack** for hotel / multi-property pilots without a logos-only marketing site or a new CMDB.
**Epic:** P6 per [`docs/AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3.
**Depends:** P0 SKU lock · P1 Scan Attach · P2 Workspace · P3 assets · P4 soft dual-brand. Guard (P5) and SIEM (P7) are **optional second SKUs**, not in this pack.
**Commercial:** [`docs/commercial/sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md).
**Not this epic:** PMS/IoT inventory, nested properties as Projects, org wallet, customer Wazuh dashboard, Palatino “briefing” skins, committing hotel names/SIDs/domains.

---

## 1. Problem

Wedge **A** (hospitality) is strategically useful and weak in current billing extracts. Wedge **B** (colo/VPS upsell) is the near-term KPI. Without a pack:

| Gap | Pain |
|-----|------|
| AM has SKU + email, no hotel-shaped **runbook** | First hotel deal becomes ad-hoc Slack |
| Multi-property looks like Multi-asset 10 | Ops over-promises 10 brands before renew works |
| Hybrid “we review criticals” is undefined | Product looks like a 24/7 SOC |
| Guard already live on one lab org | Easy to bolt Wazuh into the hotel pitch |

---

## 2. Goals

1. **One-page runbook** for a hospitality pilot: who, what targets, cadence, report, hybrid SLA.
2. **Map hotel language → existing product** (org, assets, schedules, executive HTML) — no new tables in S0/S1.
3. **Hard caps** reuse P3 SKU (Basic 1 / Pro 3 / Multi 10) and P2 schedule cap 10/org.
4. **Hybrid managed** = optional 1×/month human review of **new critical/high** for **pilot #1 only** — not a SOC SKU.
5. **GTM split:** hotel logos = narrative; attach ARPU on colo/VPS remains primary.

---

## 3. Non-goals

| Out | Why |
|-----|-----|
| New SPA “Hotel dashboard” | Reuse Workspace + `/assets` + schedules |
| PMS / booking-engine / CCTV / IoT | Out of attach SKU |
| Per-property nested Project | Workspace v1 = 1 org = 1 workspace |
| Guard/SIEM in the same sales sentence as Scan | Second upsell; do not bundle |
| Legal `/terms` `/privacy` | Cluster B still no URL |
| Customer names, SIDs, FQDNs in git | Public repo |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Pilot #1 identity | **Multi-service / VPS+domain first**. Hotel relationship = **pilot #2** if multi-user pain is real |
| Sponsored | **1 month** list price still in CRM |
| Targets | **1–3** (Basic/Pro). Multi-10 only after renew process proven |
| Org | One hotel **or** one group = one org; extra properties = more **assets**, not nested projects |
| Credits | Personal (Workspace D1); ops top-up on invoice date |
| Report | Bahasa executive HTML; AM owns renew |
| Hybrid SLA | Email within **5 business days** of a **new critical** notify during sponsored month — not 24/7 |
| Guard | Do not enroll hotel hosts in v1 pack. Do **not** wipe live `sx-erpstg` |

---

## 5. Hotel language → product

| Hotel phrase | Product object | Notes |
|--------------|----------------|-------|
| Property / brand site | `scan_assets` (`domain`) | Hard cap by org `sku` |
| Public WAN / colo IP | `scan_assets` (`ip`) | Same registry |
| “IT + GM share the PDF” | Workspace invite `member` / `viewer` | Credits stay personal |
| Monthly GM pack | Executive HTML + optional `GET /api/assets/pack` | Multi only |
| “Is booking up?” | Uptime check (P8) | **Not** in Scan SKU price |
| Public status URL | P11 status page | Multi custom host; SSL-gated Active |
| Night audit / POS | Out | Not a scan target |

---

## 6. Hybrid SLA (pilot only)

**In:**

- Schedule enabled; notify on **new** critical/high.
- Ops **once** in the sponsored month: read executive HTML, 5–10 line email in Bahasa to AM (AM forwards).
- If credits hit zero: schedule auto-disables; AM tops up.

**Out:**

- Ticket SLA, phone on-call, patching customer hosts, Wazuh tuning, SIEM cases as the deliverable.

---

## 7. Runbook (ops — no PII in git)

Copy this into **private CRM**, then fill names there.

1. Finance `service_id` exists for the sold tier (do not silent-bundle VPS).
2. Create/verify org; set `sku`; invite hotel IT (owner) + GM (`viewer` OK).
3. Top up credits to tier bundle (or sponsored grant).
4. Named assets on `/assets` (1:1 schedules). Cadence monthly (Basic) or weekly (Pro+).
5. Confirm notify mailbox; first due run; send executive HTML.
6. CRM: list price, sponsored flag, follow-up 7–10d, renew owner = AM.
7. End of sponsored month: convert or disable schedules (do not leave free forever).

---

## 8. Slices

| Slice | Deliverable | Code? |
|-------|-------------|-------|
| **S0** | This spec | Docs |
| **S1** | In-app “pilot checklist” on `/settings/workspace` (copy + links only) | **Shipped** |
| **S2** | Pack HTML across assets (beyond JSON pack) | **Shipped** |
| **S3** | Hospitality one-pager PDF for AM (commercial docs) | **Shipped** (markdown → print PDF) |

### S1 acceptance

- Card `data-testid="pilot-checklist"` when an org is active.
- Six steps: org, invite, assets, schedules, credits, report/SLA.
- Links: `/assets`, `/schedules`, `/credit-history`.
- No new API, no persisted checklist state, no Guard/SIEM CTAs.
- Hidden when the user has no org.

### S2 acceptance

- [x] `GET /api/assets/pack?format=html` (default remains JSON)
- [x] i18n catalogs `asset_pack` en/id; tokens match executive report family
- [x] SPA `/assets` download HTML (`data-testid="assets-pack-html"`)
- [x] No new tables; no Guard/SIEM rows in pack
- [x] Tests: HTML 200 + invalid format 400; FE button when list non-empty

---

## 9. Acceptance (S0)

- [x] Spec exists; non-goals include Guard merge and PII.
- [x] Hotel language maps to shipped modules.
- [x] Hybrid SLA is bounded (pilot #1, 5 business days, no SOC).
- [x] S1 product work — Workspace checklist.
- [x] S2 pack HTML.
- [x] S3 AM one-pager — [`docs/commercial/hospitality-am-one-pager.md`](../commercial/hospitality-am-one-pager.md).

### S3 acceptance

- [x] One A4-printable markdown; no PII / SIDs / IPs
- [x] SKU table matches P0 lock; hotel language maps to assets / schedules / executive HTML
- [x] Explicit non-promises: Guard, SIEM, SOC, org wallet
- [x] Print is AM/ops (browser or pandoc); no binary PDF in git

---

*S3 2026-08-28. Guide wins on epic order.*
