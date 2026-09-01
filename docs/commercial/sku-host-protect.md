# Host Protect — SKU (P12 working, **not** P0 lock)

**Status:** **Working commercial (2026-09-01)** — product **S0–S12 on `main`** (#556 honesty, #558 queue, #559 jail). Owner **has not** locked invoice `service_id`. AM may quote the **working list IDR** below; **must not** treat it as finance lock. Scan/Secure add-on remains the **only** P0-locked SKU ([`sku-scan-secure-addon.md`](sku-scan-secure-addon.md)).
**On-box:** S10 helper POST; S12 optional Clam if `clamscan`/`clamdscan` on PATH. Do not demo mock hits as disk proof. **P14** (Imunify-**class** jobs, regional GTM): [`imunify-class-onbox.md`](../specs/imunify-class-onbox.md) — worker must not impersonate customer FS.
**Product spec:** [`docs/specs/host-protect-v1.md`](../specs/host-protect-v1.md).
**Metering:** Host Protect scan **bundled (credit 0)** unless admin seeds `pricing.scan_type=hostscan` (≤10 chars). **HPP** key `hostscan` is COGS per completed `host_scans` row — seed **0** in git; fill in `/admin/hpp`. Do **not** mix HPP with Scan credit bundles.

---

## 0. Decision log (working)

| ID | Topic | Decision | Lock? |
|----|--------|----------|-------|
| **H1** | Offer name | Internal **Sinexis Host Protect**. Invoice (soft dual): **Host Protect Add-on – {Tier}** OK | Working |
| **H2** | Seat | **Web paths (sites)** on enrolled VPS, not per-domain DNS | Working |
| **H3** | Caps | Basic **1** · Pro **3** · Multi **10** `host_sites` | Working (mirrors Scan assets) |
| **H4** | List IDR / mo | **Working list** (not invoice lock): Host Basic **150.000** · Host Pro **350.000** · Host Multi **900.000** | Working |
| **H5** | vs Imunify | **Beside** on cPanel farms; **attach** on GMD VPS/colo without panel suite. Not a CloudLinux replacement pitch | Working |
| **H6** | Cleanup | Quarantine/restore in-app; reconstruct = **hybrid ticket**. No silent PHP rewrite | Working |
| **H7** | WAF | **Not** in Host Protect **file** v1. **P13 Host WAF** = separate control plane; working: **detect** on Pro/Multi, **protect** Multi+; IDR unset | Working |
| **H8** | Guard prerequisite | Host Protect v1 **requires** Guard agent on the VM | Working |
| **H9** | Finance `service_id` | New rows **after** IDR lock; **do not** silent-bundle into VPS or Scan | Open |
| **H10** | Public repo | No customer paths/SIDs/PII | Locked (hygiene) |

---

## 1. Tiers (engineering caps only)

| Tier | Who | Sites | Working list IDR / mo | Scan | Quarantine | WAF |
|------|-----|-------|----------------------|------|------------|-----|
| **Host Basic** | One VPS, one site | **1** | **150.000** | Scheduled + manual | Manual admin | No |
| **Host Pro** | Small corporate VPS | **≤3** | **350.000** | Daily default | Manual + optional auto for webshell/backdoor | No |
| **Host Multi** | Multi-site VPS / small farm | **≤10** | **900.000** | Daily | Same as Pro | **P13 detect** working; protect later |

**Out of SKU v1:** Imunify replacement, shared-host thousands of UIDs, KernelCare, PHP PD, email anti-spam product.

---

## 2. What AM may say (Bahasa, until IDR lock)

- “Ini **bukan** ganti Imunify di cPanel shared.”
- “Untuk VPS/colo GMD: agent Guard + daftar folder web. Scan **on-box** = helper POST ke SaaS (P14 slice C). Worker cloud **bukan** Imunify. Sampai helper jalan, konsol **bukan** bukti disk VPS.”
- “Working list (bukan invoice lock): Host Basic **Rp 150.000** · Host Pro **Rp 350.000** · Host Multi **Rp 900.000** / bulan. Finance boleh ± band sebelum `service_id`.”
- “Quarantine **bukan** reconstruct situs; restore CMS = tiket.”
- Positioning vs Imunify: [`imunify-beside-not-roadmap.md`](imunify-beside-not-roadmap.md) — **bukan** backlog fitur.

---

## 3. Still human

| Item | Owner | Done when |
|------|--------|-----------|
| Lock invoice IDR ± band | Product + finance | H4 marked **locked** like Scan SKU A1 |
| `service_id` Host Basic/Pro/Multi | Finance | Rows exist; not bundled into VPS |
| YARA extra rules (private) | Ops | Not committed if they contain customer samples |
| Pilot VM (not ERP stg) | Ops | Lab path only; no IPs in git |
