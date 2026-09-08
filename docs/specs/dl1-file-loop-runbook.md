# DL1 — File-loop AM runbook (Host Protect)

**Status:** docs (2026-09-07). **Not** a product code PR. P14 **D** (on-box `mv` quarantine) is already shipped; this file is the **AM script** only.
**Epic:** [`vps-displace-imunify-dev-plan.md`](vps-displace-imunify-dev-plan.md) **DL1**.
**Lab:** SSH alias **`tc5` only**. **Never wipe `sx-erpstg`.** Playwright ≠ enroll. Never print tokens, IPs, or customer paths.

**DoD:** A non-engineer finishes **enroll (if needed) → helper live → Scan now → real hit → Quarantine from SPA → Restore from SPA** on a **pre-installed** `tc5`. Empty list ≠ clean. SSH for **install** is expected.

---

## 0) Before the meeting

| Check | Honest bar |
|-------|------------|
| Org | Guard on; Host Protect flag on. Demo **file loop = Host Basic**. Do **not** quote Protect/WAF in the same meeting unless org is Host Multi. |
| VM | Helper already installed **or** you have time for wget (see [`host-protect-helper-am.md`](../host-protect-helper-am.md)). |
| Fixture | Web root exists **on that VM** (lab: `/var/www/host-protect-fixture` or `/var/www/host-waf-fixture`). Adding a SPA site whose folder is missing → fail closed, not mock hits. |
| Speech | Long pitch in displace plan §0. **Forbidden:** “ganti Imunify…”, PD, KernelCare, WebShield, auto-clean DB, Caddy. |

---

## 1) Helper heartbeat (SPA, not SSH proof)

1. `/guard`: agent **online**.
2. `/host`: **Helper last checked in** (`helperPolled`) and **not** stale (>30 min). Wazuh keep-alive **is not** Host Protect.
3. If never polled: on `tc5` wget `https://sinexis.app/install/sinexis-install.sh`, `head -n1` must be `#!/usr/bin/env bash`, menu **2** with `--token-file` (mode 600). Do not `curl | bash`. Do not `journalctl` the helper (token in env).

---

## 2) Site + Scan now

1. `/host` → **Add site**: name + **root path that exists on the VM** + Guard agent.
2. **Scan now**. Wait until the check **finishes** or an honest fail (`pending_agent` / unreachable). **Never** invent a webshell row.
3. Copy if empty: *“No suspicious files in the folder it could check — not a clean server.”* (`hitsClean` / `scanCompletedNone` / `hitsWaitingAgent`).

---

## 3) Needle (lab only)

If the fixture has **no** real hit, AM may drop a **tiny** needle **inside the site folder only** (not `/`, not `/etc`). Use the product YARA/needle set the helper already ships — do **not** paste malware samples into git or tickets.

Then **Scan now** again. A hit must show **path + class** on `/host`. If still empty: helper did not walk that folder (wrong `root_path`, helper stale, or path outside allowlist) — **stop**, do not mock.

---

## 4) Quarantine from the SPA (required)

1. On the hit row: **Quarantine** (not Ignore).
2. Status becomes **Queued for helper — not quarantined yet**. Disk has **not** moved until the helper timer/poll runs the queue.
3. Wait for helper (timer ~5 min, or one-shot poll **without** `journalctl`). Status should leave pending; file is under **`/var/lib/sinexis/quarantine`** on the VM (do not dump `ls` of customer data into chat).
4. Say: *isolate = pindah file, bukan reconstruct PHP / MDS auto-clean.*

**Fail closed:** If status stays queued, helper is down or token missing — that is the demo, not a green fake.

---

## 5) Restore from the SPA (required)

1. Same row: **Restore**.
2. Status **Restore queued — still quarantined on disk** until helper POST.
3. After helper: file is back under the site root; row no longer “quarantined on disk.”
4. **Scan now** optional to show the needle again (lab). Customer demo may stop after restore.

---

## 6) What this runbook is not

| Out | Why |
|-----|-----|
| New quarantine **queue** in SaaS | P14 **D** already shipped |
| Reconstruct / Imunify MDS | Legal + product **out** |
| WAF Simulate as “live block” | DL0: Simulate is **lab-only**; live = helper POST 1001–1095 |
| Wipe ERP / `sx-erpstg` | Standing rule |
| `sinexis.app` edge nginx snippet | Never |

---

## 7) Checklist (tick in the AM note, not in git)

- [ ] `helperPolled` fresh on `/host`
- [ ] Scan finished (or honest fail) — no mock hits
- [ ] Quarantine clicked in SPA → pending → on-disk isolate
- [ ] Restore clicked in SPA → file back
- [ ] Spoken: empty ≠ clean; SSH for install OK; not Imunify replacement
