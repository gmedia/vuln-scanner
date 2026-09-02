# Spec: Imunify-class on-box (P14 — regional attach, original stack)

**Status:** **docs only** (2026-09-01). Owner asked to **re-plan** Host Protect / Host WAF toward **Imunify360 jobs** (read files and HTTP on the **customer VM**) so GMD can take **regional** share where CloudLinux/cPanel+Imunify is weak or expensive. **Not** an Imunify clone, trademark, or ruleset dump.
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
| **C** | Helper ops | Install path AM can run | Package/docs: Depends `wazuh-agent`; token from Guard UI; timer; AM runbook [`host-protect-helper-am.md`](../host-protect-helper-am.md); lab smoke `--require-helper-heartbeat` on **tc5** | `curl \| bash` as v1 |
| **D** | Disk quarantine | Isolate like Imunify “cleanup” **without** rewrite | S11: `mv` jail, restore, audit; auto off | PHP rewrite |
| **E** | denser schedule | Daily → optional hourly / on-write later | Beat cap; no 24×7 root YARA on `/` | inotify v1 unless named |
| **F** | WAF protect | Block on **customer** nginx | Owner names protect SKU; lab vhost only; **never** Sinexis edge | CRS paid packs in git |
| **G** | Panel (research) | cPanel/Plesk **later** | Spek-only until owner; no trademark UI | Shared-UID farm |
| **H** | PHP runtime (research) | PD-class | Spek-only; legal + SAPI cost | Clone Imunify PD |

**Build order:** **A** largely **#556**. **D** largely **#558** (`host_commands` queue). **S12** **#559**. **B** fail-closed: `HOST_PROTECT_ALLOW_LOCAL_WALK` default **false** (compose prod + local); worker `_finish_scan` via `os.path.isdir` **only** when that flag is on (lab bind). **C** AM install + tc5 lab (`.deb` #567, heartbeat #564, quarantine lab #570). Remaining: **E/F**. **G/H** only if owner names them.

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
