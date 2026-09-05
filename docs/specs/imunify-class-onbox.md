# Spec: Imunify-class on-box (P14 — regional attach, original stack)

**Status:** **docs** (2026-09-03). Owner asked to **re-plan** Host Protect / Host WAF toward **Imunify360 jobs** (read files and HTTP on the **customer VM**) so GMD can take **regional** share where CloudLinux/cPanel+Imunify is weak or expensive. **Not** an Imunify clone, trademark, or ruleset dump. **Waves 0–3** (§7) sequence product work **after** P12 S0–S12; they do **not** re-open S1–S12.
**Epic:** **P14**. Builds on **P12** (files) + **P13** (HTTP) + **P5** (Guard enroll). Does **not** jump Scan SKU lock, hospitality GTM, or finance `service_id`.
**Do not implement app code** until the user says `implement` / `buat` / `kerjakan` for a **named slice** below.
**Legal:** original UX, original signatures, original nginx/Coraza config. No Imunify screenshots, no commercial Imunify/CloudLinux DB in git, no “Imunify compatible” in product UI.

---

## 0) What “like Imunify” means here (locked)

Imunify360’s **job** (not its product):

| Job | Imunify (typical) | Sinexis **must** (this plan) |
|-----|-------------------|------------------------------|
| Read web files on the **same host** as the site | Yes (panel/agent on box) | **Yes** — helper on Guard VM, never SaaS SSH / never bind customer FS to `worker_ip` |
| Show malware hits + isolate | Yes | P12 quarantine **on disk** (S11) after honest scan |
| Filter HTTP on the **same host** | WAF / PD | P13 **on customer nginx**, not `sinexis.app` edge |
| Control plane in a dashboard | WHM/cPanel | SPA `/host` (Sinexis), org-scoped |

**Explicitly still not v1 of this epic:** PHP Proactive Defense / ionCube-style SAPI, KernelCare, WebShield CAPTCHA, Imunify Email, CageFS, thousands of UIDs on one shared kernel, cPanel plugin **until slice G**.

**Honesty (unchanged):** missing on-box root → `failed` / `unreachable_root` or wait helper — **never** green completed + mock webshell. AM must not say “kami scan VPS Anda” until helper POST succeeded for that site.

---

## 1) Regional GTM (working, not finance lock)

**Hypothesis (owner):** take **Imunify-shaped budget** in a **named region / channel** (e.g. GMD VPS/colo ID, properties without cPanel, AM book that already pays infra). Exact geo/list = **owner + AM**; **no** customer PII or invoice SIDs in this file.

| Motion | Who | Pitch (Bahasa, honest) |
|--------|-----|------------------------|
| **Displace-lite** | VPS/colo **without** Imunify | “Scan file + isolate di mesin Anda, konsol Sinexis, satu agen Guard.” |
| **Beside** | Farms **with** Imunify | Do **not** rip Imunify day one. Sit beside; Host Protect = GMD-branded visibility. |
| **Do not** | Shared cPanel thousands of sites | Out until plugin + multi-UID research (slice G+). |

Working IDR remains [`sku-host-protect.md`](../commercial/sku-host-protect.md) — **not** invoice lock. Regional list prices = finance later.

---

## 2) Architecture (target)

```text
Customer VPS (Guard enrolled)
  wazuh-agent          → enroll / liveness only
  sinexis_host_scan    → walk jail, POST JSON (files)
  optional clamscan    → extra engine if present
  nginx + snippet      → Host WAF detect → later protect
  quarantine dir       → /var/lib/sinexis/quarantine/… (S11)

SaaS
  FastAPI /host + /api/host/agent/*
  Celery = enqueue + timeout unreachable_root
  worker_ip MUST NOT os.walk customer paths
```

---

## 3) Stages (implement later, one PR stream per slice)

Do **not** mix slices in one PR. Lab: **tc5 fixture**, never ERP `sx-erpstg`. Wipe-first only for full Guard e2e.

| Slice | Name | Goal | DoD (agent-executable) | Out |
|-------|------|------|------------------------|-----|
| **A** | Honesty UX | Konsol tidak berbohong | `pending_agent` / `unreachable_root` in API + SPA; `hit_count` ignores mock; copy: path not on agent | New engine |
| **B** | Default on-box | Scan now **always** means helper (or fail) | Worker **never** `_finish_scan` from SaaS `isdir` except documented **lab bind fixture** flag; prod missing dir → fail closed | Bind customer disks |
| **C** | Helper ops | Install path AM can run | Package/docs: Depends `wazuh-agent`; token from Guard UI; timer; AM runbook [`host-protect-helper-am.md`](../host-protect-helper-am.md); wrapper [`sinexis-install.sh`](../../packaging/host-protect-helper/sinexis-install.sh) (`--dry-run` / `--token-file` / `--interactive`); lab smoke `--require-helper-heartbeat` on **tc5** | `curl \| bash` as v1 |
| **D** | Disk quarantine | Isolate like Imunify “cleanup” **without** rewrite | S11: `mv` jail, restore, audit; auto off | PHP rewrite |
| **E** | denser schedule | Daily → optional hourly / on-write later | Beat cap; no 24×7 root YARA on `/` | inotify v1 unless named |
| **F** | WAF protect | Block on **customer** nginx | Owner names protect SKU; lab vhost only; **never** Sinexis edge | CRS paid packs in git |
| **G** | Panel (research) | cPanel/Plesk **later** | Spek-only until owner; no trademark UI | Shared-UID farm |
| **H** | PHP runtime (research) | PD-class | Spek-only; legal + SAPI cost | Clone Imunify PD |

**Build order:** **A** largely **#556**. **D** largely **#558** (`host_commands` queue). **S12** **#559**. **B** fail-closed: `HOST_PROTECT_ALLOW_LOCAL_WALK` default **false** (compose prod + local); worker `_finish_scan` via `os.path.isdir` **only** when that flag is on (lab bind). **C** AM install + tc5 lab (`.deb` #567, heartbeat #564, quarantine lab #570). **E** optional hourly (`host_sites.scan_interval`, Beat every 5m, org inflight cap 2). **F** WAF protect: Host Multi SKU gate; snippet `SecRuleEngine On` on **customer** nginx only; SPA keeps engine on mode change. Remaining: **G/H** only if owner names them.

---

## 4) What existing epics keep

| Epic | Keep |
|------|------|
| P12 S0–S12 | Models, ingest, helper **code**; honesty **#556**; queue **#558**; jail **#559** |
| P13 S0–S5 | Detect API; do not sell protect until **F** |
| P5 | One `wazuh-agent`; no second enroll daemon |

[`imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md) still forbids **clone PRs**. This file is the **job roadmap** (on-box access + regional attach), not “parity with Imunify360.”

---

## 5) Success

Regional AM can demo: enroll Guard → helper on fixture → **real** hit on **that VM’s** folder → quarantine/restore → (optional) WAF detect on **that** nginx — without saying the SaaS worker scanned the VPS.

---

## 6) Agent notes

- English spec; Bahasa with user.
- `GIT_MASTER=1`; branch `feat/` or `docs/` from `main`.
- No IPs, tokens, customer `public_html` in git.
- Playwright ≠ enroll.

---

## 7) Waves 0–3 (product sequence after P12)

Slices **A–H** remain the **PR stream** names. Waves are **when sales can demo** vs remaining engineering. **Do not** re-implement S1–S12. Implement app code **only** when the user names a slice **and** says `buat` / `kerjakan`.

**Control-plane fact:** P12 S0–S12 is on `main`. That is **not** “ready to sell as Imunify replacement.” Residual: helper **AM-repeatable** on `/host`, SKU invoice lock, WAF mix-up.

### Job map (Imunify job → Sinexis wave)

| Imunify-shaped **job** | Sinexis today | Wave |
|------------------------|---------------|------|
| Agent on the VPS that **owns** the web root | Guard + `sinexis_host_scan` helper | **0** — heartbeat visible on `/host`; installer one-file from `/host` (slice **C** residual) |
| Scan files on that disk | Helper POST; honesty #556 | **0–1** — fail-closed already **B**; copy must not look like “empty = clean” when helper missing |
| Show hits a layperson can act on | SPA `/host`; ignore vs empty **#596** | **1** — remaining: AM demo script; no jargon-only empty states |
| Isolate / restore | S11 queue **#558** | **1** — already queued; lab **tc5** only |
| HTTP filter on same host | P13 detect; **F** protect Multi | **2** — never `sinexis.app` edge |
| Panel / PHP PD | Out | **3** = **G/H** research only |

### Wave 0 — sellable **install** (default next)

| In | Out |
|----|-----|
| Heartbeat / last helper POST on `/host` (if not already obvious) | New YARA pack |
| One-file `sinexis-install.sh` from **product UI**, not “clone the repo” | `curl \| bash` as the blessed path |
| AM runbook already exists — keep it the source of truth | Wipe `sx-erpstg` |
| SKU: quote **Host Basic 1 site** only until finance `service_id` | Invoice lock in git |

**DoD:** AM on a **tc5** fixture: Guard enroll → download wrapper → helper timer → `/host` shows **pending_agent** then a **real** ingest (or honest fail). No mock hits.

### Wave 1 — **file** loop a layperson finishes

| In | Out |
|----|-----|
| Copy already: empty scan ≠ ignored hits (#596) | Reconstruct PHP |
| Quarantine/restore smoke on **tc5** | Auto-clean rewrite |
| Optional hourly already slice **E** — do not enable 24×7 `/` YARA | inotify unless named |

### Wave 2 — **HTTP** on customer nginx

| In | Out |
|----|-----|
| Slice **F** protect = Host **Multi** + customer snippet | Sinexis edge Coraza |
| Lab vhost; `--apply-vhost` **tc5 OK** (Sinexis lab); refuses ERP/`sx-erpstg` | CRS paid packs in git |

### Wave 3 — research only

**G** panel plugin, **H** PHP PD-class. Spek-only until owner names + `buat`. No “Imunify parity” PRs.

### Cross-links

- Legal freeze: [`imunify-beside-not-roadmap.md`](../commercial/imunify-beside-not-roadmap.md)
- File plane: [`host-protect-v1.md`](host-protect-v1.md) — **do not** re-implement S1–S12
- HTTP plane: [`host-waf-v1.md`](host-waf-v1.md)
- Working IDR: [`sku-host-protect.md`](../commercial/sku-host-protect.md)
