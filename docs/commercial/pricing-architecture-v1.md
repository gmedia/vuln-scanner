# Sinexis — Pricing Architecture v1 (per-seat)

**Status:** **Draft v1 — 2026-10-12.** Owner locked two things on this date:
1. the **“Sinexis Secure” bundle** list IDR — Basic **450.000** · Pro **1.000.000** · Multi **2.900.000** / mo; and
2. **H4 Host Protect** list IDR — Basic **150.000** · Pro **350.000** · Multi **900.000** / mo, which upgrades [`sku-host-protect.md`](sku-host-protect.md) H4 from *working list* to *locked*.

Everything else here (**Uptime**, **Guard**, **Enterprise floor**, **annual discount**) is **proposed (usulan)** — not finance lock, not quotable as final.

**Not a legal contract.** Finance may still ± band before first invoice. This is a **design + lock record**, not a GTM plan and not an agent work queue.
**Relationship to existing locks:** Scan SKU [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) **A1** (300.000 / 650.000 / 2.000.000) remains the P0 lock. This doc does **not** reprice it; it composes the four attach lines into one **seat** model and adds a bundle.
**Public repo hygiene:** no customer SIDs, names, hosts, or credentials in this file.

---

## 0. Core decision — per-seat, **not** credit

| | Credit wallet | **Per-seat (chosen)** |
|---|---|---|
| Headline the buyer hears | “10 credits” | “1 site / 3 assets / 25 monitors” |
| Renewal conversation | wallet balance | “you outgrew 3 → move to 10” |
| Abuse control | drain the wallet | rate limits + hard seat caps |
| Fits existing code | needs a second currency | already **`org.sku`** + seat caps |

**Decision:** sell **seats** (protected units) + **cadence**. Credits are **not** the customer meter.

**Where credit still exists (unchanged):**
- `users.credits` — **legacy/ops only** (history, e2e, admin adjust). **Not** a gate; eligibility always `required_credits = 0` ([`metering-v3-sku-seats.md`](../specs/metering-v3-sku-seats.md) S4).
- **AI Gateway** — separate `ai_wallets.balance_idr`. Never merged into Scan credits (S6).

---

## 1. What a “seat” is

A **seat = one protected unit**, metered per product. A seat is **not** a user account (that invites shared logins and gives away capacity).

| Product | Seat unit | Code / source |
|---|---|---|
| **Scan** | named asset (domain / IP) | `/assets`, `org.sku` cap |
| **Host Protect** | web path / site on an enrolled VPS | `host_sites` |
| **Uptime** | monitor (HTTP / TCP / DNS / heartbeat) | uptime monitors |
| **Guard** | enrolled agent (VM) | Guard inventory |

Cadence is part of the tier (monthly → weekly → daily), not an extra line.

---

## 2. Tiers and seat caps

| Seat type | Basic | Pro | Multi | Enterprise |
|---|---|---|---|---|
| Scan named assets | **1** | **3** | **10** | custom |
| Host Protect sites (`host_sites`) | **1** | **3** | **10** | custom |
| Uptime monitors | **5** | **25** | **100** | custom |
| Guard agents (VMs) | **1** | **5** | **20** | custom |
| Workspace multi-user | no | yes | yes | yes |
| Cadence | monthly | weekly or monthly | weekly | custom |
| Report | summary + job link | full baseline diff + exec HTML | pack JSON + multi-target exec export | + human review, SLA |

Scan + Host caps **mirror** the existing hard caps (A1 / H3) — no new numbers invented. Uptime and Guard caps are **usulan** and are the only new cap figures in this doc.

---

## 3. Bundle — “Sinexis Secure” (**LOCKED 2026-10-12**)

One line covering all four attach products at the matching tier.

| Tier | Bundle IDR / mo | À la carte sum | Bundle saving |
|---|---|---|---|
| **Basic** | **450.000** | 750.000 | **300.000 (~40%)** |
| **Pro** | **1.000.000** | 1.700.000 | **700.000 (~41%)** |
| **Multi** | **2.900.000** | 4.700.000 | **1.800.000 (~38%)** |

À la carte sum uses the locked Scan (A1) + locked Host (H4) and the **proposed** Uptime + Guard numbers in §4. If Uptime/Guard move, the sum moves; the **bundle prices above are locked regardless**.

**Rationale for ~40% bundle discount:** the four lines share one enrollment/ops surface (one Guard agent, one VM, one org). Marginal COGS of the 2nd–4th line is small; the discount buys the whole-stack attach instead of a single-SKU sale.

---

## 4. À la carte lines

| Line | Basic | Pro | Multi | Lock state |
|---|---|---|---|---|
| **Scan** (`Sinexis Scan`) | 300.000 | 650.000 | 2.000.000 | **LOCKED** (A1) |
| **Host Protect** (`Host Protect Add-on`) | 150.000 | 350.000 | 900.000 | **LOCKED** (H4, this doc) |
| **Uptime** | 100.000 | 250.000 | 600.000 | **usulan** |
| **Guard** | 200.000 | 450.000 | 1.200.000 | **usulan** |

**Guard** = thin Wazuh (inventory + critical alerts), **not** full SIEM. **SIEM** is a flagged module, not a priced line in v1.
**Host WAF** stays **inside Host Multi** (detect on Pro/Multi, protect on Multi) per H7 — not a separate IDR line.

---

## 5. Policy

| ID | Topic | Decision |
|----|--------|----------|
| **P1** | Overage | More units → **upgrade tier**. Not unlimited fair-use, not a credit pack. |
| **P2** | Annual | **usulan:** pay 10 months for 12 (~16,7% off). Not locked. |
| **P3** | Pilot | **1 month sponsored** for pilot #1 only (unchanged, A2). List price still recorded in CRM. |
| **P4** | Legacy credits | `users.credits` stays as history/ops; **not** a gate; **not** customer chrome (S4). |
| **P5** | AI Gateway | Separate `ai_wallets.balance_idr`. Never merged. |
| **P6** | Enterprise | **custom** — floor not set (usulan: ≥ Multi bundle, annual commit). |
| **P7** | Discounting | Only annual (P2) + pilot (P3). No ad-hoc % off list without finance. |
| **P8** | Invoice | Sinexis in-app `/admin/invoices` (I1/D5 preferred). GMD `service_id` optional, **not** the gate. Never silent-bundle into VPS. |

---

## 6. Rollout / migration

1. **Existing Scan-locked orgs** keep A1 pricing. No forced migration.
2. **Host working-list quotes** become **locked** at H4 from this date.
3. **Bundle** is a **new** offer only — do not re-paper existing lines into it.
4. `org.sku` (`basic` / `pro` / `multi`) stays the single capacity source; bundle does not add a second SKU field.
5. Flag-off default: `SIEM_ENABLED` false; `AI_GATEWAY_ENABLED` false. Bundle does **not** enable them.

---

## 7. Owner decisions still open

- [ ] **Uptime** IDR (usulan 100k / 250k / 600k)
- [ ] **Guard** IDR (usulan 200k / 450k / 1,2jt)
- [ ] **Enterprise** floor
- [ ] **Annual** discount % (usulan ~16,7%)
- [ ] Uptime / Guard **seat caps** (usulan 5/25/100 and 1/5/20)

---

## 8. Risks / anti-patterns

- **Do not** headline credits again — metering v3 already dropped them (S7).
- **Do not** price per **user**; price per **protected unit**.
- **Do not** imply Guard = SIEM, or that the bundle includes full SIEM/SOC.
- **Do not** paste Host WAF onto the `sinexis.app` edge (customer nginx only).
- **Do not** silent-bundle any line into a VPS/colo SKU.
- **Do not** treat the proposed numbers as quotable until §7 is signed off.

**Benchmark used (context only, FX ≈ Rp16.000/USD):** Imunify360 ~$12–45/server (~192k–720k IDR); Intruder $99–204; Pentest-Tools $95–190 (5 assets); UptimeRobot $9–45; Pingdom $15 (10 monitors). Confirms the bundle band sits inside the “already paying for the box” wallet.

---

## 9. Links

- Scan SKU (A1 lock): [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md)
- Host Protect SKU (H4, now locked): [`sku-host-protect.md`](sku-host-protect.md)
- One-pager: [`sinexis-one-pager.md`](sinexis-one-pager.md)
- Metering v3 (seats): [`../specs/metering-v3-sku-seats.md`](../specs/metering-v3-sku-seats.md)
- Product context: [`../../.agents/product-marketing.md`](../../.agents/product-marketing.md)
