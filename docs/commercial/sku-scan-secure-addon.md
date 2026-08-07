# Scan / Secure Add-on — SKU sketch (P0)

**Status:** commercial draft. **All IDR figures are placeholders** — replace before any customer quote.
**Metering today:** per-scan **credits** (`PricingConfig` by `scan_type`: ip / domain / mobile). Attach SKU should **map cleanly** to credit bundles + schedule entitlements, not invent a second opaque currency on day one.

---

## 1. Offer name

| Internal | Customer-facing (soft dual-brand) |
|----------|-----------------------------------|
| Scan Attach / Secure Add-on | **Sinexis Scan** (or “Secure Scan Add-on” on existing GMD invoice line) |

Bundle with colo/VPS as **add-on line item**; do not reprice rack.

---

## 2. Tiers (v1 sketch)

| Tier | Who | Included targets (entitlement) | Cadence | Report | Credits (sketch) | List price sketch (IDR / mo) |
|------|-----|--------------------------------|---------|--------|------------------|------------------------------|
| **Basic** | Single VPS or one public IP/domain | **1** domain **or** **1** IP | Monthly | Email/in-app summary of **new** critical/high + link to job | Bundle ≈ **4–8** domain/IP scan-credits / mo (enough for schedule + 1 manual) | *TBD* e.g. 150–300k |
| **Pro** | Small corporate / busy VPS | **Up to 3** targets (mix domain/IP) | Weekly **or** monthly (choose at signup) | + **baseline diff** (new / resolved / worsened) + executive HTML | Bundle ≈ **12–24** credits / mo | *TBD* e.g. 400–750k |
| **Multi-asset** | Multi-service / hotel group / multi-IP colo | **Up to 10** targets (P3 registry when live; until then labeled list) | Weekly | + pack “scan all” + executive export; hybrid review optional | Bundle ≈ **40–80** credits / mo | *TBD* e.g. 1.2–2.5M |

**Out of tier v1:** full SIEM, Windows depth, org wallet, unlimited targets, 24/7 SOC.

**Mobile scans:** available à la carte on credits; **not** required for attach SKU fulfillment.

---

## 3. What “included” means technically (P1+)

| Capability | Basic | Pro | Multi-asset |
|------------|-------|-----|-------------|
| Scheduled scan (domain/IP) | Yes | Yes | Yes |
| Notify on **new** critical/high vs prior run | Yes (simple) | Yes | Yes |
| Baseline diff detail | Summary only | Full diff | Full diff |
| Executive HTML/PDF | One-pager | Full | Full + multi-target pack |
| Named asset registry | Manual labels OK | Light | **P3** productized |
| Workspace multi-user | No (P2) | No (P2) | Preferred after P2 |
| Guard / Wazuh | No | No | Optional **separate** SKU later (P5) |

Until P1 ships, sales may sell **hybrid**: human-run monthly scan + report using existing product (document as pilot SLA, not automated entitlement).

---

## 4. Credit policy (align with engineering)

**Principles:**

1. Scheduled runs **debit** the same credit costs as manual scans unless a future “attach flat” flag is approved.
2. Failed infrastructure (worker down) → **no** charge or auto-retry once (spec P1).
3. Bundle top-up monthly on invoice date (billing system may stay outside app v1 — track entitlement in CRM until in-app subscription exists).
4. Overage: customer buys credit top-up (existing admin/credit flows) or upgrade tier.

**Current code hooks:** `PricingConfig.credit_cost` per `scan_type`; `User.credits`; `CreditLog`. No subscription table yet — P1 schedule can still debit personal credits.

---

## 5. Upsell target *patterns* (no PII in git)

Use these patterns in CRM filters; **do not** paste customer_id / domains into commits.

| Pattern | Why it fits | Suggested open |
|---------|-------------|----------------|
| **VPS + public domain / cPanel-style** | Clear domain surface; easy monthly story | Basic or Pro |
| **Colo / dedicated public IP** | Port/service exposure; IP scan hero | Basic (1 IP) → Pro |
| **Multi-service account** (≥3 service lines: VPS + domain + colo …) | Design-partner; Workspace later | Multi-asset pilot |
| **Already pays “firewall” / security line** | Proven security wallet | Pro + future Guard |
| **CORPORATE kategori, top revenue share** | Attach ARPU matters | Pro outreach first |
| **HOTEL multi-property (relationship)** | Beachhead A; weak in mass billing | Pilot pack (P6) + Multi-asset |

**Anti-patterns for first wave:** pure offline-only services; customers with no public IP/domain; selling Guard before Scan attach is believable.

---

## 6. Pilot definition (one success story)

**Done when:**

- [ ] One account (design-partner multi-service **or** relationship hotel) on paid or sponsored attach for ≥1 month
- [ ] At least one **scheduled or hybrid** cycle delivered with **diff or executive summary**
- [ ] Written feedback: would they renew / expand targets?
- [ ] No production secrets or customer PII landed in public git

---

## 7. Packaging on GMD invoice (ops)

| Approach | Note |
|----------|------|
| New service_id “Sinexis Scan – Basic/Pro/…” | Cleanest for finance reporting |
| Manual line on existing SID | Faster pilots; harder attach analytics |
| Bundle into VPS SKU silently | **Avoid** — hides attach ARPU |

---

## 8. Open commercial decisions

- [ ] Lock IDR list + discount policy for AM
- [ ] Who owns renewals (AM vs product)
- [ ] Credit bundle exact numbers vs “unlimited scheduled within fair use”
- [ ] Bahasa-only vs BI/EN executive report v1

---

## 9. Links

- One-pager: [`sinexis-one-pager.md`](sinexis-one-pager.md)
- Engineering: [`../specs/scan-attach-v1.md`](../specs/scan-attach-v1.md)
- Priority: [`../AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §1.3
