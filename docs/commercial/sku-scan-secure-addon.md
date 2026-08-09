# Scan / Secure Add-on — SKU (P0 locked)

**Status:** **P0 commercial lock (user-approved 2026-08-08)** — decisions below follow the recommended defaults the product owner accepted. **Not a legal contract**; finance may still tweak IDR ± band before first invoice, but AM may use these as **working list**.
**Product (P1 Scan Attach):** live on production — schedules, baseline diff, notify, executive HTML, credits gate, cap **10** enabled schedules/user (edge smoke 2026-08-08).
**Metering:** per-scan **credits** (`pricing.credit_cost` by `scan_type`: ip / domain / mobile). Typical edge costs from smoke: **domain = 2**, **ip = 1** (re-confirm admin pricing before each quote wave). No second currency.

---

## 0. Decision log (locked)

| ID | Topic | Decision |
|----|--------|----------|
| **A1** | List price IDR / mo | **Basic 300.000** · **Pro 650.000** · **Multi-asset 2.000.000** (mid of recommended bands; GMD finance may ± adjust) |
| **A2** | Pilot discount | **1 bulan sponsored** untuk **pilot #1 only**; list price tetap tercatat di CRM |
| **A3** | Overage | **Top-up kredit** dan/atau **upgrade tier** — **bukan** unlimited fair-use |
| **A4** | Credit bundle / mo | **Basic 10** · **Pro 24** · **Multi-asset 60** (top-up on invoice date via admin/CRM) |
| **A5** | Mobile scan | **À la carte** on credits — not required for attach SKU |
| **B1** | Invoice packaging | **New `service_id` per tier**; pilot boleh baris manual dulu lalu migrate. **Jangan** silent-bundle ke VPS |
| **B2** | Line names | Internal: **Sinexis Scan – {Tier}**. Invoice pelanggan (soft dual, 6–12 bln): **Secure Scan Add-on – {Tier}** OK |
| **B3** | Renew ownership | **AM GMD owns renew + upsell**; product owns fulfillment & report quality |
| **B4** | First 10 emails | **Hybrid:** product = template + proof; **AM sends** to own SIDs |
| **C1** | Near-term KPI | **Attach ARPU primary** (colo/VPS/cloud). Hotel logos = narrative, not sole score |
| **C2** | Wave-1 targets | **10 SID** di **CRM privat** only — patterns §5 (no PII in git) |
| **C3** | Pilot #1 | **Multi-service / VPS+domain design-partner first**; hotel relationship = **#2** if multi-user pain → P2 |
| **C4** | Pilot delivery | **Auto schedule** + optional **human review of critical** 1×/bulan for pilot #1 |
| **C5** | Pilot target count | **1–3 targets** (Basic/Pro). Not Multi-10 until renew process proven |
| **D1** | Report language v1 | **Bahasa Indonesia** (EN later) |
| **D2** | Dual-brand window | **6–12 months** soft dual; no hard rebrand before attach ARPU |
| **D3** | P2 Workspace | **Only if** multi-user / multi-property blocks paid delivery — spec first |
| **D4** | P5 Guard | **Park** — second upsell after Scan attach |
| **D5** | Billing in app | **Mix v1:** GMD invoice + **manual credit top-up** in app; no subscription table yet |
| **E1** | Infra failure | **No charge** / one auto-retry (P1 direction) |
| **E2** | Zero credits mid-cycle | Schedule **auto-disabled** + `last_error`; AM top-up or upgrade |
| **E3** | Cap 10 | **1 schedule ≈ 1 target** v1; Multi-asset ≤ **10** enabled schedules |
| **E4** | Public repo | No customer SID/domain/PII/SSH in git |

**Still open (ops execution, not policy):** pick the concrete **10 CRM SIDs** and **named pilot #1** in private CRM; create finance **service_id** records in billing system.

---

## 1. Offer name

| Internal | Customer-facing (soft dual-brand) |
|----------|-----------------------------------|
| Scan Attach / Secure Add-on | **Sinexis Scan** · invoice may show **Secure Scan Add-on – {Tier}** during dual-brand window |

Bundle with colo/VPS as **add-on line item**; do not reprice rack.

---

## 2. Tiers (v1 locked working list)

| Tier | Who | Targets | Cadence | Report | Credits / mo | List price (IDR / mo) |
|------|-----|---------|---------|--------|--------------|------------------------|
| **Basic** | Single VPS or one public IP/domain | **1** domain **or** **1** IP | Monthly | New critical/high summary + job link | **10** | **300.000** |
| **Pro** | Small corporate / busy VPS | **Up to 3** (mix domain/IP) | Weekly **or** monthly at signup | Full **baseline diff** + executive HTML | **24** | **650.000** |
| **Multi-asset** | Multi-service / hotel group / multi-IP colo | **Up to 10** (P3 registry later; labeled list OK) | Weekly | Multi-target pack + executive export; hybrid review optional | **60** | **2.000.000** |

**Out of tier v1:** full SIEM, Windows depth, org wallet, unlimited targets, 24/7 SOC, Guard.

**Credit math (guide):** domain ≈ 2 credits, IP ≈ 1. Basic 10 ≈ several monthly domain runs + buffer; Pro 24 ≈ weekly domain ×3 targets with headroom; Multi 60 ≈ weekly across many targets — ops must top up if customer burns manual scans.

**Mobile:** à la carte only.

---

## 3. What “included” means technically (P1+)

| Capability | Basic | Pro | Multi-asset |
|------------|-------|-----|-------------|
| Scheduled scan (domain/IP) | Yes | Yes | Yes |
| Notify on **new** critical/high | Yes (simple) | Yes | Yes |
| Baseline diff detail | Summary | Full | Full |
| Executive HTML | One-pager | Full | Full + multi-target pack |
| Named asset registry | Manual labels | Light | **P3** later |
| Workspace multi-user | No (P2 on pain) | No | Preferred after P2 |
| Guard / Wazuh | No | No | Separate SKU later (P5 **parked**) |

### Fulfillment checklist (ops after sold)

1. Top up **credits** for the period (match tier bundle A4, or pilot sponsored grant).
2. Create **1…N schedules** (domain/IP, weekly/monthly) — hard cap **10 enabled**/user.
3. Confirm **notify email** + beat/workers healthy (`docs/scan-schedules-ops.md`).
4. After first completed run: buyer gets **executive HTML** + diff story (Bahasa).
5. Renew in **CRM** (AM); no in-app subscription v1.
6. Pilot #1 only: optional **human review** of critical findings 1×/month.

---

## 4. Credit policy

1. Scheduled runs **debit** same costs as manual scans.
2. Worker/infra failure → **no charge** or one auto-retry.
3. Monthly bundle top-up on invoice date (admin credits + CRM note).
4. Overage → credit top-up **or** upgrade tier.
5. Insufficient credits → schedule **`enabled=false`** + `last_error` (no thrash).

**Code hooks:** table **`pricing`**; `User.credits`; `CreditLog`.

---

## 5. Upsell target *patterns* (no PII in git)

| Pattern | Why | Open with |
|---------|-----|-----------|
| **VPS + public domain** | Clear monthly story | Basic or Pro |
| **Colo / dedicated public IP** | IP scan hero | Basic → Pro |
| **Multi-service** (≥3 lines) | Design-partner | Pro / Multi pilot |
| **Already pays security/firewall line** | Security wallet | Pro |
| **CORPORATE top revenue** | Attach ARPU | Pro first |
| **HOTEL multi-property (relationship)** | Beachhead A | Pilot #2 / P6 — not wave-1 sole focus |

**Wave-1 anti-patterns:** offline-only; no public IP/domain; selling Guard before Scan.

**Execution:** AM selects **10 SIDs** matching patterns above in **private CRM** (checklist item — not committed here).

---

## 6. Pilot definition

**Pilot #1 pattern (locked):** multi-service **or** VPS+domain design-partner; **1–3 targets**; **1 month sponsored**; auto schedule + optional critical human review.

**Done when:**

- [ ] One such account on sponsored/paid attach ≥1 month
- [ ] ≥1 scheduled cycle with diff or executive summary (Bahasa)
- [ ] Written feedback: renew / expand?
- [ ] No secrets or customer PII in public git

**Pilot #2 (optional):** relationship hotel — especially if multi-login pain justifies **P2 Workspace** spec.

---

## 7. Packaging on GMD invoice

| Approach | Status |
|----------|--------|
| New **service_id** `Sinexis Scan – Basic/Pro/Multi-asset` (or Secure Scan Add-on – …) | **Preferred (locked)** |
| Manual line on existing SID | OK for **pilot week 1** only |
| Silent bundle into VPS SKU | **Forbidden** |

---

## 8. Remaining execution checklist (not re-litigate policy)

- [ ] Finance creates **three service_id** rows
- [ ] AM picks **10 wave-1 SIDs** in private CRM
- [ ] Name **pilot #1** privately; grant credits + schedules
- [ ] Product delivers **1 email template** (Bahasa) for AM wave-1
- [ ] Confirm live `pricing` domain/IP still 2 / 1 before quoting

---

## 9. Links

- One-pager: [`sinexis-one-pager.md`](sinexis-one-pager.md)
- Engineering: [`../specs/scan-attach-v1.md`](../specs/scan-attach-v1.md)
- Schedule ops: [`../scan-schedules-ops.md`](../scan-schedules-ops.md)
- Priority: [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3
