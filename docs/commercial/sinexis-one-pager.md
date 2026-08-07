# Sinexis — one-pager (draft for sales / P0 lock)

**Status:** draft for commercial lock (P0). Not a legal offer. Prices are **sketches** — replace with approved GMD rates before customer quotes.
**Product surface today:** public repo ships as **VulnScanner** (`vs.appmedia.id`); **Sinexis** is the security attach brand (soft dual-brand).
**Evidence basis:** GMD finance mix (2026-08 analysis) — revenue dominated by **colo / rack + VPS/cloud**; security lines thin; hospitality mass logos almost absent in billing (beachhead = relationship, not invoice count).

---

## 1. What we sell

**Sinexis Scan (working name)** is a **recurring security attach** on infrastructure GMD already bills:

| Not this | This |
|----------|------|
| Replace colo/VPS | **Add-on** on colo IP / VPS / cloud |
| Full SIEM day-one | **Scheduled external scan** + clear “what changed” + manager-readable report |
| One-shot dashboard hobby | **Monthly (or weekly) reason to pay** |

Optional later module (P5, not P0): **Sinexis Guard** — thin host alerts (Wazuh-class), sold as **second** upsell after Scan attach works.

---

## 2. Who buys vs who uses

| Role | Typical | Needs |
|------|---------|--------|
| **Buyer** | Owner, GM, IT manager, account manager GMD | Price, risk reduction story, one PDF/email they can forward |
| **Daily user** | IT / MSP / GMD NOC hybrid | Schedule, findings, re-scan, credits |
| **Viewer** (P2+) | Hotel ops / compliance | Read-only history + report |

**Near-term (pre-Workspace):** one login = one customer technical contact; hybrid managed review allowed for pilots.

---

## 3. Dual GTM (both valid)

| Wedge | Motion | Near-term weight |
|-------|--------|------------------|
| **B — Upsell existing** | Attach Scan on invoiced colo/VPS/cloud SIDs | **Primary KPI** |
| **A — Hospitality beachhead** | Yogya (etc.) hotels via relationships; multi-property later | Narrative + pilot UX stress |

Do not measure success only as “new hotel logos” while colo/VPS attach is ignored.

---

## 4. Modules (roadmap language for customers)

| Module | Customer promise | Ship order |
|--------|------------------|------------|
| **Scan** | External check domain/IP on a cadence; alert on new critical/high; executive summary | **P1** |
| **Workspace** | Several people, one company/hotel workspace | **P2** |
| **Assets** | Named targets / packs (multi-property, multi-IP) | **P3** |
| **Guard** | Agent inventory + critical host alerts | **P5** (after Workspace) |

Mobile APK/IPA stays in the engine; **not** the hero SKU for GMD base (servers/domains).

---

## 5. Trust & data (say this out loud)

- Scans are **external** posture (ports, DNS, TLS, headers, known vulns via existing pipelines) — not a promise of “hack-proof”.
- No raw customer **finance/PII dumps** in the public product repo; target lists for sales stay in **private** CRM/spreadsheets.
- Production credentials and SSH targets are **ops-only** (not public markdown).
- Hybrid pilot: product automation + optional **human review** of critical findings for design partners.

---

## 6. Competitive frame (one sentence)

“You already pay for the rack or VPS — **Sinexis Scan** is the monthly check that shows what changed on the public surface, in language management can act on.”

---

## 7. Open decisions (user must tick)

- [ ] Final SKU **names** and **IDR prices** (see `sku-scan-secure-addon.md`)
- [ ] Soft dual-brand window (default: 6–12 months; `sinexis.app` when ready) vs hard cut date
- [ ] Near-term KPI: **attach ARPU** only / logos only / **both** (recommend: attach primary)
- [ ] Pilot #1 identity (private): multi-service design-partner pattern and/or relationship hotel
- [ ] Who sends first 10 upsell emails: AM GMD vs product vs hybrid

---

## 8. Links

| Doc | Role |
|-----|------|
| [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) | Tiers, credits, target patterns |
| [`../specs/scan-attach-v1.md`](../specs/scan-attach-v1.md) | Engineering acceptance for P1 |
| [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) | Full agent roadmap P0–P6 |
