# Spec: VPS displace-lite vs Imunify360 (development plan)

**Status:** **docs** (2026-09-06). Owner asked AM to be able to say **“ganti Imunify dengan Sinexis di VPS/server”** — **only** on a **single nginx/Caddy VPS or dedicated**, **not** shared cPanel/CloudLinux farms.
**Epic:** **P14 follow-on plan** (jobs + original stack). Does **not** reopen P12 S1–S12 or P13 S0–S5.
**Legal:** [`imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md) still forbids clone PRs, trademarks, Imunify/CRS commercial DB in git, “Imunify compatible” in UI. This file is a **job + honesty** plan, not parity.
**Do not implement app code** until the user names a **slice** below **and** says `implement` / `buat` / `kerjakan`.

---

## 0) Locked pitch (AM)

**Allowed (VPS/dedicated, no panel suite):**

> Di **VPS/server ini** (bukan shared cPanel), Sinexis mengerjakan **file web on-box + isolate + filter HTTP tipis di nginx Anda + scan dari luar**. Bukan clone Imunify. **Tanpa** PHP Proactive Defense, KernelCare, WebShield, atau auto-clean database.

**Forbidden:** “ganti Imunify” on cPanel shared; “Imunify compatible”; tab WAF = full IM360/CRS; konsol = bukti disk sebelum helper POST.

**Still true on cPanel farms:** sit **beside**; sell Scan attach. Do not rip Imunify day one.

---

## 1) Honest threshold (when AM may use the sentence)

All of these, or the sentence is operationally false:

1. Helper installed from **sinexis.app**; last POST / heartbeat **obvious** on `/host`.
2. Real file hit on **that** VM’s jail → quarantine/restore without SSH (tc5 lab, not ERP).
3. Customer nginx **protect** with an **original** rule pack **wider than xmlrpc-only**, Host **Multi** SKU.
4. WAF tab has **no** Simulate `mock.sqli.1` in production UX (or clearly labeled lab-only).
5. Finance **`service_id`** for Host tiers (working IDR exists; invoice lock still **open** as of this write).
6. Spoken exclusions: **no PD, no WebShield, no MDS auto-clean DB, no kernel live-patch**.

Until then: *“file + HTTP tipis + scan luar; Imunify tetap lebih dalam di PHP runtime dan bot challenge.”*

---

## 2) Imunify jobs vs Sinexis (VPS nginx)

Sources: Imunify360 marketing (6 layers, PD, CloudAV, RapidScan, auto-cleanup, WebShield) and [docs.imunify360.com/features](https://docs.imunify360.com/features/) (MDS, crontab, Adminer detect, greylist/CAPTCHA, ModSec, PAM/Exim **cPanel**). Sinexis: P12/P13/`main` #640/#642.

| Imunify job | Sinexis today | Plan |
|-------------|-----------------|------|
| Agent owns web root | Guard `wazuh-agent` + `sinexis_host_scan` | **D0** heartbeat/install residual |
| File malware scan | YARA/needles + optional Clam; helper POST | Keep; no CloudLinux AV dump |
| Real-time / RapidScan / CloudAV | Timer + daily/hourly; **not** inotify | **Park** real-time; optional later **named** |
| Show hits + isolate | SPA `/host`; quarantine **mv** (auto **off**) | **D1** AM file-loop demo; **no** PHP rewrite |
| Auto cleanup / reconstruct / MDS | Hybrid ticket (H6) | **Out** v1 displace |
| HTTP WAF (full/minimized ModSec) | Starter **1001–1004** only | **D2** original pack widen; never IM360 IDs |
| Protect on by default | Per-site default **off**; protect **Multi** | Keep off until pack+CMS-admin risk understood |
| Proactive Defense (PHP runtime) | None | **Out** (slice **H** research) |
| WebShield / JS challenge / UAM / L7 | None | **Out**; Cloudflare in front is customer’s |
| Host firewall / IP lists / PAM brute | Not Guard | **Out**; OS firewall separate |
| Email brute (Exim/Dovecot) | cPanel-oriented upstream | **Out** for nginx VPS |
| KernelCare / Imunify Patch / Email SKU | None | **Out** |
| cPanel plugin / shared UID | None | **Out** (slice **G**) |
| Outside-in vuln scan + workspace | **Shipped** Scan SKU | **Keep as wedge** — Imunify is weak here |
| Crontab malware / Adminer-zero | None | **Park** (file-plane nice-to-have) |
| Invoice SKU | Host working IDR; `service_id` open | **Human** finance — not a code PR |

WAF IDs (`host_waf_render.py`): **1001** `/xmlrpc.php`; **1002** ARGS `union select` / `or 1=1`; **1003** URI `../`; **1004** lab `/sinexis-waf-lab`. Product GET/ingest = those IDs (**#640**). Simulate still inserts **`mock.sqli.1`**.

---

## 3) Development slices (one PR stream each)

Implement **only** when named + `buat`. Do **not** mix with Workspace/SIEM/Guard Discover. Lab: **tc5**; **never wipe `sx-erpstg`**. Never paste WAF onto `sinexis.app` edge.

### D0 — Ops honesty (default next)

| In | Out |
|----|-----|
| Heartbeat / last helper POST copy on `/host` if still unclear | New YARA pack |
| wget installer on **already-installed** VMs (AM/ops; not a product clone) | Wipe ERP |
| Hide or lab-gate SPA **Simulate** `mock.sqli.1` | Mock hits on public origin |

**DoD:** AM on tc5: enroll → installer → pending then **real** ingest; WAF tab without unlabeled mock rows.

### D1 — File loop a layperson finishes

| In | Out |
|----|-----|
| Demo script scan → hit → isolate → restore (tc5) | Reconstruct PHP / MDS |
| Empty ≠ clean copy already #596 — keep | 24×7 YARA on `/` |

**DoD:** Non-engineer AM completes loop without SSH. Quarantine ≠ “situs sudah bersih.”

### D2 — Original HTTP pack (wave 2+)

| In | Out |
|----|-----|
| Widen **original** starter (e.g. obvious login brute, extra RCE/SQLi **we wrote**) | CRS paid / Imunify rules in git |
| Protect remains Host **Multi**; snippet customer nginx | Sinexis edge Coraza |
| Events still starter-allowlist (extend the allowlist with **our** IDs) | Ingest IM360/CRS noise |

**DoD:** Protect lab vhost on **tc5** blocks a **named** original rule; CMS-admin false-positive documented.

### D3 — Notify (optional)

Malware-detected / WAF-block email using **existing** notify patterns — not Imunify Email.

### Parked (not this plan)

**G** panel plugin · **H** PHP PD · WebShield · KernelCare · CloudAV clone · crontab/Adminer-zero unless owner names.

---

## 4) SKU / commercial (working, not finance lock)

- Quote **Host Basic** for file-only wave 0; **Host Multi** if WAF protect is in the pitch.
- Working list: [`sku-host-protect.md`](../commercial/sku-host-protect.md) H4. **Do not** invent invoice IDR here.
- H5 stays: beside on cPanel; **displace-lite** only on GMD VPS/colo **without** panel suite, after §1 threshold.
- Scan attach remains **P0** sold SKU. Do not silent-bundle Host into VPS or Scan.

---

## 5) Success

Regional AM demos **one** nginx VPS: Guard + helper + real file isolate + (Multi) WAF protect with **our** rules + Scan schedule — and **says the exclusions in §0**. Buyer who **requires** PD or KernelCare is **not** a displace deal.

---

## 6) Agent notes

- English spec; Bahasa with user.
- `GIT_MASTER=1`; branch `feat/` or `docs/` from `main`.
- No IPs, tokens, customer paths in git.
- Playwright ≠ enroll. Clone PRs forbidden.
- Cross-links: [`imunify-class-onbox.md`](imunify-class-onbox.md) §7 waves · [`host-protect-v1.md`](host-protect-v1.md) · [`host-waf-v1.md`](host-waf-v1.md)
