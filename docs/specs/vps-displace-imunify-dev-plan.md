# Spec: VPS displace-lite vs Imunify360 (development plan)

**Status:** **docs** (updated **2026-09-20**). **Sentence-ok = OPEN** — short “ganti Imunify360 dengan Sinexis” is **still forbidden** in customer meetings. **DL0–DL3 shipped** (`main` #647 / #649 / #651 / #659). Remaining path is **not** more WAF IDs or P14 **G/H**: it is **Demo-ok ops on `tc5`**, **Invoice-ok GMD `service_id`**, and a **dated product-owner checklist** (§7). Owner **intent:** AM able to say **“ganti Imunify dengan Sinexis di VPS/server”** — **only** on a **single nginx VPS or dedicated**, **not** shared cPanel/CloudLinux farms. That short fragment is **internal intent**, **forbidden in customer meetings** until **Sentence-ok** (§1 + §7).
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

### Invoice-ok (human / finance — not a default code PR)

**Do not conflate two invoice surfaces:**

| Surface | Today | Role |
|---------|--------|------|
| **C1 (this gate)** GMD ERP `service_id` Host Basic / Pro / Multi | [`sku-host-protect.md`](../commercial/sku-host-protect.md) **H9 open**, off-repo | **Invoice-ok** for the short sentence |
| **C2** In-app `sku_catalog` `product=host` `invoicable=true` | Invoice v1: Host seeded, `invoicable=false`; I10 Host-only invoice **out** | **Parked** until owner **names H9** as a product slice |

- C1: three Host `service_id` rows exist; **not** bundled into VPS or Scan.
- Working IDR already in [`sku-host-protect.md`](../commercial/sku-host-protect.md) H4; lock is **open** as of this write.
- Do **not** flip `invoicable` or invent Host invoice APIs to close this gate.

### Sentence-ok (short “ganti” line)

**Demo-ok + Invoice-ok** and:

1. Original pack has **new numeric IDs beyond 1001–1004** (`1005` wp-login POST+payload, `1006` URI eval/base64), allowlisted, lab probe documented, CMS-admin FP written (**DL2** — pack in git; live 403 still needs ModSec on vhost).
2. Simulate hidden **or** rows labeled `preview` / `lab`; no unlabeled `mock.sqli.1` in customer UX (**DL0 shipped** #647: lab-gate Simulate; starter `msg:` 1001–1003 original labels). Live ingest **1001–1146**.
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
| Invoice SKU | Working IDR; `service_id` open | **Invoice-ok** — human |

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
- Cross-links: [`imunify-class-onbox.md`](imunify-class-onbox.md) §7 waves · [`host-protect-v1.md`](host-protect-v1.md) · [`host-waf-v1.md`](host-waf-v1.md) · Sentence-ok closure **this file §7**

---

## 7) Sentence-ok closure (2026-09-20) — **OPEN**, not GREEN

**Goal of this section:** a dated path so AM **may** use the short fragment *“ganti Imunify360 dengan Sinexis”* on **one nginx VPS / dedicated without a panel**. It does **not** authorize that sentence today. It does **not** reopen product epics.

**AND, not OR:**

```
Sentence-ok  =  Demo-ok  AND  Invoice-ok (C1)  AND  pack 1005+ (shipped)
               AND  Simulate lab-gate (shipped)  AND  ModSec loaded on lab vhost
               AND  product owner dates the private checklist
```

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
| Invoice v1 Scan | pay loop closed; Host catalog `invoicable=false` |
| Working list IDR | Basic 150k / Pro 350k / Multi 900k — **not** finance lock |

**MUST NOT:** PRs titled “Imunify parity”; CRS / IM360 commercial DB in git; rebuild P12 / P13 / DL0–DL3; unpark P14 **G/H**; WAF **1147+**; inotify; Caddy; PHP PD; WebShield; KernelCare; cPanel plugin; wipe `sx-erpstg`; paste WAF onto `sinexis.app` edge; SSH Alembic after a green `main` deploy.

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

### 7.3 C — Invoice-ok (finance / product)

AM **must not** invoice an Imunify replacement until **C1** is true.

- **C1 (gate):** GMD `service_id` Host Basic / Pro / Multi exist; not a VPS or Scan bundle. Tick in **private** finance/CRM — **no SIDs in git**.
- **C2:** in-app Host `invoicable=true` stays **parked** unless owner names **H9**.
- File-only demo = quote **Host Basic**. WAF/protect sentence = org is **Host Multi before** the meeting. Never quote Basic and demo Protect.

### 7.4 D — Docs hygiene (this PR)

Update **this file** + pointers in legal / SKU / P14 / DL1 / Host Protect / Host WAF / invoice v1 / guide / `handoff.md`. **Do not** add `docs/specs/sentence-ok-closure.md`. **Do not** mark H4 / H9 **locked** without finance.

### 7.5 E — Who signs (dated private checklist)

AM **must not** self-authorize the short line. **Product owner** dates a private CRM/ops note (no customer SIDs in git). Copy (tick off-repo):

```
Sentence-ok  date: ____   signer: product owner
Target: nginx dedicated / no panel     [required]
Not shared cPanel / CloudLinux farm    [required]

Demo-ok
[ ] B1 helperPolled fresh from sinexis.app
[ ] B2 real hit → SPA quarantine → SPA restore
[ ] B3 ModSec loaded; live 403 on 1005/1006; GET /wp-admin/ = 200
[ ] B4 spoken: no PD, WebShield, MDS auto-clean, KernelCare

Invoice-ok
[ ] C1 three Host service_id rows (Basic/Pro/Multi)
[ ] not bundled into VPS or Scan
[ ] IDR = working list H4 unless finance dated another band
[ ] C2 in-app Host invoicable — N/A unless H9 named

Product (already git)
[x] pack 1005/1006
[x] Simulate lab-gate

Fail → short line STAYS FORBIDDEN
[ ] buyer requires PD / KernelCare / WebShield
[ ] quote Basic + demo Protect
[ ] Simulate as live block
[ ] shared cPanel meeting
```

Until every required box is dated **OPEN stays OPEN**. Use **only** the §0 long pitch. Fallback: *“file + HTTP tipis + scan luar; Imunify tetap lebih dalam di PHP runtime dan bot challenge.”*

**Critical path (not more code):** B1–B2 file loop (hours, ops) → **B3 ModSec on lab vhost** (often the technical blocker) → **C1 finance `service_id`** (often the commercial long pole) → owner dates E.

Buyer who **requires** PD, KernelCare, or WebShield is **not** a displace deal — sit **beside**; sell Scan attach.
