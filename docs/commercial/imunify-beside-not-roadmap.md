# Imunify360 — beside Sinexis, not a roadmap

**Status:** frozen positioning (2026-08-31). Not a feature backlog. Do **not** open PRs titled “Imunify parity.”

Sinexis **sits beside** Imunify on cPanel/CloudLinux farms. It is **not** a clone. Scan attach (P0/P1) remains the sold SKU. Host Protect / Host WAF are VPS/colo attach — **IDR unset**; AM must not invoice from this file.

## What we already cover (enough to talk)

| Job | Sinexis | Do not pitch as |
|-----|---------|-----------------|
| Outside-in vuln scan | IP/domain/mobile + schedules | Imunify malware |
| Runtime agent | Guard (Wazuh thin) | Full SIEM / Wazuh UI |
| On-box web malware | Host Protect: scan, hits, quarantine/restore | PHP Proactive Defense, auto-clean rewrite |
| HTTP filter | Host WAF **detect-only lab** (flag off in git) | Coraza on `sinexis.app`, full CRS, protect SKU |

## Explicitly not chasing (leave the idea)

- PHP Proactive Defense / KernelCare / CAPTCHA-WebShield
- cPanel/WHM plugin, shared-UID thousands of sites
- Email anti-spam / RBL product
- Imunify trademarks, commercial rulesets in git
- Host WAF **protect** as a sold line until owner names it
- Putting WAF on Sinexis public nginx

Cleanup: **quarantine ≠ reconstruct**. Reconstruct = hybrid ticket (backup/CMS), not in-app PHP rewrite.

## AM one-liners (Bahasa)

- “Ini **bukan** ganti Imunify di cPanel shared.”
- “Untuk VPS/colo GMD: Guard + folder web + scan malware + isolate file.”
- “WAF detect = lab; jangan jual block mode dari spek.”
- “Harga Host **belum** list resmi.”

See also: [`sku-host-protect.md`](sku-host-protect.md) H5/H6/H7, [`host-protect-v1.md`](../specs/host-protect-v1.md), [`host-waf-v1.md`](../specs/host-waf-v1.md).
