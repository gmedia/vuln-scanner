# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-11 — #733 merged + live tc5)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`6666c42c`** (`feat: split Host WAF modsecurity_rules to dodge nginx 18kB cap` **#733**) or newer. User confirmed **merged + deployed**. Do **not** SSH Alembic after a green `main` deploy. |
| **This session** | (1) Packed Host WAF starter (IDs **1001–1146**) into several `modsecurity_rules` quoted bodies (~3500 chars) so nginx 1.24 does not `[emerg] too long parameter`. Chain **1005** (`POST /wp-login.php` + ARGS `union select`) stays one unit. Dual-ship installer heredoc split the same way. (2) After deploy: leftover lab site wiped, `scripts/host-waf-lab-smoke.sh --apply-vhost` green, snippet copied to **tc5**, operator include on **lab vhost only**, `nginx -t` + reload, live probes. Lab fixture site deleted again (anti-409). |
| **P13 Host WAF** | **S0–S5 + starter 1001–1146** on `main` (**#708**). **#733** = pack split (not new IDs). **#731** = smoke must not require events after mock simulate. DL0–DL3 shipped. **Do not** default to WAF **1147+**. Never paste onto `sinexis.app` edge. |
| **Lab residual of #733** | **Done this session (tc5 only).** Packed snippet live: **5** `modsecurity_rules` blocks, quoted bodies ≤3500, **146** rules loaded. `nginx -t` ok (no too-long param). Probes on **lab vhost loopback** (not public edge): `POST /wp-login.php?q=union+select` **403**; GET same URL **not** 1005; `/eval(` **403**; `/wp-cron.php` **403**; `/wp-admin/` **200**. Smoke `--apply-vhost` is **scp only** — include + `nginx -t` is operator on the lab vhost (`/etc/nginx/snippets/` + `sites-enabled` lab file). `/tmp/sinexis-host-waf-lab.conf` may still be an old 1-block copy; live include is what nginx loads. **Not** Guard enroll wipe (§4.1) unless identity is dirty. **Never** wipe `sx-erpstg`. Playwright ≠ this lab. |
| **Host Protect engines** | **Shipped (#716).** `engine=yara` only after batched `yara -w` on original pack; else `needles`. Clam fallback. Lab Clam on **tc5** = **ops residual**, not another code epic. Spek [`host-protect-clam-yara-real.md`](docs/specs/host-protect-clam-yara-real.md). |
| **Open PRs** | Session boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human** | **GTM**; Host invoice `service_id`; fill `/admin/hpp` `hostscan`; Demo-ok narrative. Guide **§1.3 P0** + **§7 “lanjut”**. |
| **Engineering default** | **Do not** re-implement P12/P13. **Do not** start WAF 1147+, P14 **G/H**, pack-widen, or YARA/Clam code unless named + `buat`. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green → squash-merge then delete branch. **Do not poll CI.**
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: report **GTM / invoice / HPP** still human; **do not** silent-code WAF/YARA/G/H.
4. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`; probes as above. Standing permission **2026-08-26** is **Guard enroll/unenroll**, not a blank cheque to keep applying vhosts.
5. Older session snapshots: [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
