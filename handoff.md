# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`vs.appmedia.id`** (public DNS). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-02 — Guard host-agent token SPA)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Expect **`9677e07`** or newer: **#576** `sinexis-install.sh` wrapper (not curl\|bash; does **not** install `wazuh-agent`). Before that: **#575** README, **#574** `/guide` Host WAF, **#573** P14 F protect. |
| **Open PR** | **[#577](https://github.com/gmedia/vuln-scanner/pull/577)** `feat/guard-host-agent-token` — mint helper `results_token` from SPA `/guard`. Commits: `28cbf03` API, `fb7c00b` SPA, `7f4b43f` docs. **Not on `main` until squash-merge.** CI: most jobs green; `python-tests (backend)` was still in progress last check — **do not poll**; merge if green. Dependabot: **do not mass-merge**. |
| **#577 what** | Admin/owner `POST /api/guard/agents/{id}/host-token` → plaintext **once**; DB `results_token_hash` only. List: `has_host_agent_token` (no hash). SPA: copy **product UUID** (`GuardAgent.id`, not Wazuh numeric), generate/rotate token dialog, last helper poll. Guide `hp1` + `docs/host-protect-helper-am.md`. Tests: `test_issue_host_agent_token_admin_idor`; vitest `GuardHostEnroll`. |
| **Install path (operator)** | (1) enroll **wazuh-agent** (2) `/guard` copy UUID + generate helper token (3) `sinexis-install.sh --agent-id <uuid> --token-file` (mode 600). Token file ≠ Wazuh enroll token. Header `X-Host-Agent-Token` / env `SINEXIS_HOST_AGENT_TOKEN`. **No** CSV/JSON download of secrets. |
| **P14** | **A–F** on this stream (F = Host Multi WAF protect, customer nginx only). **G/H** only if user **names** slice + `buat`. Spek [`imunify-class-onbox.md`](docs/specs/imunify-class-onbox.md). **Do not** title PRs “Imunify parity.” |
| **Lab** | Host Protect helper: **tc5 only**. Do **not** wipe `sx-erpstg`. Live WAF **403** needs **disposable** vhost + `GUARD_LAB_*` / `HOST_WAF_LAB_VHOST_SSH` — **not** tc5. Playwright ≠ enroll. |
| **Still human** | GTM; Host Protect **invoice/`service_id`**; fill `/admin/hpp` `hostscan`; after **#577** merge+deploy, operator install on tc5. |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Do **not** invent second enroll daemon. Do **not** paste WAF onto `sinexis.app` edge. Do **not** poll CI. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`9677e07`** or **#577 squash** if merged. `gh pr list --state open --assignee @me`. If **#577** CI green → `gh pr merge --squash` then delete `feat/guard-host-agent-token`. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Protect: **`docs/specs/host-protect-v1.md`**. P14: **`docs/specs/imunify-class-onbox.md`**. Wrapper/AM: **`docs/host-protect-helper-am.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/tokens/PNGs.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy — `scripts/deploy.sh` already migrates.
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (wipe `tc5` first §4.1). Playwright ≠ enroll. Standing lab **tc1–tc5** OK.
6. Optional (only if user picks): merge **#577**; live helper on **tc5** after deploy (wipe-first); named **G/H** + `buat`; disposable vhost 403; GTM/`service_id`; HPP `hostscan`. Do **not** clone Imunify.

## Session snapshot (2026-09-01 — P12 S11/S12 merged; P14 docs)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Expect **`adab0fd`** or newer: **#559** S12 jail, **#558** S11 queue, **#556** honesty. **P14** spek [`docs/specs/imunify-class-onbox.md`](docs/specs/imunify-class-onbox.md). |
| **Open PRs (assignee)** | Re-`gh pr list`. **#549–#551** already merged historically. Dependabot: **do not mass-merge**. |
| **Host Protect (why Hits empty)** | Scan Now **enqueues** `host_scans` `queued` + Celery `host_protect.run_scan` on `ip_scan`. SaaS worker **does not** mount customer disks. If `os.path.isdir(root)` false → **`pending_agent`**, **0 hits**, scan **stays queued** (honesty gate: **no mock** `wp-content/uploads/cache.php`). Real walk = needle grep of `php_webshell.yar` (`eval($_POST|GET|REQUEST`, `system\|passthru\|shell_exec($_GET`) + optional Clam; cap **500 files / 1 MiB**. Helper: `packaging/host-protect-helper/sinexis_host_scan.py` poll `GET /api/host/agent/jobs` + POST results. Site **Erp Stg** `/var/www/stg/member-pay` is **allowlisted** (`/var/www`) but **not on the worker FS**. Empty Hits = unread / not ingested, **not** proven clean. **#551** shows that instead of silent “No malware hits yet.” Product: one `wazuh-agent`; Host Protect ≠ SIEM; **do not invent malware**. |
| **Blog live** | Public `/blog` = DB `blog_posts`. After **#546** merge + green main: **8 slugs updated in prod** (`updated=8 missing=0`) via `vuln-backend`. Seed `docs/content/blog/*.md`. |
| **Email** | User: mail tidak sampai → admin log. **#549** persist `record_email_send` via `DATABASE_URL_SYNC`; kinds `verification\|password_reset\|scan_diff\|uptime\|host_protect`. |
| **AAB** | Scan `4f204f52-…` auto-fail 20m (beat `started_at` + SIGKILL). **#550** raises limits. Re-scan after deploy. |
| **Untracked** | Many `*-2k.png` / `.tmp-*` / `workers/coverage-report.json` — **never git-add**. |
| **Still human** | GTM; Host Protect **invoice/`service_id`**; fill `/admin/hpp` `hostscan`; on-box helper on the VM that **has** the docroot (ERP-stg) if user wants live Hits. |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Do **not** invent second enroll daemon. Do **not** paste WAF onto `sinexis.app` edge. Do **not** wipe `sx-erpstg`. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`adab0fd`** or newer. `gh pr list --state open --assignee @me`. CI green → `gh pr merge --squash` then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. P12: **`docs/specs/host-protect-v1.md`**. P14: **`imunify-class-onbox.md`**. Code fail status **`pending_agent`**; spek also **`unreachable_root`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/PNGs/`workers/coverage-report.json`.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy — `scripts/deploy.sh` already migrates (`merge_email_logs_asset_tags` if **#549** landed).
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (wipe `tc5` first §4.1). Playwright ≠ enroll. Standing lab **tc1–tc5** OK; never wipe live ERP.
6. Optional (only if user picks): **P14** named slice **B** or **C** + `buat`; lab helper on **tc5** after deploy; GTM/`service_id`; fill HPP `hostscan`. Do **not** clone Imunify.

## Session snapshot (2026-08-31 — Host Protect S7–S12 + SKU/HPP #538)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`dcfc743`** squash **#538** Host Protect working-list IDR + HPP `hostscan`. Before that: **#537** S12 Clam, **#536** S11 quarantine, **#535** S10 YARA, **#534** S9 ingest, **#533** S7 honesty gate, **#532** S7–S12 spek, **#531** prod flag ON. |
| **Open PRs** | None from this wave. Dependabot: **do not mass-merge**. |
| **Host Protect** | **S0–S12 on `main`**. Honest on-box: missing worker roots → `unreachable_root`, **not** mock hits. SPA `/host`. Prod compose `HOST_PROTECT_ENABLED` default **true**; local/CI **false**. Quarantine ≠ reconstruct. Not Imunify clone. |
| **HPP `hostscan`** | Alembic `add_hpp_hostscan` (revises `add_host_agent_ingest`). Seed **0** in git. Report counts `host_scans` with `status=completed` + `finished_at` in range. Fill real COGS in **`/admin/hpp`** after deploy — never commit amounts as truth. |
| **Working list IDR** | Host Basic **150.000** · Pro **350.000** · Multi **900.000** / mo in `docs/commercial/sku-host-protect.md`. **Not** finance/invoice lock. `service_id` still **open**. |
| **Lab `tc5`** | Runbook in `docs/multi-host-ops.md` (env-only tokens; aliases only). **Not executed** this session. Wipe Guard `tc5` first §4.1 if live smoke. Playwright ≠ enroll. Do **not** wipe `sx-erpstg`. |
| **Host WAF** | P13 S0–S5 shipped. Per-site mode still **off**. **Never** paste snippet onto `sinexis.app` edge nginx. |
| **Untracked** | Many `*-2k.png` / `.tmp-*` on coding host — **never git-add**. |
| **Still human** | GTM; Host Protect **invoice lock**; fill HPP `hostscan`; optional live `tc5` helper smoke. |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Do **not** invent P14 Coraza without spec. Do **not** poll CI. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`dcfc743`** or newer. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot. Do **not** poll CI.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Protect: **`docs/specs/host-protect-v1.md`**. HPP: **`docs/specs/admin-hpp-v1.md`**. SKU: **`docs/commercial/sku-host-protect.md`**. Lab: **`docs/multi-host-ops.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/PNGs.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy — `scripts/deploy.sh` already migrates (`add_hpp_hostscan` included if deploy succeeded).
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (wipe `tc5` first §4.1). Playwright ≠ enroll.
6. Optional (only if user picks): live **tc5** Host Protect helper (wipe-first); GTM/`service_id` lock; fill `/admin/hpp` `hostscan`; named Dependabot; SPA `/host` bugs.

## Session snapshot (2026-08-31 — /guide Host WAF copy)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`d59447a`** squash **#529** Host WAF prod flag ON. Before that: **#528** Host Protect notify + guide Host TOC + Imunify archive (`3ea317a`), **#527** visual QA. |
| **Open PRs** | **[#530](https://github.com/gmedia/vuln-scanner/pull/530)** `feat/guide-host-waf-copy` — MERGEABLE. Guide copy: Guard prereq (`#guard` not “previous section”), WAF tab detect-only / snippet not edge / protect not sales default. Commits `bbc60dd` + `fecf7bd`. CI may still be running — merge if green, do not poll. Dependabot: **do not mass-merge**. |
| **Host Protect** | SPA `/host` shipped. Git `HOST_PROTECT_ENABLED` default **false**; prod host `.env` may be **true** (ops). Quarantine ≠ reconstruct. Not Imunify clone (`docs/commercial/imunify-beside-not-roadmap.md`). |
| **Host WAF** | Spek `docs/specs/host-waf-v1.md` done. **`docker-compose.prod.yml` `HOST_WAF_ENABLED` default true** (#529). Local/CI `.env.example` still **false**. Per-site mode still **off** until admin sets detect. Engine mock until Coraza. **Never** paste snippet onto `sinexis.app` edge nginx. |
| **`/guide`** | TOC id `host` after status-page. EN/ID `hp1–hp5` + `t3` updated on **#530**. Tests: `/host` link, `#guard`, quarantine/reconstruct, Copy nginx snippet, not Coraza on sinexis.app. |
| **Imunify** | Closed as product chase. Beside, not roadmap. Do not adopt remaining Imunify360 features unless user reopens. |
| **Untracked** | Many `*-2k.png` / `.tmp-*` on coding host — **never git-add**. |
| **Still human** | GTM; Host Protect/WAF **IDR/`service_id`**; real HPP COGS. |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Do **not** invent P14 Coraza without spec. Do **not** paste WAF onto `sinexis.app` edge. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`d59447a`** or **#530 squash** if merged. `gh pr list --state open --assignee @me`. If **#530** CI green → `gh pr merge --squash` then delete branch. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. WAF: **`docs/specs/host-waf-v1.md`**. Protect: **`docs/specs/host-protect-v1.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/PNGs.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy — `scripts/deploy.sh` already migrates.
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (wipe `tc5` first §4.1). Playwright ≠ enroll.
6. Optional (only if user picks): GTM/IDR; named Dependabot; SPA `/host` bugs; P14 Coraza **spec first**.

## Session snapshot (2026-08-31 — P13 Host WAF shipped + lab ops)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`d2d3096`** squash **#519** Dependabot `langgraph-sdk` workers. Before that: **#518** guide bump (`fa9d680`), **#517** WAF copy snippet (`25a293b`). **P12 Host Protect S0–S6** + **P13 Host WAF S0–S5 + SPA copy** on `main`. |
| **Open PRs** | None assigned. Dependabot: **do not mass-merge**. Next named-only if CI green (avoid `starlette` 1.6 / `alembic` 1.19 / `pydantic-settings` 2.15 until checked). |
| **P13 WAF** | Spek `docs/specs/host-waf-v1.md` **habis**. Mock API + SPA `/host` tab + SIEM block + snippet generator + `scripts/host-waf-lab-smoke.sh` + copy snippet. Events ≠ `host_hits`. **Not** Coraza on `nginx/sinexis.app.conf`. |
| **Flags in git** | `HOST_WAF_ENABLED` / `HOST_PROTECT_ENABLED` default **false**. |
| **Ops `tc1` (2026-08-31)** | Host `.env` set **true** for both flags (not git). `deploy-services.sh` backend SHA `fa9d680`; Alembic `add_host_waf`. Smoke API **passed** (policy, site, snippet, simulate `events=1`, site deleted). **Did not** `--apply-vhost`. **Did not** SSH `tc5` / ERP / edge nginx. |
| **Edge nginx** | Verified **no** `host-waf` / Coraza / ModSecurity in `/etc/nginx/conf.d/sinexis.app.conf` or repo `nginx/sinexis.app.conf`. No `/tmp/sinexis-host-waf-lab.conf`. |
| **Still human** | GTM; Host Protect/WAF **IDR/`service_id`**; real HPP COGS. AM must not invoice from SKU file. |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. **Do not** invent P14 Coraza without a new spec. **Do not** paste WAF onto `sinexis.app` edge. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`d2d3096`** or newer. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. WAF: **`docs/specs/host-waf-v1.md`**. Protect: **`docs/specs/host-protect-v1.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/PNGs.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy job — `scripts/deploy.sh` already migrates.
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (then wipe `tc5` first §4.1). Playwright ≠ enroll. Jangan SSH scan ke `tc5`.
6. Host WAF lab: `scripts/host-waf-lab-smoke.sh` + `GUARD_LAB_ALLOW_PUBLIC_PROD=1` if public origin. `--apply-vhost` only disposable lab alias — **refuse `tc5` / erp**.
7. Optional next (only if user picks): one Dependabot PR; P14 Coraza **spec first**; SPA `/host` bugs named by user; GTM/IDR human.

## Session snapshot (2026-08-30 — visual QA §D + AppShell chips)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`9edc756`** squash **#499** Sidebar chips. Also on main: **#498** Mobile CTA, **#497** Domain CTA, **#496** IP CTA, **#495** Assets empty outline, **#494** Header chips, **#493** AuthLayout, **#492** Landing, **#491** page registry. |
| **Open PRs** | Visual-QA PRs **merged**. Dependabot: **do not mass-merge** |
| **Recapture** | Prod **`https://sinexis.app`** (not `vs.appmedia.id` — SSL mismatch). Script `/tmp/opencode/recapture-registry.mjs`. PNG **`/tmp/opencode/recapture/`** (~104 files) + local auth **`/tmp/opencode/recapture-local/`**. **Do not git-add PNGs.** |
| **E2E auth** | `E2E_EMAIL` / `E2E_PASSWORD` from **tc1 env** → `/tmp/opencode/e2e.env` (chmod 600). Default mailbox `e2e@vulnscan.dev`. **Never print password.** Do **not** `POST /register` for that mailbox. SPA: `localStorage` `accessToken` + `refreshToken`; theme `sinexis.theme`. |
| **Chip vs CTA** | Selected Dark/EN must **not** be primary green. Pattern: wrapper `[&_button[aria-pressed=true]]:!bg-secondary` + `!text-secondary-foreground` + `min-h-11`. **Do not** restyle `ThemeSwitcher.tsx` / `LanguageSwitcher.tsx` globally. Landing + AuthLayout + Header + Sidebar shipped. |
| **Scan CTAs** | IP / Domain / Mobile start buttons **`w-full`** (removed `sm:w-auto`). |
| **Assets** | Header **Add asset** stays primary; empty `assets-empty-cta` is **outline**. |
| **Admin review** | `/admin`, `/admin/users`, `/admin/pricing`, `/admin/hpp`, `/admin/blog` reviewed from prod PNG. HPP Category is **shadcn Select** (screenshot looked native). No admin visual PR. Blog table row padding = nit only. |
| **Pass without PR** | Dashboard, schedules, credit-history filter, uptime, guard, SIEM, profile, workspace, guide, 404, status-page empty. 2k empty canvas is expected, not a kit bug. |
| **Investor / omset** | User asked admin revenue/valuation pages — **do not implement**. HPP ≠ omset. No finance dumps in git. |
| **Still human** | Merge already on main; optional recapture after deploy; GTM; real HPP COGS; Dependabot named-only |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Next: recapture lokal after SPA deploy **if asked**, or bugs named by user. Sequential visual-engineering only (OOM). |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect **`9edc756`** or newer. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Routes: **`docs/AGENT_PAGE_REGISTRY.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/PNGs/`.tmp-*`.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy job — `scripts/deploy.sh` already migrates.
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (then wipe `tc5` first §4.1). Playwright ≠ enroll.
6. Recapture **only if asked**. One page at a time. Origin **`https://sinexis.app`**. Creds from tc1 env, never invent password.
7. Visual leftover (optional, only if user asks): recapture AppShell chips + scan CTAs on prod after deploy; blog table padding nit.

## Session snapshot (2026-08-30 — HPP copy #489; journal #488)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Expect squash **#489** (HPP page copy) after **#488** journal (`694bdb8`) + **#487** overhead. CI main + deploy ran for #488; #489 merged 2026-08-30. |
| **Open PRs** | None assigned after #489. Dependabot: **do not mass-merge** |
| **Admin HPP** | `/admin/hpp`: unit rates + monthly overhead singleton + cost journal + date-range report + SKU overlay **estimasi**. Spec: `docs/specs/admin-hpp-v1.md` |
| **Pricing vs HPP** | Pricing = credits/scan. HPP = IDR production cost. **Not mixed.** Overlay uses `credit_cost` only as job-count estimate. |
| **Overhead vs journal** | Singleton `hpp_overhead` = one monthly IDR, **always** in pool (no date filter). Journal `hpp_cost_lines` = dated `opex`\|`variable` rows; **only in report range**. Pool = singleton + journal sums. Do not double-count rent. |
| **opex vs variable** | Labels only — same pool math. opex ≈ rent/CF; variable ≈ API usage. |
| **SKU overlay** | Auto on every report load. Hardcoded Basic/Pro/Multi list IDR + credits. `HPP if all IP/domain` = `(credits // credit_cost) * hpp_rate`. **No** overhead/journal/volume. Not invoices. |
| **Copy (#489)** | Subtitle + `hppRatesHint` + `hppReportHint` + `linkHppDesc` (id+en). Vitest asserts EN strings. |
| **Prod sample (not real COGS)** | Seeded via tc1 docker — replace with real numbers (human). Do not commit amounts as “truth”. |
| **Still human** | Real COGS; GTM; Dependabot named-only |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Next: ops COGS, or bugs named by user. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. HPP spec: **`docs/specs/admin-hpp-v1.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs.
4. **Do not** tell the user to SSH Alembic after a green **main** deploy job — `scripts/deploy.sh` already migrates.
5. **Guard:** `sx-erpstg` **online** — do **not** re-enroll/wipe unless user asks full Guard e2e (then wipe `tc5` first §4.1).
6. HPP residual is **ops** (real rates/journal), not more UI unless user asks.

### Last session (2026-08-30) — HPP explain + copy

**Shipped:** **#487** overhead; **#488** journal; **#489** Pricing↔HPP copy on `/admin/hpp`.

**Explained to user (no extra code):** overhead vs journal; opex vs variable (same pool); SKU overlay auto/estimasi.

**Do not:** mix Pricing into HPP rates; treat overlay as invoice; double-count singleton + journal rent; mass-merge Dependabot; manual Alembic after successful main deploy.

## Session snapshot (2026-08-29 — #477 on main)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`ff82389`** squash **#477** findings pagination + P6 S3. CI main green. |
| **Open PRs** | None assigned. Dependabot: **do not mass-merge** |
| **Findings API** | `GET /scan/{id}/findings` → `PaginatedFindingsResponse` (`page`/`limit`, lean `raw_data`). `GET /scan/{id}` `findings=[]` unless export `include_raw`. SPA ScanDetail paginates `/findings`. |
| **P6 hospitality** | **S1–S3 on `main`** — checklist, pack HTML, AM one-pager `docs/commercial/hospitality-am-one-pager.md` |
| **P11 Status page** | Apex live; SSL-gated Active; `statushost` credits. Frozen e2e testids unchanged |
| **P5 Guard** | **`sx-erpstg` online** — do **not** re-enroll/wipe |
| **P7 SIEM** | Prod flag **ON**. `SIEM_INCLUDE_FULL_LOG` **false** |
| **Still human** | GTM; P11 SSL/pricing; Uptime SMTP; findings pagination smoke on prod ScanDetail |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. Next agent: bugs named by user, or one Dependabot PR if named. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**.
3. Speak **Bahasa Indonesia**; prefix git with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs.
4. **Guard:** `sx-erpstg` **online** — do **not** re-enroll or wipe.

## Session snapshot (2026-08-28 — P11 SSL-gated Active + statushost credits)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`c7398be`** squash **#471** `feat/status host ssl credits`. Also on main: **#470** apex nginx, **#469** CF env inject, **#468** CF create/poll/delete, **#467** docs, **#466** lifecycle API, **#465** spec, **#464** apex FastAPI |
| **Open PRs** | None assigned. Dependabot: **do not mass-merge** |
| **P11 Status page** | **Apex live:** `https://status-erp.appmedia.id/` → HTML **ERP Stg · Status** (not landing). Custom URL = **`https://{host}/`**. Platform `/status/{slug}` unchanged. SKU custom host = **multi**. CNAME `customers.sinexis.app` / `status-edge.sinexis.app`. **`appmedia.id` is not a CF zone.** **#471:** product `hostname_status=active` **only** if CF **SSL** `active`; else `pending_txt` (TXT card stays). **P11.x-C:** debit **N** from admin pricing key **`statushost`** (≤10 chars) on first transition to Active (and after hostname change). Seed **0**. No debit on attach/Save/`pending_txt`. No refund on detach. 402 → keep previous status. Frozen e2e testids: `status-page`, `status-page-host`, `status-page-publish`, `status-page-create`, `status-page-slug`, `status-page-save-slug`. Public HTML **never** leak URL/IP/headers/token |
| **Edge ops** | Host SHA **`c7398be`**. Alembic **`status_host_pricing`** applied. Pricing row **`statushost` = 0**. Backend + frontend rolled (`COMPOSE_PROJECT_NAME=vuln`). GitHub secrets: `STATUS_PAGE_CF_API_TOKEN`, `STATUS_PAGE_CF_STUB_ACTIVE`, `STATUS_PAGE_CF_ZONE_ID` |
| **P8 Uptime** | **v2 + history on `main` (#451, #462).** Residual: ICMP **off**; SMTP smoke human |
| **P5 Guard** | **`sx-erpstg` online** — do **not** re-enroll/wipe. Do **not** open 1514 to `0.0.0.0/0`. Do **not** print IPs/keys. SSH aliases in `~/.ssh/config` only. Standing lab: wipe `tc5` first **§4.1**; Playwright ≠ enroll |
| **P7 SIEM** | Prod flag **ON**. `SIEM_INCLUDE_FULL_LOG` **false**. Do **not** add Discover on `/guard` |
| **P3 Assets** | S1–S5 on `main`. Residual: **`/assets` SSL on sinexis.app** (infra) |
| **Still human** | Admin → Pricing set **N** for `statushost`; SPA **Cek status** if SSL still pending; GTM; Uptime SMTP |
| **Engineering default** | **Do not start coding** until `implement` / `buat` / `kerjakan`. P11.x-B/x-C **shipped**. Next if asked: human SSL/pricing; bugs only |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. Expect tip **`c7398be`** or newer. `gh pr list --state open --assignee @me`. Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 then **§1.3**) then **`AGENTS.md`**. Spec: **`docs/specs/status-hostname-lifecycle.md`** (§7 P11.x-C).
3. Speak **Bahasa Indonesia** with the user; code/PR English; prefix **every** git command with `GIT_MASTER=1`. Never work on `main`. Never commit secrets/IPs/enroll keys/PNG screenshots.
4. **Guard:** `sx-erpstg` **online** — do **not** re-enroll or wipe. Do **not** paste IP `tc1`. Do **not** open origin `:443` to the internet. Do **not** open 1514 world.
5. **If user continues P11:** (a) confirm live apex still status HTML; (b) user sets **N** on `statushost`; (c) **Cek status** until CF SSL `active`; (d) do **not** re-implement #464–#471.
6. Recapture **only if asked**. Sequential visual-engineering. Do **not** fire many parallel screenshot agents (OOM).
7. **SIEM prod is on.** **Guard live lab** (wipe-first §4.1) without re-asking. Compose **`-p vuln`**.

### Last session (2026-08-28) — SSL-gated Active + statushost (#471)

**Shipped on `main`:** **#471** — `map_hostname_status` requires CF SSL `active`; `_debit_hostname_if_activated`; Alembic seed `statushost` cost 0; admin PUT whitelist; tests; i18n TXT until SSL; spec P11.x-C.

**Ops (not git):** edge `deploy-services.sh` backend then frontend; Alembic head `status_host_pricing`; live apex still ERP Stg HTML.

**Do not:** hardcode 3 credits; widen `scan_type` column; refund on Lepas; debit on `pending_txt`; open origin 443; re-enroll `sx-erpstg`; commit PNGs.

**User standing:** Guard live lab OK; SIEM on; never invent E2E password; Palatino **rejected**; public status **never** leak URL/IP; **kerjakan semua saran** (SSL + credits) done.

### Last session (2026-08-28) — custom host apex + hostname lifecycle

**Shipped on `main`:** **#464–#470** — apex FastAPI + nginx; CF Custom Hostnames; env inject; lifecycle API `pending_txt`; spec.

### Last session (2026-08-28) — Uptime history + Guard ERP stg

**Shipped on `main`:** **#462** — Uptime check history panel + `explainUptimeError` (i18n); Skeleton import fix (`TS2552`). **#461** status slug. **#460** SIEM filters. **#459** skeletons.

**Ops (not git):** Manager UFW allow ERP-stg egress → 1514/1515; Manager/indexer/dashboard **4.12.0 → 4.14.7** (agent was 4.14.7; Wazuh rejects newer agent). User: `nc` 1514/1515 succeeded; then version warning; after upgrade, agent **Active** on Manager; user: **`/guard` online** (sync button exists for admin/owner).

**Do not:** paste IPs in md; open 1514 world; re-wipe `sx-erpstg`; treat Playwright as enroll.

**User standing:** Guard live lab OK; SIEM on; never invent E2E password; Palatino **rejected**; public status **never** leak URL/IP.

### Last session (2026-08-27) — Uptime v2 check types

**Shipped on `main`:** **#451** — Alembic `uptime_v2_check_types`; model/schema/probe/apply; heartbeat mint+ingest+rotate; DNS A/AAAA; ping behind `UPTIME_ICMP`; SPA form/filters/i18n; tests invert/heartbeat/ping 501. **#450** spek. **#452** duplicate PR — closed.

**Also on main this wave:** **#449** ops table; **#448** attacker_benefit; **#447** report HTML; **#446** status HTML Landing chrome; **#445** Guard worker; **#444** sidebar; **#443** guide.

**User standing:** Guard live lab OK; SIEM already on; do not invent E2E password; Palatino-as-brand **rejected**; **#438** behavior **rejected**; public status **never** leak monitor URL/IP; ICMP default **off**.

**Rejected / watch:** worker must not import FastAPI/`app.services.uptime`; DNS via stdlib `getaddrinfo` (no `dnspython`); heartbeat grace `interval+60`; token SHA-256, one-time URL on create/rotate; `RateLimiter` via `__call__` not `.check`; Button from `@/components/ui/Button`; Alembic docstring required; **ONE COMMIT = FAILURE** for 3+ files.

### Last session (2026-08-27) — P11 status page

**Shipped on `main`:** **#441** — models + Alembic `add_status_page_tables`; `StatusPageService`; `/api/status-page`; public HTML `/status/{slug}` + Host; nginx `location ^~ /status`; SPA `/uptime/status-page`; i18n `statusPage`; env `STATUS_PAGE_ENABLED` / `STATUS_PAGE_CNAME_TARGET`. Tests: `backend/tests/test_status_page.py`, `frontend/src/test/StatusPage.test.tsx`.

**Also on main this wave:** **#439** uptime worker; **#440** revert **#438**.

**User standing:** Guard live lab OK; SIEM already on; do not invent E2E password; Palatino-as-brand **rejected**; **#438** behavior **rejected** (keep pre-#438 invite UI).

**Rejected / watch:** `RateLimiter` via `__call__` not `.check`; Button from `@/components/ui/Button` (capital B); hostname_status `none|pending_dns|active|failed` (not `pending_tls`); Alembic docstring required; **ONE COMMIT = FAILURE** for 3+ files.

### Last session (2026-08-26) — blog CMS + schedules mobile

**Shipped on `main`:** public FastAPI `/blog` + `/admin/blog` (shadcn); design-system rule in `AGENTS.md` §11; layperson articles; dark island; Language/Theme clip; reading-list cards; `PageLoading` skeleton.

**In flight:** **#418** — `frontend/src/pages/Schedules.tsx` mobile `<ul data-testid="schedules-mobile-list">` + desktop table; shared `ScheduleRowActions`; tests in `frontend/src/test/Schedules.test.tsx` use `*AllBy*` because both layouts stay in the DOM.

**User standing:** Guard live lab OK; SIEM already on; do not invent E2E password; Palatino-as-brand **rejected** (blog must rhyme Landing).

**Rejected / watch:** ruff E501 on long CSS in blog HTML; git hook HTML `←` in comments; freeze testids (`user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, `guide-desktop-toc`).

**User-confirmed OK (do not redo):** mobile clusters A–F; Guard tables #360; Guide TOC #361/#362; **i18n S1–S7**; **theme S1–#378 + #405**; **uptime #397–#401**; **2K #403–#404**; **mobile QA #406**; grok chrome (user liked #405); **blog CMS #408–#417** (Landing chrome, not Palatino). Default locale **`id`**. Default theme **dark**. Do **not** treat `i18n-v1.md` as S0.

**Skipped / blocked (do not fake):**

- **Cluster B** `/terms` `/privacy` — no legal URL yet (not a checkbox).
- **Wave G** skip.
- Freeze testids: `user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, **`guide-desktop-toc`** (do not rename).
- Scroll root: `SidebarInset` `max-h-svh overflow-y-auto` in `AppShell.tsx` (not `window`). Nested TOC: `Sidebar` `collapsible="none"` **without** a second `SidebarProvider`.
- **Header** is **`h-12`** after **#405** (grok chrome). Do **not** restore wave9 `h-14` unless the user asks. Tap targets use **`min-h-11`** (#406).
- grok2api **sidebar IA / Models / Keys** — **out**. CTA Scan **green** — **out** to invert.
- PNG refs lived under `.sisyphus/ref-design/` (not git). Recapture PNGs under `/tmp/opencode/screenshots-mobile-wave9/` (not git).
- **ONE COMMIT = FAILURE** for 3+ files. Atomic conventional commits. PR body: What / Files changed / Next steps.

**What AI may execute without re-asking:** Guard **live lab** (wipe `tc5` first §4.1). SIEM flag already **on** — do not toggle unless asked.

**What AI may execute only if the user says so:** recapture + visual review (sequential); P6 hospitality **spek**; **one** named Dependabot PR; Workspace/Assets **click** smoke; Uptime SMTP smoke; a **bugfix** with repro; **disable** SIEM.

**What AI must not start unprompted:** GTM (finance SIDs); invent `E2E_PASSWORD`; mass-merge Dependabot; Cluster B; Wave G; SIEM UI on `/guard`; re-implement shipped S1–S5 epics; parallel screenshot agents; enroll without wipe `tc5`. Playwright ≠ host enroll.

### Edge public smoke — post-S5 + Wave B deploy (2026-08-10)

No host IPs, SSH, or secrets in this file.

| Check | Result |
|-------|--------|
| CI deploy after #270/#271 | **success** (Actions push on `main`; tip moved to `31faa67` after #272 docs) |
| Alembic (deploy log) | head includes **`add_workspace_orgs`** |
| `GET /api/health` | **200** — DB + Redis connected |
| SPA asset (at tip smoke) | `assets/index--pycNp6_.js` + Dashboard/ScanDetail/Schedules chunks (re-check after later deploys) |
| Wave B strings in SPA | Jadwal scan / Atur jadwal; HTML teknis / Laporan eksekutif (bundle probe) |
| S5 FE copy | Batas 10 jadwal aktif **per organisasi** |
| `GET /api/orgs` unauthenticated | **401** (route present) |
| Multi-member S5 cap / OrgSwitcher UI | **Manual residual** — close when ops confirms |

### Edge on-host smoke A (2026-08-08) — P1 production DoD

No host IPs, SSH, or secrets in this file. Access path is private ops only.

| Check | Result |
|-------|--------|
| Git tip on edge (at P1 smoke) | **`6edd254`** (later SHAs OK; tip now includes Workspace) |
| Compose project label | **`vuln`** on this edge (always `docker inspect` — may differ per host) |
| Containers | backend, frontend, workers, **celery_beat**, postgres, redis **healthy** |
| Alembic (at P1 smoke) | was **`add_scan_schedules`**; **now head includes `add_workspace_orgs`** |
| Beat | **`schedules.run_due` every 5m** |
| Due + credits | Job **completed**, domain cost **2**, credits debit, `last_job_id` set, `next_run_at` advanced |
| Zero credits | Schedule **`enabled=false`**, `last_error` insufficient credits, **no** new job |
| Cap 10 | **Per org** after S5 (#270); remote proof historically 10 OK / 11th **400** (was per-user pre-S5) |

### Remote smoke (public URL)

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** |
| Schedules CRUD + cap 10 (**per org** post-S5) | **Pass** unit + API surface; multi-member edge residual |
| Workspace org API surface | Present (401 without JWT) |

### Deploy notes (edge)

- Prefer [`scripts/deploy-services.sh`](scripts/deploy-services.sh); include **`celery_beat`**.
- CI main still uses `scripts/deploy.sh` (known debt; deploy job succeeded for Workspace).
- Match live `COMPOSE_PROJECT_NAME` via inspect (`vuln` vs `vuln-scanner`).
- Never commit secrets, SSH targets, or production host addresses into the public repo.

### Smoke DoD (edge) — short

**P1 (closed):**

1. `celery_beat` healthy; Alembic includes schedules / `last_error`.
2. Due schedule + credits → job enqueued, credits deducted.
3. Zero credits → schedule disabled, `last_error` set, no new job.
4. 11th enabled / re-enable over cap → HTTP 400 (**per org** after S5).
5. Diff / notify / executive OK when credits allow.

**P2 residual (manual):**

1. Alembic head **`add_workspace_orgs`** (done on edge 2026-08-10).
2. Login → personal org + JWT `org_id` / OrgSwitcher.
3. Shared scans per membership; no cross-org IDOR; WS membership OK.
4. Two members same org share enabled-schedule **cap 10** (S5 DoD).

---

## GTM execution checklist (current focus)

| # | Owner | Action | Status |
|---|--------|--------|--------|
| 1 | Finance | Create **3 service_id** (Basic / Pro / Multi); no silent VPS bundle | **Open** |
| 2 | AM | Pick **10 wave-1 SIDs** in private CRM (patterns in SKU §5) | **Open** |
| 3 | AM + product | Name **pilot #1** (multi-service / VPS+domain, 1–3 targets, sponsored 1 mo) | **Open** |
| 4 | Ops | Fulfill pilot: user + credits + schedule + notify + first HTML (Bahasa) | **Open** |
| 5 | AM | Send wave-1 using [`am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md); log CRM | **Open** |
| 6 | Ops | Confirm live `pricing` domain/IP (smoke: **2** / **1**) before quotes | **Open** |
| 7 | AM | Follow-up 7–10d; renew ownership stays AM | **Open** |

**Success (not a GitHub PR):** ≥1 pilot cycle delivered + attach line billable or sponsored with list price in CRM + wave-1 sent.

---

## Current product priority (summary — detail in guide)

**Goal bias:** **upsell** Secure/Scan add-on on existing GMD **colo / VPS / cloud**, hospitality as **strategic beachhead**.

| P | Focus | State |
|---|--------|--------|
| **P0** | One-pager + SKU + AM kit | **Policy + templates in git**; **GTM execution open** |
| **P1** | Scan Attach Loop | **Code + production smoke closed** |
| **P2** | Workspace v1 | **S1–S5 shipped** (#267 + #270); residual multi-org/S5 smoke |
| **P3** | Light asset registry | **S1–S5 on `main`** (#380); residual edge Alembic + UI smoke |
| **P4** | Soft Sinexis dual-brand | **Shipped soft** (#250); **no domain cut** |
| **P5** | Guard (Wazuh thin) | Code on `main`; **live lab standing-permitted** (wipe-first) |
| **P6** | Hospitality / pilot pack | **Not coded** — next epic if user asks (spek first) |
| **P7** | SIEM v1 | Code on `main`; **prod flag ON** (2026-08-26); never as a Guard PR |
| **P8** | Uptime | **Shipped** #397–#401 + #439; human SMTP residual |
| **P10** | Public blog | **Shipped** #408–#417 |
| **P11** | Status page | **Shipped** #441; residual **edge deploy + CF SaaS** (not ACME) |
| **UX** | i18n + theme + visual | **Shipped** through **#406**; stop polish unless named gap |

**Priority rule:** If this stub, the archive, or old chat **disagrees** with the execution guide on *what to build next*, **the guide wins**, unless the user opens a stuck-job / worker incident.

**When to call engineering again:** user names a **new epic** (prefer **P6 spek**); product **bug** with repro; **one** named Dependabot PR; Guard lab run (already permitted); never unprompted recapture / grok2api redo / P3 re-implement.

---

## Commercial + eng docs (in repo)

| Need | Go here |
|------|---------|
| One-pager (locked) | [`docs/commercial/sinexis-one-pager.md`](docs/commercial/sinexis-one-pager.md) |
| SKU + decision log | [`docs/commercial/sku-scan-secure-addon.md`](docs/commercial/sku-scan-secure-addon.md) |
| AM wave-1 email (Bahasa) | [`docs/commercial/am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md) |
| P1 engineering spec | [`docs/specs/scan-attach-v1.md`](docs/specs/scan-attach-v1.md) |
| Workspace v1 spek (approved; S1–S5 shipped) | [`docs/specs/workspace-v1.md`](docs/specs/workspace-v1.md) |
| Guard v1 spek (P5 thin) | [`docs/specs/guard-v1.md`](docs/specs/guard-v1.md) |
| Assets v1 (P3 S1–S5 shipped) | [`docs/specs/assets-v1.md`](docs/specs/assets-v1.md) |
| SIEM v1 (P7) | [`docs/specs/siem-v1.md`](docs/specs/siem-v1.md) |
| Theme v1 (light/dark + grok2api chrome) | [`docs/specs/theme-v1.md`](docs/specs/theme-v1.md) |
| Status page v1 (P11) | [`docs/specs/status-page-v1.md`](docs/specs/status-page-v1.md) |
| Schedule ops / smoke | [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) |
| Full execution guide | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main`.

**Do not commit** raw finance/customer CSV dumps, production host IPs/ports, passwords, API keys, or customer SID/domain lists into this public repo.
