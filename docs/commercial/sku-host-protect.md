# Host Protect — SKU (P12 working, **not** P0 lock)

**Status:** **Working commercial (2026-08-31)** — product **S0–S6 shipped**; **S7–S12** honest on-box **spek only**. Owner **has not** locked list IDR. AM **must not** treat this as invoice truth. Scan/Secure add-on remains the **only** P0-locked SKU ([`sku-scan-secure-addon.md`](sku-scan-secure-addon.md)).
**Do not demo mock hits as on-box detection.** Until S10 lab on a Guard VM, AM must not claim “scan di VPS pelanggan.”
**Product spec:** [`docs/specs/host-protect-v1.md`](../specs/host-protect-v1.md).
**Metering:** on-box malware scan **bundled (credit cost 0)** unless owner later seeds admin pricing key **`hostscan`** (≤10 chars). **Do not** mix with HPP / Scan credit bundles.

---

## 0. Decision log (working)

| ID | Topic | Decision | Lock? |
|----|--------|----------|-------|
| **H1** | Offer name | Internal **Sinexis Host Protect**. Invoice (soft dual): **Host Protect Add-on – {Tier}** OK | Working |
| **H2** | Seat | **Web paths (sites)** on enrolled VPS, not per-domain DNS | Working |
| **H3** | Caps | Basic **1** · Pro **3** · Multi **10** `host_sites` | Working (mirrors Scan assets) |
| **H4** | List IDR / mo | **Unset** — owner lock required | **Open** |
| **H5** | vs Imunify | **Beside** on cPanel farms; **attach** on GMD VPS/colo without panel suite. Not a CloudLinux replacement pitch | Working |
| **H6** | Cleanup | Quarantine/restore in-app; reconstruct = **hybrid ticket**. No silent PHP rewrite | Working |
| **H7** | WAF | **Not** in Host Protect **file** v1. **P13 Host WAF** = separate control plane; working: **detect** on Pro/Multi, **protect** Multi+; IDR unset | Working |
| **H8** | Guard prerequisite | Host Protect v1 **requires** Guard agent on the VM | Working |
| **H9** | Finance `service_id` | New rows **after** IDR lock; **do not** silent-bundle into VPS or Scan | Open |
| **H10** | Public repo | No customer paths/SIDs/PII | Locked (hygiene) |

---

## 1. Tiers (engineering caps only)

| Tier | Who | Sites (paths) | Scan | Quarantine | WAF |
|------|-----|---------------|------|------------|-----|
| **Host Basic** | One VPS, one site | **1** | Scheduled + manual | Manual admin | No |
| **Host Pro** | Small corporate VPS | **≤3** | Daily default | Manual + optional auto for webshell/backdoor | No |
| **Host Multi** | Multi-site VPS / small farm | **≤10** | Daily | Same as Pro | **P13 detect** working; protect later |

**Out of SKU v1:** Imunify replacement, shared-host thousands of UIDs, KernelCare, PHP PD, email anti-spam product.

---

## 2. What AM may say (Bahasa, until IDR lock)

- “Ini **bukan** ganti Imunify di cPanel shared.”
- “Untuk VPS/colo GMD: agent Guard + daftar folder web. Scan **on-box** = S10 (helper POST ke SaaS); sampai itu, konsol **bukan** bukti disk VPS.”
- “Harga add-on **belum** list resmi; jangan quote angka dari file ini.”
- “Quarantine **bukan** reconstruct situs; restore CMS = tiket.”
- Positioning vs Imunify: [`imunify-beside-not-roadmap.md`](imunify-beside-not-roadmap.md) — **bukan** backlog fitur.

---

## 3. Still human

| Item | Owner | Done when |
|------|--------|-----------|
| Lock list IDR ± band | Product + finance | This file updated **locked** like Scan SKU A1 |
| `service_id` Host Basic/Pro/Multi | Finance | Rows exist; not bundled into VPS |
| YARA extra rules (private) | Ops | Not committed if they contain customer samples |
| Pilot VM (not ERP stg) | Ops | Lab path only; no IPs in git |
