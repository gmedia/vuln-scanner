# Product marketing context — Sinexis

**Document version:** 1.0.0
**Last updated:** 2026-09-01
**Source of truth for product priority:** `docs/AGENT_EXECUTION_GUIDE.md` (wins over this file if they disagree).

## Changelog

- 2026-09-01 — V1 drafted from AGENT_EXECUTION_GUIDE + README (no customer PII).

## 1. Product overview

**One-liner:** Sinexis is security control for teams that already run servers with GMD: find exposure, schedule checks, share results, then runtime alerts — hospitality as the story, colo/VPS as the attach base.

**What it does:** Web vulnerability scanner (IP, domain, mobile APK/AAB/IPA) plus scheduled attach scans, multi-user workspaces, asset registry, thin Guard (Wazuh agent inventory + critical alerts — not full SIEM), Host Protect (on-box malware honesty), Host WAF (per-site, not edge nginx). Soft dual-brand: **Sinexis** public (`sinexis.app`) with **VulnScanner** as the Scan module.

**Category:** B2B security SaaS / managed-security attach on existing infrastructure billing.

**Type:** SaaS (credits + SKU add-ons) sold beside colo/VPS/cloud, not a colo replacement.

**Business model:** Recurring Secure/Scan add-on on customers who already pay colo / VPS / cloud / hosting. Credits for scans; Host Protect / Guard as attach SKUs. Working IDR lists live in private commercial docs — do not invent prices in public copy.

## 2. Target audience

**Company type:** Indonesian corporate colo/VPS book first (upsell). Hospitality / hotel groups as strategic beachhead and design-partner story — not mass hotel logos in current billing mix.

**Decision-makers:** Infra/ops owners at GMD customers; property IT for hotels; GMD account managers for attach.

**Primary use case:** “We already pay for the rack/VPS — add scheduled exposure checks and a thin runtime signal without a second security vendor circus.”

**Jobs to be done:**
1. Prove the box/site is being checked on a schedule (attach loop).
2. Share results with the team (workspace) without forwarding PDFs.
3. Later: know when the host is actually compromised (Guard / Host Protect) — honest, not mock WordPress hits.

## 3. Personas (B2B)

| Role | Cares about | Challenge | Promise |
|------|-------------|-----------|---------|
| User (ops) | Scan now, assets, Host Protect hits that are real | Fake findings destroy trust | Honest engines; pending helper, not invented malware |
| Champion (account / hotel IT) | One story for the property group | Security is a side SKU | Attach on infra they already buy |
| Decision maker | Recurring add-on, not a new platform RFP | Don’t replace colo revenue | Module beside MRR infra |
| Technical influencer | Wazuh already, don’t dual-enroll | Second daemon = ops cost | One wazuh-agent; helper add-on; no `sinexis-scan` enroll daemon |

## 4. Problems & pain points

- Security lines on invoices are thin (Imunify / SpamExpert style); customers don’t buy a second SIEM.
- Mock or WordPress-shaped hits on ERP paths destroy credibility.
- Full Wazuh dashboard / SOAR is out of v1 — oversell is a product bug.

## 5. Differentiation

- **Attach, don’t replace** colo/VPS.
- **Honesty gate:** missing roots fail or wait for helper; never invent `wp-content` malware.
- **Thin Guard:** inventory + critical alerts, not customer Wazuh UI.
- Soft dual-brand 6–12 months; rebrand must not gate Scan upsell.

## 6. Objections

- “Is this a SIEM?” — No. SIEM is a separate flagged module; Guard is thin.
- “Do I install two agents?” — No. One `wazuh-agent` per VM.
- “Will you WAF sinexis.app edge?” — Never paste WAF onto public edge nginx.

## 7. Proof / constraints for copy

- Do **not** put production SSH hosts, personal emails, passwords, API keys, or finance dumps in public pages or git.
- Speak Bahasa Indonesia with customers unless they switch; product UI follows i18n already shipped.
- Brand tokens: landing + SPA share `--primary` `hsl(142 71% 45%)`; BrandMark SINE + XIS + crosshair. No second editorial palette.

## 8. Voice

Direct, operator-grade, no flattery, no invented CVEs. Prefer “jadwal cek” / “temuan” over generic “AI-powered cybersecurity platform.”
