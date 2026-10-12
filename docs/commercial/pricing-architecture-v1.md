# Sinexis — Pricing Architecture v1 (per-seat)

**Status:** **v1.2 — 2026-10-12 (owner-approved).** Owner locked, on this date:
1. the **“Sinexis Secure” bundle** list IDR — Basic **450.000** · Pro **1.000.000** · Multi **2.900.000** / mo; and
2. **H4 Host Protect** list IDR — Basic **150.000** · Pro **350.000** · Multi **900.000** / mo, which upgrades [`sku-host-protect.md`](sku-host-protect.md) H4 from *working list* to *locked*; and
3. the **Uptime** and **Guard** lines + **seat caps** + **Enterprise floor** + **annual discount** below (v1.2).

**Owner accepted the proposed numbers (2026-10-12):** **Uptime**, **Guard**, **seat caps**, **Enterprise floor** and the **annual discount** are now **LOCKED** (see §4, §2, §5). **R1–R6** in §8 are **accepted directions** — R4/R5/R6 still need a named slice + `buat` before any spec/code change.

**Revision v1.2 (2026-10-12):** owner approved v1.1 → numbers locked. Bundle + H4 unchanged.
**Revision v1.1 (2026-10-12):** Uptime + Guard list IDR lowered after a margin review — they are the **cheapest-COGS** lines and were over-discounted inside the bundle. Bundle and H4 stay exactly as locked. See §4 (numbers), §8 (structural recommendations).

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
| Uptime monitors | **10** | **50** | **200** | custom |
| Guard agents (VMs) | **1** | **3** | **10** | custom |
| Workspace multi-user | no | yes | yes | yes |
| Cadence | monthly | weekly or monthly | weekly | custom |
| Report | summary + job link | full baseline diff + exec HTML | pack JSON + multi-target exec export | + human review, SLA |

Scan + Host caps **mirror** the existing hard caps (A1 / H3) — no new numbers invented. Uptime and Guard caps were the only new cap figures; **owner locked them 2026-10-12**.

**One mental model (v1.1):** Scan / Host / Guard all read **1 / 3 / 10** — “Basic = 1 unit, Pro = 3, Multi = 10.” Uptime is the exception (**10 / 50 / 200**) because a monitor is a much cheaper unit. Guard agents align to 1/3/10 so a Multi bundle covers 10 VMs, matching 10 Scan assets.

---

## 3. Bundle — “Sinexis Secure” (**LOCKED 2026-10-12**)

One line covering all four attach products at the matching tier.

| Tier | Bundle IDR / mo | À la carte sum (v1.1) | Bundle saving |
|---|---|---|---|
| **Basic** | **450.000** | 625.000 | **175.000 (28,0%)** |
| **Pro** | **1.000.000** | 1.450.000 | **450.000 (31,0%)** |
| **Multi** | **2.900.000** | 4.000.000 | **1.100.000 (27,5%)** |

À la carte sum uses the locked Scan (A1) + locked Host (H4) + **now-locked** Uptime + Guard numbers in §4. The **bundle prices above are locked** and independent of any future line change.

**Rationale for the ~28–31% bundle discount:** the four lines share one enrollment/ops surface (one Guard agent, one VM, one org). Marginal COGS of the 2nd–4th line is small; the discount buys the whole-stack attach instead of a single-SKU sale. **Why not deeper:** at the original ~40% the two cheapest-COGS lines (Uptime, Guard) were effectively free, which (a) sets a “free forever” renewal expectation and (b) makes à la carte unsellable — there is no price ladder left.

**Effective cost per protected unit (bundle):** Basic 450k/1 = **450k** · Pro 1jt/3 = **333k** · Multi 2,9jt/10 = **290k**. Monotonic decline = correct tiering; Multi sits mid-band vs Imunify360 (~192k–720k/server).

---

## 4. À la carte lines

| Line | Basic | Pro | Multi | Lock state |
|---|---|---|---|---|
| **Scan** (`Sinexis Scan`) | 300.000 | 650.000 | 2.000.000 | **LOCKED** (A1) |
| **Host Protect** (`Host Protect Add-on`) | 150.000 | 350.000 | 900.000 | **LOCKED** (H4, this doc) |
| **Uptime** | 75.000 | 200.000 | 500.000 | **LOCKED** (2026-10-12) |
| **Guard** | 100.000 | 250.000 | 600.000 | **LOCKED** (2026-10-12) |

**Why lowered:** Uptime is a commodity (Pingdom ≈ $15/10 monitors; UptimeRobot ≈ $9/50) — at 100k/5 monitors it was **20k/monitor**, not defensible. At 75k/10 monitors it is **7,5k/monitor**, mid-market. Guard is thin Wazuh and is also a **prerequisite** for Host Protect (H8) — see §8 R1.

**Guard** = thin Wazuh (inventory + critical alerts), **not** full SIEM. **SIEM** is a flagged module, not a priced line in v1.
**Host WAF** stays **inside Host Multi** (detect on Pro/Multi, protect on Multi) per H7 — not a separate IDR line. **R4** (accepted, not implemented) would move *protect* down to Pro.

---

## 5. Policy

| ID | Topic | Decision |
|----|--------|----------|
| **P1** | Overage | More units → **upgrade tier**. Not unlimited fair-use, not a credit pack. |
| **P2** | Annual | **LOCKED:** pay 10 months for 12 (~16,7% off). **Prepay only**; does not stack with other promos. |
| **P3** | Pilot | **1 month sponsored** for pilot #1 only (unchanged, A2). List price still recorded in CRM. |
| **P4** | Legacy credits | `users.credits` stays as history/ops; **not** a gate; **not** customer chrome (S4). |
| **P5** | AI Gateway | Separate `ai_wallets.balance_idr`. Never merged. |
| **P6** | Enterprise | **custom** — **LOCKED floor ≥ 5.000.000 / mo** (~2× Multi bundle) with annual commit. Do **not** finalize a public Enterprise price card before `/admin/hpp` holds real COGS. |
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

## 7. Owner decisions — resolved 2026-10-12

- [x] **Uptime** IDR → **75k / 200k / 500k**
- [x] **Guard** IDR → **100k / 250k / 600k**
- [x] **Enterprise** floor → **≥ 5jt + annual commit** (no public card until HPP has COGS)
- [x] **Annual** discount → **~16,7%, prepay only**
- [x] Uptime / Guard **seat caps** → **10/50/200** and **1/3/10**
- [x] **R1–R6** accepted as direction (R4/R5/R6 need a named slice + `buat`)

Remaining (ops, not a price decision): fill `/admin/hpp` rates so Enterprise/margin numbers are evidence-based.

---

## 8. Accepted directions (owner-approved 2026-10-12)

R1–R3 are **pricing/packaging policy** and are effective now. R4–R6 are **product decisions accepted** but **not yet implemented** — they need a named slice + `buat` before any spec or code change.

| ID | Direction | Why | Status |
|----|-----------|-----|--------|
| **R1** | **Guard = on-ramp.** Guard stays a separate attach line (does not alter Scan SKU rule D4), but is **included at no extra charge whenever Host Protect is active** — it is a hard prerequisite (H8). | You were **taxing your own prerequisite**: Host Basic 150k effectively cost 250k with Guard. This suppressed the highest-margin line (Host Protect). | **Effective now** (packaging) |
| **R2** | **Uptime = cheap wedge**, generous caps, not a monetization line. | Commodity; margin thin and churn-prone. Its job is to start the relationship. | **Effective now** (pricing) |
| **R3** | **Always show the à la carte ladder** next to the bundle. | The bundle only looks attractive against the 625k/1,45jt/4jt anchor. Hiding à la carte destroys the decoy. | **Effective now** (packaging) |
| **R4** | **Move WAF *protect* down to Pro** (or make WAF a separate add-on). | Protect is Multi-only (900k) — a 2-site customer who wants protection hits a hard cliff. | Accepted; needs named slice + `buat` |
| **R5** | **Basic = 1 editor + 1 viewer** (viewer seats near-zero COGS). | A 2-person IT team cannot share access on Basic → friction that drives churn. | Accepted; needs named slice + `buat` |
| **R6** | **SIEM Enterprise-only**, and out of the bundle until `SIEM_ENABLED` defaults on. | Never sell a flagged-off module as included. | Accepted; needs named slice + `buat` |

**R1 note:** “included with Host Protect” is a cross-line promotion, **not** bundling Guard into the Scan SKU (D4 still holds).

---

## 9. Risks / anti-patterns

- **Do not** headline credits again — metering v3 already dropped them (S7).
- **Do not** price per **user**; price per **protected unit**.
- **Do not** price Guard as a **tax on a prerequisite** (see R1) — that is the fastest way to kill Host Protect attach.
- **Do not** imply Guard = SIEM, or that the bundle includes full SIEM/SOC.
- **Do not** paste Host WAF onto the `sinexis.app` edge (customer nginx only).
- **Do not** silent-bundle any line into a VPS/colo SKU.
- **Do not** treat the **locked** numbers as re-openable without an owner decision — §7 is resolved 2026-10-12.
- **Do not** implement R4/R5/R6 (WAF tier, viewer seat, SIEM gating) without a named slice + `buat`.

**Benchmark used (context only, FX ≈ Rp16.000/USD):** Imunify360 ~$12–45/server (~192k–720k IDR); Intruder $99–204; Pentest-Tools $95–190 (5 assets); UptimeRobot $9–45; Pingdom $15 (10 monitors). Confirms the bundle band sits inside the “already paying for the box” wallet.

---

## 10. Links

- Scan SKU (A1 lock): [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md)
- Host Protect SKU (H4, now locked): [`sku-host-protect.md`](sku-host-protect.md)
- One-pager: [`sinexis-one-pager.md`](sinexis-one-pager.md)
- Metering v3 (seats): [`../specs/metering-v3-sku-seats.md`](../specs/metering-v3-sku-seats.md)
- Product context: [`../../.agents/product-marketing.md`](../../.agents/product-marketing.md)
