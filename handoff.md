# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.3.1** product-depth queue — **not** GTM).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section. **Do not** answer “lanjut” with AM/sales checklists.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-17 — first-scan, D10, invite SMTP, print/filter shipped)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`7e74f181`** (`fix: merge alembic invite and guard disabled heads` **#805**) or newer. Do **not** SSH Alembic after a green `main` deploy. Alembic head: `merge_invite_kind_guard_disabled`. |
| **This session** | Chat user = **product**. Owner asked **saran** then **`kerjakan sesuai saran`** = **docs** (guide + this stub). Human prod smoke and Host `invoicable` (H9) were **not** named. **Never** put real account numbers / holder names / emails in git. |
| **Shipped this wave** | Inbox S1c job link **#793**. Invite honesty copy **#794** then SMTP **#800**. Status hostname copy **#795**. Print popup + invoice “Mark sent” **#796**. Findings `?severity=&q=` **#797** + pager **#803**. Schedules last-run Print **#799**. First-scan notify **#801**. Guard D10 `disabled_at` **#802**. Status incidents list **#798/#804**. Alembic merge **#805**. |
| **Print** | Browser Print for scan HTML + invoice SPA. Schedules last-run uses `printFile(..., "executive")`. **`format=pdf` still 400.** WeasyPrint parked S2. Spec [`scan-pdf-invoice-print-v1.md`](docs/specs/scan-pdf-invoice-print-v1.md). |
| **Inbox** | User SMTP Sent/Failed + `job_id` link for `scan_diff`. Invite kind is **admin log only**, not Inbox. Bounce/SES = S2 parked. Spec [`inbox-delivered-v1.md`](docs/specs/inbox-delivered-v1.md). |
| **Guard D10** | SPA soft-disable (`disabled_at`). **No** Wazuh DELETE. Hard delete = ops. Discover still Out. Spec [`guard-v1.md`](docs/specs/guard-v1.md). |
| **P14 E** | **Already on `main`**. Out still: 24×7 YARA on `/`, inotify unless named, WAF **1147+**, **G/H**. |
| **Invoice product** | Pay loop closed. Send = status flip (honest copy). Invite SMTP ≠ invoice SMTP. Spec [`sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md). Host catalog still `invoicable=false` until named H9. |
| **Metering v3** | **Shipped**. Scan/Host/Uptime = SKU seats; `credit_cost = 0`. **Do not** re-open Scan credit debit. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human (off-repo)** | GTM / Host `service_id` / `/admin/hpp` `hostscan` / prod attach smoke. **Do not** lead with them. |
| **Engineering default** | §1.3.1 **queue is empty of new default code**. **“lanjut”** without a named slice → report shipped list; **wait for named + `buat`**. **Do not** silent-code. **Do not** re-implement print, inbox, first-scan, D10, invite SMTP, findings filter, P14 E, P12/P13, P15 chrome. Parked unless named: print S2 (`format=pdf`/WeasyPrint), inbox S2 (bounce/SES), P14 **G/H**, WAF **1147+**, inotify, Capacitor, Host invoice H9. Invoice v1 closed. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths/bank details. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: **do not** recommend Inbox, print, first-scan, D10, invite SMTP, or P14 E (all shipped). Say the product-depth queue has **no default next code**; wait for a **named** slice + `buat`. Invoice v1 closed. **Do not** pitch GTM/AM/10 SIDs. **Do not** silent-code Guard Discover / bounce / WeasyPrint / WAF 1147+ / G/H / Host invoice.
4. Inbox files if asked: `backend/app/api/inbox_routes.py`, `backend/app/models/email_send_log.py` (`user_id`, `job_id`), `frontend/src/pages/Inbox.tsx`, spec [`inbox-delivered-v1.md`](docs/specs/inbox-delivered-v1.md).
5. Print files if asked: `frontend/src/api/scans.ts` (`printFile`), `ScanDetail.tsx` (`export-print-executive`), `Schedules.tsx` (`schedule-print-executive`), spec [`scan-pdf-invoice-print-v1.md`](docs/specs/scan-pdf-invoice-print-v1.md).
6. Guard D10 if asked: `POST /api/guard/agents/{id}/disable`, `guard_agents.disabled_at`. Hard delete Wazuh = ops. Wipe `tc5` first for live enroll (§4.1). Playwright ≠ enroll.
7. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`.
8. Older snapshots (including **2026-09-16 print + inbox**, **2026-09-15 Billing empty**, **invoice tests / metering v3**, **SPA chrome**, **#733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
