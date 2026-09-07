# Spec: VPS displace-lite vs Imunify360 (development plan)

**Status:** **docs** (2026-09-07). **DL0 shipped** (`main` #647). **DL1** runbook shipped (`main` #649). **DL2** pack 1005/1006 shipped (`main` #651). Owner **intent:** AM able to say **“ganti Imunify dengan Sinexis di VPS/server”** — **only** on a **single nginx VPS or dedicated**, **not** shared cPanel/CloudLinux farms. That short fragment is **internal intent**, **forbidden in customer meetings** until **Sentence-ok** (§1).
**Epic:** **P14 follow-on honesty plan** (jobs + original stack). Does **not** reopen P12 S1–S12 or P13 S0–S5.
**Legal:** [`imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md) still forbids clone PRs, trademarks, Imunify/CRS commercial DB in git, “Imunify compatible” in UI. This file is a **job + speech gate**, not parity.
**HTTP stack:** **nginx + ModSecurity (or Coraza spoa) on the customer/lab vhost.** **Caddy = out** until a **named** slice. Do not say “nginx/Caddy” in AM copy.
**Do not implement app code** until the user names **DL0 / DL1 / DL2** below **and** says `implement` / `buat` / `kerjakan`.

**Map (avoid colliding with P14 A–H):**

| Displace-lite | P14 | Meaning |
|---------------|-----|---------|
| **DL0** | residual **C** / Wave 0 | Simulate/lab-gate; do **not** rebuild installer/heartbeat |
| **DL1** | Wave 1 runbook; P14 **D** (disk quarantine) **already shipped** | AM script, not a new queue |
| **DL2** | follow-on to **F** (protect shipped) | Original pack **widen** — **1005/1006 shipped** (`main` #651) |
| **DL3** | — | Notify live ingest; **shipped** (`main` #659) |

P14 **D** = on-box quarantine (**S11**). Displace **DL1** is **not** a second D.

---

## 0) Locked pitch (AM)

**Allowed spoken line (VPS/dedicated, no panel suite) — the only customer sentence until Sentence-ok:**

> Di **VPS/server ini** (bukan shared cPanel), Sinexis mengerjakan **file web on-box + isolate + filter HTTP tipis di nginx Anda + scan dari luar**. Bukan clone Imunify. **Tanpa** PHP Proactive Defense, KernelCare, WebShield, atau auto-clean database.

**Forbidden until Sentence-ok:** the short fragment “ganti Imunify dengan Sinexis…” (any language). Also forbidden always: “ganti Imunify” on cPanel shared; “Imunify compatible”; tab WAF = full IM360/CRS; konsol = bukti disk sebelum helper POST; Caddy as if supported.

**Still true on cPanel farms:** sit **beside**; sell Scan attach. Do not rip Imunify day one.

---

## 1) Honest thresholds (do not OR)

Three independent gates. Engineering is **not** blocked on finance. AM **must not** invoice a replacement until Invoice-ok. The short “ganti” line needs **Sentence-ok**.

### Demo-ok (product honesty on **tc5**, not ERP)

All of:

1. Helper installed from **sinexis.app**; last POST visible (`helperPolled` / not stale) on `/host`.
2. Real file hit on **that** VM’s jail → quarantine/restore **from the SPA** (SSH allowed for **install only**).
3. WAF **live** demo only if **ModSec/Coraza is loaded** on the lab vhost **and** a **live** (not Simulate) event for a starter id (1001–1006). Console snippet copy ≠ filter. GET `/wp-admin/` must stay **200** (not in pack).
4. Spoken exclusions: **no PD, no WebShield, no MDS auto-clean DB, no kernel live-patch**.

Until Demo-ok: do not demo Host as “on-box proof.”

### Invoice-ok (human / finance — not a code PR)

- `service_id` rows for Host Basic/Pro/Multi exist; not bundled into VPS or Scan.
- Working IDR already in [`sku-host-protect.md`](../commercial/sku-host-protect.md) H4; lock is **open** as of this write.

### Sentence-ok (short “ganti” line)

**Demo-ok + Invoice-ok** and:

1. Original pack has **new numeric IDs beyond 1001–1004** (`1005` wp-login POST+payload, `1006` URI eval/base64), allowlisted, lab probe documented, CMS-admin FP written (**DL2** — pack in git; live 403 still needs ModSec on vhost).
2. Simulate hidden **or** rows labeled `preview` / `lab`; no unlabeled `mock.sqli.1` in customer UX (**DL0 shipped** #647: lab-gate Simulate; starter `msg:` 1001–1003 original labels). Live ingest **1001–1011**.
3. Demo vhost actually has ModSec loaded (ops checkbox).

Until Sentence-ok use the fallback: *“file + HTTP tipis + scan luar; Imunify tetap lebih dalam di PHP runtime dan bot challenge.”*

**Struck:** “wider than xmlrpc-only” as the WAF bar — **1001–1004 already shipped**. That bar was already green and would let AM claim the sentence too early.

---

## 2) Imunify jobs vs Sinexis (VPS nginx)

Sources: Imunify360 marketing (6 layers, PD, CloudAV, RapidScan, auto-cleanup, WebShield) and [docs.imunify360.com/features](https://docs.imunify360.com/features/) (MDS, crontab, Adminer detect, greylist/CAPTCHA, ModSec, PAM/Exim **cPanel**). Sinexis: P12/P13/`main` #640/#642.

| Imunify job | Sinexis today | Plan |
|-------------|-----------------|------|
| Agent owns web root | Guard `wazuh-agent` + `sinexis_host_scan` | Keep; **DL0** does **not** rebuild installer |
| File malware scan | YARA/needles + optional Clam; helper POST | Keep; no CloudLinux AV dump |
| Real-time / RapidScan / CloudAV | Timer + daily/hourly; **not** inotify | **Park** |
| Show hits + isolate | SPA `/host`; quarantine **mv** (auto **off**) | **DL1** runbook; **no** new queue (P14 **D** shipped) |
| Auto cleanup / reconstruct / MDS | Hybrid ticket (H6) | **Out** |
| HTTP WAF | Starter **1001–1011** | Further original IDs only; never IM360/CRS |
| Protect on by default | **F shipped**; per-site default **off**; protect **Multi** | Keep off; do not re-do F |
| ModSec module on typical nginx | Snippet copy only; Ubuntu often has **no** module | **Ops/hybrid** — Demo-ok checkbox, not SaaS |
| Proactive Defense | None | **Out** (slice **H**) |
| WebShield / JS / UAM / L7 | None | **Out**; Cloudflare is customer’s |
| Host firewall / PAM brute | Not Guard | **Out** |
| Email brute (Exim/Dovecot) | cPanel-oriented | **Out** for nginx VPS |
| KernelCare / Email SKU | None | **Out** |
| cPanel plugin / shared UID | None | **Out** (**G**) |
| Outside-in scan + workspace | **Shipped** Scan SKU | **Keep as wedge** |
| Crontab / Adminer-zero | None | **Park** |
| Invoice SKU | Working IDR; `service_id` open | **Invoice-ok** — human |

WAF IDs (`host_waf_render.py`): **1001** `/xmlrpc.php` (`sinexis.xmlrpc`); **1002** ARGS `union select` / `or 1=1` (`sinexis.sqli`); **1003** URI `../` (`sinexis.path.traversal`); **1004** lab `/sinexis-waf-lab`; **1005** POST `/wp-login.php` chained with payload ARGS; **1006** URI `eval(` / `base64_decode(`; **1007** `/wp-cron.php`; **1008** URI `php://` / `data://`. Product GET/ingest = those IDs. SPA Simulate is **lab-only** and is **not** listed on the live table (#647). **Not matched:** GET `/wp-admin/`.

---

## 3) Development slices (one PR stream each)

Implement **only** when named **DL0/DL1/DL2** + `buat`. Do **not** mix with Workspace/SIEM/Guard Discover. Lab: **tc5**; **never wipe `sx-erpstg`**. Never paste WAF onto `sinexis.app` edge.

### DL0 — Simulate / mock hygiene (**shipped** #647)

| In | Out |
|----|-----|
| Lab-gate Simulate: `mock.sqli.1` not in unlabeled prod table (`HostWafPanel.tsx`, `host_waf.py`) | New YARA pack |
| Rename starter `msg:` `mock.*` on **1001–1003** to original labels | Rebuild installer / heartbeat widgets (already on `/host`) |
| | Wipe ERP; mock hits on public origin |

**DoD:** pytest — Simulate events excluded from “live” list **or** flagged `source=simulate`; ingest still allowlists 1001–1004. Vitest — lab/preview badge **or** Simulate absent in prod UX flag.

### DL1 — File-loop runbook (not a product PR)

Canonical: [`dl1-file-loop-runbook.md`](dl1-file-loop-runbook.md) + [`host-protect-helper-am.md`](../host-protect-helper-am.md) §4.1.

| In | Out |
|----|-----|
| Checked AM script: enroll → helper → needle → isolate → restore on **pre-installed** tc5 | Reconstruct PHP / MDS; new quarantine queue (P14 **D** shipped) |
| Keep empty ≠ clean (#596) | “No SSH ever”; 24×7 YARA on `/` |

**DoD:** Non-engineer finishes **SPA** loop after helper is live. Quarantine path under `/var/lib/sinexis/quarantine` then restore. Copy: quarantine ≠ clean site. SSH for install is expected.

### DL2 — Original HTTP pack widen (**shipped** #651)

| In | Out |
|----|-----|
| **1005** POST `/wp-login.php` + payload ARGS (chain); **1006** URI `eval(` / `base64_decode(`; `_WAF_STARTER_IDS` + dual installer | CRS paid / Imunify rules in git; re-doing F |
| Protect remains Host **Multi**; snippet customer nginx | Sinexis edge Coraza; Caddy adapter |
| CMS-admin FP: snippet has **no** `wp-admin` match (GET `/wp-admin/` stays 200 when ModSec is loaded) | Ingest IM360/CRS noise |

**DoD:** pytest/installer assert `id:1005`/`1006` and `wp-admin` absent. `host-waf-lab-smoke.sh` documents + asserts the same. Live curl 403 on tc5 remains **ops** (ModSec on vhost): POST `/wp-login.php`+payload, URI eval/base64; GET `/wp-admin/` stays 200.

### DL3 — Notify (unparked)

Malware-detected email skips `engine=mock`. WAF-block email fires only on helper ingest (`notify_live_waf_block`), never Simulate. Uses existing SMTP + `host_notify` locales — not Imunify Email.

### Parked (not this plan)

**G** panel plugin · **H** PHP PD · WebShield · KernelCare · CloudAV clone · crontab/Adminer-zero · **Caddy** unless owner names.

---

## 4) SKU / commercial (working, not finance lock)

- **Do not quote Basic and demo Protect.** File-only demo = **Host Basic**. If the meeting uses a WAF/protect sentence, org is **Host Multi before** the meeting.
- Working list: [`sku-host-protect.md`](../commercial/sku-host-protect.md) H4. **Do not** invent invoice IDR here.
- H5 stays: beside on cPanel; **displace-lite** only on GMD VPS/colo **without** panel suite, after **Sentence-ok**.
- Scan attach remains **P0** sold SKU. Do not silent-bundle Host into VPS or Scan.

---

## 5) Success

Regional AM demos **one** nginx VPS: Guard + helper + real file isolate + (Multi) WAF protect with **our** rules + Scan schedule — and uses **only** the §0 long pitch. Short “ganti” line only if **Sentence-ok** is checked on a dated AM checklist. Buyer who **requires** PD, KernelCare, or WebShield is **not** a displace deal.

---

## 6) Agent notes

- English spec; Bahasa with user.
- `GIT_MASTER=1`; branch `feat/` or `docs/` from `main`.
- No IPs, tokens, customer paths in git.
- Playwright ≠ enroll. Clone PRs forbidden.
- Do not implement “D1” as another quarantine queue.
- Cross-links: [`imunify-class-onbox.md`](imunify-class-onbox.md) §7 waves · [`host-protect-v1.md`](host-protect-v1.md) · [`host-waf-v1.md`](host-waf-v1.md)
