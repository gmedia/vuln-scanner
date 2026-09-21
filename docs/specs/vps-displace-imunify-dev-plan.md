# Spec: VPS displace-lite vs Imunify360 (development plan)

**Status:** **docs** (updated **2026-09-21**). **Sentence-ok = GREEN** (product owner **2026-09-21**, §7 E). Short “ganti Imunify360 dengan Sinexis” is **allowed** only on a **single nginx VPS or dedicated / no panel**. **Still forbidden** on shared cPanel/CloudLinux farms. **DL0–DL3 shipped** (`main` #647 / #649 / #651 / #659). **Billing lock:** Sinexis **in-app** invoices ([`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) **I1/D5**) — **not** GMD `service_id`. **Demo-ok `tc5` proven.** H9 Host `invoicable` = Guide §1.3.1 **#1** (named 2026-09-21, still wait for `buat`; GREEN does **not** auto-flip). Remaining agent path is that named queue, **not** finance SIDs / P14 **G/H**.
**Epic:** **P14 follow-on honesty plan** (jobs + original stack). Does **not** reopen P12 S1–S12 or P13 S0–S5.
**Legal:** [`imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md) still forbids clone PRs, trademarks, Imunify/CRS commercial DB in git, “Imunify compatible” in UI. This file is a **job + speech gate**, not parity.
**HTTP stack:** **nginx + ModSecurity (or Coraza spoa) on the customer/lab vhost.** **Caddy = out** until a **named** slice. Do not say “nginx/Caddy” in AM copy.
**Do not implement app code** until the user names a slice **and** says `implement` / `buat` / `kerjakan`. **DL0–DL3 are shipped — do not rebuild.** Do **not** create a second spec (`sentence-ok-closure.md`).

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

**Allowed spoken line (VPS/dedicated, no panel suite) — Sentence-ok GREEN 2026-09-21:**

Short fragment **allowed** on **one nginx VPS or dedicated without a panel**: *“ganti Imunify360 dengan Sinexis di VPS/server ini.”* Must still say the exclusions: **tanpa** PHP Proactive Defense, KernelCare, WebShield, atau auto-clean database.

Long pitch (still preferred; required if the buyer needs depth):

> Di **VPS/server ini** (bukan shared cPanel), Sinexis mengerjakan **file web on-box + isolate + filter HTTP tipis di nginx Anda + scan dari luar**. Bukan clone Imunify. **Tanpa** PHP Proactive Defense, KernelCare, WebShield, atau auto-clean database.

**Always forbidden:** “ganti Imunify” on cPanel shared; “Imunify compatible”; tab WAF = full IM360/CRS; konsol = bukti disk sebelum helper POST; Caddy as if supported. Buyer who **requires** PD / KernelCare / WebShield is **not** a displace deal — sit beside; sell Scan attach.

**Still true on cPanel farms:** sit **beside**; sell Scan attach. Do not rip Imunify day one.

---

## 1) Honest thresholds (do not OR)

Three independent gates. Engineering is **not** blocked on finance. AM **must not** invoice a replacement until Invoice-ok. The short “ganti” line is **Sentence-ok GREEN** (2026-09-21) — **nginx dedicated / no panel only**.

### Demo-ok (product honesty on **tc5**, not ERP)

All of:

1. Helper installed from **sinexis.app**; last POST visible (`helperPolled` / not stale) on `/host`.
2. Real file hit on **that** VM’s jail → quarantine/restore **from the SPA** (SSH allowed for **install only**).
3. WAF **live** demo only if **ModSec/Coraza is loaded** on the lab vhost **and** a **live** (not Simulate) event for a starter id (1001–1006). Console snippet copy ≠ filter. GET `/wp-admin/` must stay **200** (not in pack).
4. Spoken exclusions: **no PD, no WebShield, no MDS auto-clean DB, no kernel live-patch**.

Until Demo-ok: do not demo Host as “on-box proof.”

### Invoice-ok (Sinexis in-app — **not** GMD)

**Locked (owner):** billing lives in **Sinexis** (`/admin/invoices`), independent of GMD. See [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) **I1** and [`sku-scan-secure-addon.md`](../commercial/sku-scan-secure-addon.md) **D5**. GMD rack/VPS invoices stay in GMD. **No silent-bundle.** GMD `service_id` is **optional leftover**, **not** this gate, **not** agent next-step.

**Do not conflate two invoice surfaces:**

| Surface | Today | Role |
|---------|--------|------|
| **Invoice-ok (this gate)** Sinexis in-app Scan invoices | I1–I9 **shipped**; bank transfer, mark paid | AM **can** bill Scan attach without GMD SID |
| **H9** In-app `sku_catalog` `product=host` `invoicable=true` | Host seeded, `invoicable=false`; I10 Host-only invoice **out** | **Named** §1.3.1 **#1** (2026-09-21). Catalog still `invoicable=false` until `buat`. GREEN does **not** auto-flip |
| **Struck C1** GMD ERP Host `service_id` | Off-repo optional | **Not** Invoice-ok. **Do not** tell the user the next step is three SIDs |

- Working IDR: Scan P0 lock; Host H4 working list ([`sku-host-protect.md`](../commercial/sku-host-protect.md)). Host IDR **not** finance-locked.
- File-only demo = quote **Host Basic**. WAF/protect sentence = org is **Host Multi before** the meeting. Never quote Basic and demo Protect.
- Do **not** flip `invoicable` or invent Host invoice APIs unless **H9** + `buat` (already named as queue #1).
- Do **not** invent GMD API / SID rows in git.

### Sentence-ok (short “ganti” line) — **GREEN 2026-09-21**

**Demo-ok + Invoice-ok** and the product bars below are **met**. Product owner dated §7 E on **2026-09-21**. Scope = **nginx dedicated / no panel**. Shared cPanel stays **forbidden**.

1. Original pack has **new numeric IDs beyond 1001–1004** (`1005` wp-login POST+payload, `1006` URI eval/base64), allowlisted, lab probe documented, CMS-admin FP written (**DL2 shipped**).
2. Simulate hidden **or** rows labeled `preview` / `lab`; no unlabeled `mock.sqli.1` in customer UX (**DL0 shipped** #647). Live ingest **1001–1146**.
3. Demo vhost actually has ModSec loaded (**proven** `tc5` 2026-09-20).

On shared cPanel / CloudLinux farms still use: *“file + HTTP tipis + scan luar; Imunify tetap lebih dalam di PHP runtime dan bot challenge.”*

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
| HTTP WAF | Starter **1001–1146** | Further original IDs only; never IM360/CRS |
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
| Invoice SKU | Sinexis in-app Scan **shipped**; Host `invoicable=false` until **H9** | **Invoice-ok** = Sinexis path, not GMD SID |

WAF IDs (`host_waf_render.py`): **1001** `/xmlrpc.php` (`sinexis.xmlrpc`); **1002** ARGS `union select` / `or 1=1` (`sinexis.sqli`); **1003** URI `../` (`sinexis.path.traversal`); **1004** lab `/sinexis-waf-lab`; **1005** POST `/wp-login.php` chained with payload ARGS; **1006** URI `eval(` / `base64_decode(`; **1007** `/wp-cron.php`; **1008** URI `php://` / `data://`; **1024** `/timthumb.php` (`sinexis.timthumb`); **1025** `/actuator` (`sinexis.actuator`); **1026** `/telescope` (`sinexis.telescope`); **1027** `/.DS_Store` (`sinexis.dsstore`); **1028** `/wlwmanifest.xml` (`sinexis.wlwmanifest`); **1029** `/wp-json/wp/v2/users` (`sinexis.wpjson.users`); **1030** `/adminer.php` (`sinexis.adminer`); **1031** `/elmah.axd` (`sinexis.elmah`); **1032** `/manager/html` (`sinexis.tomcat.manager`); **1033** `/solr/admin` (`sinexis.solr.admin`); **1034** `/jenkins` (`sinexis.jenkins`); **1035** `/jmx-console` (`sinexis.jmx.console`); **1036** `/trace.axd` (`sinexis.trace.axd`); **1037** `/.svn/entries` (`sinexis.svn.entries`); **1038** `/invoker/JMXInvokerServlet` (`sinexis.jmx.invoker`); **1039** `/web.config` (`sinexis.web.config`); **1040** `/server-info` (`sinexis.server.info`); **1041** `/axis2/axis2-admin` (`sinexis.axis2.admin`); **1042** `/console` (`sinexis.weblogic.console`); **1043** `/CFIDE/administrator` (`sinexis.cfide.admin`); **1044** `/_profiler` (`sinexis.symfony.profiler`); **1045** `/crossdomain.xml` (`sinexis.crossdomain`); **1046** `/clientaccesspolicy.xml` (`sinexis.clientaccesspolicy`); **1047** `/debug/default/view` (`sinexis.django.debug`); **1048** `/actuator/heapdump` (`sinexis.actuator.heapdump`); **1049** `/elmah.axd` (`sinexis.elmah`); **1050** `/trace.axd` (`sinexis.trace.axd`). Product GET/ingest = starter IDs **1001–1146**. **1096–1140** original URI pack (solr/select, host-manager, jmxrmi, nginx_status, editors, secrets.yml, CI files, webmail/zabbix/grafana, kube/docker config, dump.sql, pma setup, install.php). SPA Simulate is **lab-only** and is **not** listed on the live table (#647). **Not matched:** GET `/wp-admin/`.

---

## 3) Development slices (one PR stream each)

**DL0–DL3 shipped.** Further slices only when named + `buat`. Do **not** mix with Workspace/SIEM/Guard Discover. Lab: **tc5**; **never wipe `sx-erpstg`**. Never paste WAF onto `sinexis.app` edge.

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
- H5 stays: beside on cPanel; **displace-lite** only on GMD VPS/colo **without** panel suite (**Sentence-ok GREEN** 2026-09-21).
- Scan attach remains **P0** sold SKU. Do not silent-bundle Host into VPS or Scan.

---

## 5) Success

Regional AM demos **one** nginx VPS: Guard + helper + real file isolate + (Multi) WAF protect with **our** rules + Scan schedule. Short “ganti” line **allowed** on that nginx dedicated / no-panel meeting (**Sentence-ok GREEN** 2026-09-21). File-only demo = quote **Host Basic**. WAF/protect sentence = org is **Host Multi before** the meeting. Buyer who **requires** PD, KernelCare, or WebShield is **not** a displace deal.

---

## 6) Agent notes

- English spec; Bahasa with user.
- `GIT_MASTER=1`; branch `feat/` or `docs/` from `main`.
- No IPs, tokens, customer paths in git.
- Playwright ≠ enroll. Clone PRs forbidden.
- Do not implement “D1” as another quarantine queue.
- Cross-links: [`imunify-class-onbox.md`](imunify-class-onbox.md) §7 waves · [`host-protect-v1.md`](host-protect-v1.md) · [`host-waf-v1.md`](host-waf-v1.md) · Sentence-ok closure **this file §7**

---

## 7) Sentence-ok closure (2026-09-21) — **GREEN** (nginx dedicated / no panel)

**Goal of this section:** a dated path so AM **may** use the short fragment *“ganti Imunify360 dengan Sinexis”* on **one nginx VPS / dedicated without a panel**. Product owner dated this on **2026-09-21**. It does **not** authorize “ganti” on shared cPanel. It does **not** reopen product epics. It does **not** flip H9.

**AND, not OR:**

```
Sentence-ok  =  Demo-ok  AND  Invoice-ok (Sinexis in-app Scan path shipped)
               AND  pack 1005+ (shipped)  AND  Simulate lab-gate (shipped)
               AND  ModSec loaded on lab vhost
               AND  product owner dates the private checklist
             =  GREEN 2026-09-21 (nginx dedicated / no panel only)
```

**Struck:** “Invoice-ok = three GMD Host `service_id`” (old C1). That contradicted I1/D5. Agents **must not** recommend finance SIDs as next work.

### 7.1 A — Already on `main` (MUST NOT rebuild)

| Item | Evidence |
|------|----------|
| Host Protect S0–S12 | honesty, helper, quarantine `mv` |
| Host WAF detect + protect (Host **Multi**) | customer nginx snippet; **never** `sinexis.app` edge |
| P14 A–F (E hourly) | on `main` |
| DL0 Simulate lab-gate | #647 — unlabeled `mock.sqli.1` not in prod UX |
| DL1 file-loop runbook | [`dl1-file-loop-runbook.md`](dl1-file-loop-runbook.md) |
| DL2 pack **1005** / **1006** | #651; live ingest **1001–1146** |
| DL3 live notify | #659 — not Simulate |
| Installer | `https://sinexis.app/install/sinexis-install.sh` #642 |
| Invoice v1 Scan | pay loop closed (**I1**: Sinexis bills, not GMD SID). Host catalog `invoicable=false` |
| Working list IDR | Host Basic 150k / Pro 350k / Multi 900k — **not** finance lock |

**MUST NOT:** PRs titled “Imunify parity”; CRS / IM360 commercial DB in git; rebuild P12 / P13 / DL0–DL3; unpark P14 **G/H**; Caddy; PHP PD; WebShield; KernelCare; cPanel plugin; wipe `sx-erpstg`; paste WAF onto `sinexis.app` edge; SSH Alembic after a green `main` deploy. **inotify** / WAF **1147+** = Guide §1.3.1 **#4/#5** — only if named + `buat` after H9.

### 7.2 B — Demo-ok (ops, lab `tc5`, not ERP)

All four on **one** nginx VPS. Playwright ≠ enroll. Standing 2026-08-26 permission = Guard enroll/unenroll **wipe-first** ([`AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md) §4.1) — **not** a blank cheque for `--apply-vhost`.

| # | Bar | Honest proof | Not proof |
|---|-----|----------------|-----------|
| B1 | Helper from **sinexis.app**; `helperPolled` fresh on `/host` | SPA last POST not stale (&lt; 30 min) | Wazuh keep-alive |
| B2 | Real file hit → SPA quarantine → SPA restore | Status leaves queued after helper; file under `/var/lib/sinexis/quarantine` then back | SSH `mv`; mock hits |
| B3 | **Live** WAF (not Simulate) starter id **1001–1006**; GET `/wp-admin/` **200** | ModSec/Coraza **loaded** on **lab** vhost; curl 403 vs 200 | Snippet copy; Simulate `mock.sqli.1` |
| B4 | Spoken exclusions | No PD, WebShield, MDS auto-clean DB, KernelCare | Silence |

File loop: [`dl1-file-loop-runbook.md`](dl1-file-loop-runbook.md). WAF API smoke: `./scripts/host-waf-lab-smoke.sh` (refuses ERP). `--apply-vhost` **only** when the owner **names** vhost apply. Ubuntu often has **no** ModSec module — that is **ops/hybrid**, not a SaaS PR.

**Fail-closed:** helper stale; quarantine stays queued; Simulate sold as a live block; `/wp-admin/` returns 403; module not loaded. Redact tokens/paths; **never** commit lab JSON.

### 7.3 C — Invoice-ok (Sinexis in-app)

AM bills **in Sinexis**, not via a GMD Host `service_id`.

- **Gate (shipped):** Scan invoices at `/admin/invoices` (I1–I9). GMD `service_id` **optional**, **not required**, **not** agent next-step.
- **H9** = Guide §1.3.1 **#1** (named). Catalog still `invoicable=false` until `buat`. GREEN does **not** auto-flip. Do **not** add Host invoice APIs without `buat`.
- **Struck C1:** creating three GMD Host SIDs is **not** this gate. Do **not** put SIDs in git.
- File-only demo = quote **Host Basic**. WAF/protect sentence = org is **Host Multi before** the meeting. Never quote Basic and demo Protect.

### 7.4 D — Docs hygiene (this PR)

Update **this file** + pointers in legal / SKU / P14 / DL1 / Host Protect / Host WAF / invoice v1 / guide / `handoff.md`. **Do not** add `docs/specs/sentence-ok-closure.md`. **Do not** mark H4 / H9 **locked** without finance.

### 7.5 E — Who signs (dated private checklist)

AM **must not** self-authorize the short line. **Product owner** dated this in chat **2026-09-21** (`kerjakan sesuai saran sampai selesai` after the §7 E remaining-bar recommendation). No customer SIDs in git. **Demo-ok B1–B4 proven** 2026-09-20 on `tc5`. Copy (historical; live status = **GREEN**):

```
Sentence-ok  date: 2026-09-21   signer: product owner
Target: nginx dedicated / no panel     [x]
Not shared cPanel / CloudLinux farm    [x]

Demo-ok
[x] B1 helperPolled fresh from sinexis.app
[x] B2 real hit → SPA quarantine → SPA restore
[x] B3 ModSec loaded; live 403 on 1005/1006; GET /wp-admin/ = 200
[x] B4 spoken: no PD, WebShield, MDS auto-clean, KernelCare

Invoice-ok
[x] Sinexis in-app Scan invoices (I1–I9 shipped; not GMD SID)
[x] Host not bundled into VPS or Scan
[x] IDR Host = working list H4 unless finance dated another band
[x] H9 in-app Host invoicable — named §1.3.1 #1; catalog still false; GREEN does not auto-flip
[x] Struck: do NOT wait on GMD Host service_id

Product (already git)
[x] pack 1005/1006
[x] Simulate lab-gate

Fail → short line STAYS FORBIDDEN (even after GREEN)
[ ] buyer requires PD / KernelCare / WebShield
[ ] quote Basic + demo Protect
[ ] Simulate as live block
[ ] shared cPanel meeting
```

**GREEN** does **not** authorize shared cPanel “ganti”, PD/KernelCare/WebShield claims, Basic+Protect mismatch, or Simulate-as-live. On those fails use: *“file + HTTP tipis + scan luar; Imunify tetap lebih dalam di PHP runtime dan bot challenge.”*

**Critical path (not more code):** **done.** Do **not** auto-flip H9. Queue **#1** still needs `buat`. **Struck:** waiting on GMD Host `service_id`.

Buyer who **requires** PD, KernelCare, or WebShield is **not** a displace deal — sit **beside**; sell Scan attach.
