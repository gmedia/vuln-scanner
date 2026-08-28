# Sinexis Scan — hospitality one-pager (AM)

**Status:** P6 **S3** — print this file to PDF (A4) for AM. Not a legal offer. No customer SIDs, FQDNs, IPs, or invoices in git.
**Print:** browser or `pandoc` → PDF; keep GMD letterhead off this public repo.
**Policy:** [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) · talk track: [`sinexis-one-pager.md`](sinexis-one-pager.md) · email: [`am-wave1-email-id.md`](am-wave1-email-id.md) · pack: [`../specs/hospitality-pilot-pack-v1.md`](../specs/hospitality-pilot-pack-v1.md).

---

## For the GM / owner (60 seconds)

You already pay for **colo, VPS, or cloud**. Public IPs and booking/Wi‑Fi domains still change: open ports, weak TLS, leftover admin paths.

**Sinexis Scan** is a **monthly add-on** on that infra — not a new rack, not a SIEM, not “100% aman”.

| You get | You do not get |
|---------|----------------|
| Scheduled check of named targets | Replace firewall / WAF |
| Email when **new critical/high** appears | 24/7 SOC |
| What changed vs last run | Full log search (SIEM) on day one |
| One **executive HTML** in Bahasa | Unlimited scans |

**Pilot #1:** 1 month sponsored, **1–3 targets**, list price still recorded. Convert or disable schedules at month end.

---

## Working list (AM quote)

| Tier | Targets | Credits / mo | IDR / mo |
|------|---------|--------------|----------|
| **Basic** | 1 | 10 | **300.000** |
| **Pro** | ≤3 | 24 | **650.000** |
| **Multi-asset** | ≤10 | 60 | **2.000.000** |

Invoice = **new `service_id` per tier**. Do not silent-bundle into VPS.

**Hotel language → product:** property / PMS / booking site = **asset**; weekly check = **schedule**; GM PDF/HTML = **executive report**; IT login = **workspace** (invite viewer). Hybrid review of criticals: **5 business days**, not a SOC SLA.

---

## AM close (copy)

1. Confirm SID pattern (VPS+domain, colo IP, or multi-service).
2. Offer Basic or Pro; Multi only if ≥4 named targets.
3. Send wave-1 email; log CRM date + tier.
4. Ops: credits, org SKU, `/assets`, 1:1 schedule, first HTML.
5. Follow-up 7–10d. **AM owns renew.**

**Do not promise:** Guard/Wazuh, SIEM, nested multi-property Projects, org wallet, unlimited, “aman 100%”.
