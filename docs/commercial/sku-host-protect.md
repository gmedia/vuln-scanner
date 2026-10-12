# Host Protect — SKU (P12; **H4 locked 2026-10-12**)

**Status:** **H4 list IDR locked (2026-10-12)** — product **S0–S12 on `main`** (#556 honesty, #558 queue, #559 jail). Owner **locked** Host list IDR (**H4**) on 2026-10-12: Basic **150.000** · Pro **350.000** · Multi **900.000** / mo (finance may ± band before first invoice). In-app Host `invoicable` (**H9**) is **shipped**. That is **not** Invoice-ok C1 — Invoice-ok = Sinexis in-app (**I1/D5**), **not** GMD Host `service_id`. Bundle composition: [`pricing-architecture-v1.md`](pricing-architecture-v1.md). Scan/Secure add-on **A1** remains P0-locked ([`sku-scan-secure-addon.md`](sku-scan-secure-addon.md)).
**On-box:** S10 helper POST; S12 optional Clam if `clamscan`/`clamdscan` on PATH. Do not demo mock hits as disk proof. **P14** (Imunify-**class** jobs, regional GTM, **waves 0–3**): [`imunify-class-onbox.md`](../specs/imunify-class-onbox.md) — worker must not impersonate customer FS. H4 locked; quote **Host Basic (1 site)** for wave 0 demos.
**Product spec:** [`docs/specs/host-protect-v1.md`](../specs/host-protect-v1.md).
**Metering:** Host Protect scan **bundled (credit 0)** — seats are `host_sites`, not Scan credits ([`metering-v2.md`](../specs/metering-v2.md)). **HPP** key `hostscan` is COGS per completed `host_scans` row; `/admin/hpp` line-margin **host** uses H4 list (locked 2026-10-12) × orgs with a site. Seed **0** in git. Do **not** mix HPP with Scan credit packs.

---

## 0. Decision log (working)

| ID | Topic | Decision | Lock? |
|----|--------|----------|-------|
| **H1** | Offer name | Internal **Sinexis Host Protect**. Invoice (soft dual): **Host Protect Add-on – {Tier}** OK | Working |
| **H2** | Seat | **Web paths (sites)** on enrolled VPS, not per-domain DNS | Working |
| **H3** | Caps | Basic **1** · Pro **3** · Multi **10** `host_sites` | Working (mirrors Scan assets) |
| **H4** | List IDR / mo | Host Basic **150.000** · Host Pro **350.000** · Host Multi **900.000** | **Locked 2026-10-12** |
| **H5** | vs Imunify | **Beside** on cPanel farms. **Displace-lite** on GMD VPS/colo **without** panel suite after [`vps-displace-imunify-dev-plan.md`](../specs/vps-displace-imunify-dev-plan.md) **Sentence-ok GREEN** 2026-09-21 (closure §7; nginx dedicated / no panel). Pack **1005/1006** + Simulate lab-gate **shipped**; Demo-ok `tc5` **proven**; Invoice-ok = **Sinexis in-app** (I1/D5), **not** GMD `service_id`. Short “ganti” **allowed** nginx-only; **forbidden** shared cPanel. **No** PD/WebShield/KernelCare. Not a CloudLinux replacement pitch | Working |
| **H6** | Cleanup | Quarantine/restore in-app; reconstruct = **hybrid ticket**. No silent PHP rewrite | Working |
| **H7** | WAF | **Not** in Host Protect **file** v1. **P13 Host WAF** = separate control plane; working: **detect** on Pro/Multi, **protect** Multi+; IDR unset. **Pricing v1.2 R4 (accepted, not implemented):** move **protect** down to Pro — needs a named slice + `buat`. | Working |
| **H8** | Guard prerequisite | Host Protect v1 **requires** Guard agent on the VM. **Pricing (v1.2 R1):** Guard is **included at no extra charge when Host Protect is active** — do not quote Host + Guard as two lines. | Working |
| **H9** | In-app Host `invoicable` | Host catalog `invoicable=true`. Admin creates Host invoices in-app; paid Host does **not** set Scan `org.sku`; unique period per product. **Struck:** Invoice-ok is **not** GMD Host `service_id` (same leftover pattern as Scan **D5** — optional, **not** agent next-step). Do **not** silent-bundle into VPS or Scan. H4 list IDR **locked 2026-10-12**. | **Shipped** |
| **H10** | Public repo | No customer paths/SIDs/PII | Locked (hygiene) |

---

## 1. Tiers (engineering caps only)

| Tier | Who | Sites | List IDR / mo (H4 locked) | Scan | Quarantine | WAF |
|------|-----|-------|----------------------|------|------------|-----|
| **Host Basic** | One VPS, one site | **1** | **150.000** | Scheduled + manual | Manual admin | No |
| **Host Pro** | Small corporate VPS | **≤3** | **350.000** | Daily default | Manual + optional auto for webshell/backdoor | No |
| **Host Multi** | Multi-site VPS / small farm | **≤10** | **900.000** | Daily | Same as Pro | **P13 detect** + **P14 F protect** (customer nginx snippet; not Sinexis edge) |

**Out of SKU v1:** **Full** Imunify360 / CloudLinux replacement (cPanel shared, PD, KernelCare, email, thousands of UIDs). **Displace-lite** on a **single nginx VPS** is **not** this line — see H5 + [`vps-displace-imunify-dev-plan.md`](../specs/vps-displace-imunify-dev-plan.md).

---

## 2. What AM may say (Bahasa, until IDR lock)

- “Ini **bukan** ganti Imunify di cPanel shared.”
- “Kalimat pendek ‘ganti Imunify…’ **boleh** di **nginx dedicated / no panel** (Sentence-ok **GREEN** 2026-09-21). **Tetap dilarang** di cPanel shared. Pitch panjang §0 tetap dipakai jika buyer butuh kedalaman.”
- “Ganti di **VPS tanpa panel**: **Sentence-ok tertutup** (Demo-ok + Invoice-ok Sinexis in-app + pack 1005+ shipped + ModSec live + owner date 2026-09-21); tanpa PD/kernel/email. **Jangan** tunggu `service_id` GMD. H9 `invoicable` **sudah** — tagih Host di Sinexis. Residual agent = Guide §1.3.1 **Inbox S2**. Print S2 **shipped**.”
- “Untuk VPS/colo GMD: agent Guard + daftar folder web. Scan **on-box** = helper POST ke SaaS (P14 slice C). Worker cloud **bukan** Imunify. Sampai helper jalan, konsol **bukan** bukti disk VPS.”
- “H4 locked 2026-10-12 (H9 invoicable **sudah**): Host Basic **Rp 150.000** · Host Pro **Rp 350.000** · Host Multi **Rp 900.000** / bulan. Tagih di **Sinexis** (`/admin/invoices`). Invoice-ok = in-app, **bukan** `service_id` GMD. Finance boleh ± band sebelum invoice pertama. GMD `service_id` **opsional**, bukan gerbang, **bukan** langkah agent.”
- “Quarantine **bukan** reconstruct situs; restore CMS = tiket.”
- Positioning vs Imunify: [`imunify-beside-not-roadmap.md`](imunify-beside-not-roadmap.md) — **bukan** backlog fitur. Development slices: [`vps-displace-imunify-dev-plan.md`](../specs/vps-displace-imunify-dev-plan.md).

---

## 3. Still human

| Item | Owner | Done when |
|------|--------|-----------|
| Lock invoice IDR ± band | Product + finance | **Done — H4 locked 2026-10-12** (like Scan SKU A1) |
| Optional GMD Host `service_id` (leftover, **not** Invoice-ok) | Finance | Only if ops still wants ERP rows; **not** agent next; no SIDs in git |
| YARA extra rules (private) | Ops | Not committed if they contain customer samples |
| Pilot VM (not ERP stg) | Ops | Lab path only; no IPs in git |
