# Sinexis — one-pager (P0 locked)

**Status:** **P0 commercial lock (user-approved 2026-08-08)**. Working list for AM — not a legal offer. Finance may ± adjust IDR; policy defaults are locked in [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) §0.
**Product readiness:** **Scan Attach (P1) live** — schedule, new critical/high notify, baseline diff, executive HTML, credit debit, max 10 schedules/user.
**Surface:** repo/product **VulnScanner** (`vs.appmedia.id`); attach brand **Sinexis** (soft dual-brand **6–12 months**).
**Evidence:** GMD mix colo/rack + VPS/cloud heavy; security lines thin; hospitality = relationship beachhead, not mass invoice count.

---

## 1. What we sell

**Sinexis Scan** = recurring **security attach** on infra GMD already bills:

| Not this | This |
|----------|------|
| Replace colo/VPS | **Add-on** on colo IP / VPS / cloud |
| Full SIEM day-one | **Scheduled external scan** + what changed + manager-readable report |
| One-shot hobby dashboard | **Monthly/weekly reason to pay** |

**Sinexis Guard** (host alerts) = **parked** second upsell (P5) after Scan attach works.

---

## 2. Who buys vs who uses

| Role | Typical | Needs |
|------|---------|--------|
| **Buyer** | Owner, GM, IT manager, AM GMD | Price, risk story, one HTML/email |
| **Daily user** | IT / MSP / GMD NOC hybrid | Schedule, findings, credits |
| **Viewer** (P2+ only if pain) | Hotel ops / compliance | Read-only history |

**Near-term:** one login = one technical contact; pilot may add **human review** of critical findings.

---

## 3. Dual GTM

| Wedge | Motion | Weight |
|-------|--------|--------|
| **B — Upsell existing** | Attach on invoiced colo/VPS/cloud | **Primary KPI = attach ARPU** |
| **A — Hospitality** | Relationship hotels; multi-property later | Narrative + later pilot #2 |

---

## 4. Modules (customer language)

| Module | Promise | Order |
|--------|---------|-------|
| **Scan** | Cadence check domain/IP; new critical/high; executive summary (Bahasa) | **P1 — shipped** |
| **Workspace** | Several people, one company | **P2 — only if multi-user blocks** |
| **Assets** | Named targets / packs | **P3** |
| **Guard** | Host critical alerts | **P5 — parked** |

Mobile APK/IPA = engine feature, **not** hero SKU for GMD servers/domains.

---

## 5. Working list price (AM)

| Tier | Targets | Credits / mo | IDR / mo |
|------|---------|--------------|----------|
| **Basic** | 1 | 10 | **300.000** |
| **Pro** | ≤3 | 24 | **650.000** |
| **Multi-asset** | ≤10 | 60 | **2.000.000** |

**Pilot #1:** **1 bulan sponsored**; pattern = multi-service / VPS+domain; **1–3 targets**.
**Overage:** top-up kredit or upgrade. **Invoice:** new service_id per tier (no silent VPS bundle).

Detail: [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md).

---

## 6. Trust (say out loud)

- External posture only — not “hack-proof”.
- No finance/PII dumps or customer target lists in public git.
- SSH/prod credentials = ops-only.
- Pilot: automation + optional human review of criticals.

---

## 7. Competitive frame

“You already pay for the rack or VPS — **Sinexis Scan** is the monthly check that shows what changed on the public surface, in language management can act on.”

---

## 8. 60-second talk track (AM)

1. **Hook:** Colo/VPS sudah dibayar — permukaan publik jarang dicek berulang.
2. **Offer:** Add-on **Sinexis Scan**: jadwal, kabar critical/high baru, beda vs run lalu, laporan HTML (Bahasa).
3. **Not:** Bukan ganti firewall/SIEM; bukan aman 100%.
4. **Proof:** Platform scan GMD sudah jadwal + kredit + laporan.
5. **Ask:** Basic **300rb** (1 target/bulan) atau Pro **650rb** (hingga 3, mingguan + diff).
6. **Next:** AM catat SID di CRM; ops: user + kredit + schedule.

**Wave-1 email:** product siapkan template; **AM kirim**. **Renew:** AM.

---

## 9. Ownership & next execution

| Who | Does |
|-----|------|
| **AM** | 10 SID CRM, kirim wave-1, renew, upsell |
| **Product/ops** | Template email, credits, schedules, first report, optional critical review on pilot |
| **Finance** | service_id Basic/Pro/Multi |
| **Engineering** | Idle on epics unless bug or **P2 spec** after multi-user pain |

---

## 10. Links

| Doc | Role |
|-----|------|
| [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) | Full decision log + tiers |
| [`../specs/scan-attach-v1.md`](../specs/scan-attach-v1.md) | P1 engineering |
| [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) | Roadmap P0–P6 |
