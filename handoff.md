# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-13 — SPA chrome + mobile lists)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`716a9004`** (`fix: mobile-friendly Host WAF events list` **#748**) or newer. Do **not** SSH Alembic after a green `main` deploy. |
| **This session (SPA)** | User asked sequential UI fixes, not a product epic. (1) Landing footer: four-column link farm → BrandMark + one site nav + meta bar; `/blog` `/terms` `/privacy` island chrome rhymes Landing → **#745**. (2) `/assets` list: stacked cards `md:hidden`, table from `md` → **#746**. (3) `/ai` Usage tab: same card/table split, drop `min-w-[36rem]` → **#747**. (4) `/host` WAF events: same split; frozen `host-waf-events` stays on the wrapper → **#748**. Pattern copy: Dashboard / Guard / Uptime. Tokens stay `--primary` `hsl(142 71% 45%)`. No second palette. No native `<select>`. Primary actions use `Button`. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. **[#749](https://github.com/gmedia/vuln-scanner/pull/749)** `feat: Sinexis Scan invoices independent of GMD` — **not this session**; do **not** merge unless asked. Dependabot: **do not mass-merge**. |
| **Still human** | **GTM**; Host invoice `service_id`; fill `/admin/hpp` `hostscan`; Demo-ok narrative. Guide **§1.3 P0** + **§7 “lanjut”**. |
| **Engineering default** | **Do not** re-implement P12/P13. **Do not** start WAF **1147+**, P14 **G/H**, pack-widen, or YARA/Clam code unless named + `buat`. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot. **#749** only if the user names invoices / `buat`.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: report **GTM / invoice / HPP** still human; **do not** silent-code WAF/YARA/G/H or more list pages.
4. If they name another overflow table (same pattern as Assets / AI Usage / Host WAF events): `md:hidden` stacked cards + `hidden overflow-x-auto md:block` table; unique testids on the card surface; keep frozen e2e testids on the wrapper.
5. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`. Playwright ≠ enroll.
6. Older snapshots (including **2026-09-11 #733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
