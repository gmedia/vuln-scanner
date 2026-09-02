# Imunify360 — beside Sinexis, not a roadmap

**Status:** frozen **legal/clone** positioning (2026-08-31). **Job roadmap** (on-box access, regional attach) lives in [`imunify-class-onbox.md`](../specs/imunify-class-onbox.md) (**P14**). Do **not** open PRs titled “Imunify parity” or copy CloudLinux IP. P14 is **jobs + original stack**, not a clone.

Sinexis **sits beside** Imunify on cPanel/CloudLinux farms. It is **not** a clone. Scan attach (P0/P1) remains the sold SKU. Host Protect / Host WAF are VPS/colo attach — **IDR unset**; AM must not invoice from this file.

## What we already cover (enough to talk)

| Job | Sinexis | Do not pitch as |
|-----|---------|-----------------|
| Outside-in vuln scan | IP/domain/mobile + schedules | Imunify malware |
| Runtime agent | Guard (Wazuh thin) | Full SIEM / Wazuh UI |
| On-box web malware | Host Protect: scan, hits, quarantine/restore | PHP Proactive Defense, auto-clean rewrite |
| HTTP filter | Host WAF detect + **protect** (Host Multi; customer nginx) | Coraza on `sinexis.app`, full CRS paid packs |

## Explicitly not chasing (leave the idea)

- PHP Proactive Defense / KernelCare / CAPTCHA-WebShield
- cPanel/WHM plugin, shared-UID thousands of sites
- Email anti-spam / RBL product
- Imunify trademarks, commercial rulesets in git
- Host WAF **protect** on Basic/Pro (Multi only); never Sinexis edge
- Putting WAF on Sinexis public nginx

Cleanup: **quarantine ≠ reconstruct**. Reconstruct = hybrid ticket (backup/CMS), not in-app PHP rewrite.

## AM one-liners (Bahasa)

- “Ini **bukan** ganti Imunify di cPanel shared.”
- “Untuk VPS/colo GMD: Guard + folder web + scan malware **on-box** (helper) + isolate file. Konsol SaaS **bukan** bukti disk sampai helper POST.”
- “WAF protect = Host Multi, snippet di nginx **pelanggan**; bukan edge Sinexis.”
- “Harga Host **belum** list resmi.”

See also: [`sku-host-protect.md`](sku-host-protect.md) H5/H6/H7, [`host-protect-v1.md`](../specs/host-protect-v1.md), [`host-waf-v1.md`](../specs/host-waf-v1.md).
