# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.3.1** product-depth queue — **not** GTM).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section. **Do not** answer “lanjut” with AM/sales checklists.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-16 — print + inbox shipped; queue empty)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`cd4c8e3f`** (`feat: SPA /inbox sent-failed list` **#789**) or newer. Inbox API **#788**. Do **not** SSH Alembic after a green `main` deploy. |
| **This session** | Owner asked to **update handoff** for a **new OpenCode session**. Chat user = **product**. Print S1a/S1b **#785/#786**. Inbox S0–S1b **#787/#788/#789**. Invoice v1 **pay loop closed**. **Never** put real account numbers / holder names / emails in git. |
| **Print** | Browser Print/Save-as-PDF for scan HTML (`export-print-executive`, `export-html`). Invoice SPA `window.print` on sent/paid. **`format=pdf` still 400.** WeasyPrint parked S2. Spec [`scan-pdf-invoice-print-v1.md`](docs/specs/scan-pdf-invoice-print-v1.md). |
| **Inbox** | User SMTP **Sent/Failed** log. `GET /api/inbox` (own `user_id`, product kinds only). SPA `/inbox` Account nav (`nav-inbox`). Copy ≠ mailbox DSN. Admin `/admin/email-logs` unchanged. Invoice Send = **status flip**, not SMTP. Spec [`inbox-delivered-v1.md`](docs/specs/inbox-delivered-v1.md). |
| **P14 E** | **Already on `main`** (Alembic `add_host_site_scan_interval`, `host_sites.scan_interval` daily\|hourly, org inflight cap 2, SPA `/host`). **Do not** re-implement. Out still: 24×7 YARA on `/`, inotify unless named, WAF **1147+**, **G/H**. |
| **Invoice product** | **#749** I1–I10 shipped. Billing + print S1b. Send = status flip. Mark paid applies `org.sku`. Spec [`sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md). |
| **Metering v3** | **Shipped** (#742–#744). Scan/Host/Uptime = SKU seats; `credit_cost = 0`. **Do not** re-open Scan credit debit. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human (off-repo)** | GTM / Host `service_id` / `/admin/hpp` `hostscan`. **Do not** lead with them. |
| **Engineering default** | §1.3.1 product-depth **queue is empty of new default code**. **“lanjut”** without a named slice → report shipped list; **wait for named + `buat`**. **Do not** silent-code. **Do not** re-implement print, inbox, P14 E, P12/P13, P15 chrome. Parked unless named: print S2 (`format=pdf`/WeasyPrint), inbox S2 (bounce/SES), P14 **G/H**, WAF **1147+**, inotify, Capacitor. Invoice v1 closed. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths/bank details. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: **do not** recommend Inbox, print, or P14 E (all shipped). Say the product-depth queue has **no default next code**; wait for a **named** slice + `buat`. Invoice v1 closed. **Do not** pitch GTM/AM/10 SIDs. **Do not** silent-code Guard Discover / bounce / WeasyPrint / WAF 1147+ / G/H.
4. Inbox files if asked: `backend/app/api/inbox_routes.py`, `backend/app/models/email_send_log.py` (`user_id`), `frontend/src/pages/Inbox.tsx`, `frontend/src/api/inbox.ts`, spec [`inbox-delivered-v1.md`](docs/specs/inbox-delivered-v1.md).
5. Print files if asked: `frontend/src/api/scans.ts` (`printFile`), `ScanDetail.tsx` (`export-print-executive`), `InvoicePrintSheet.tsx`, spec [`scan-pdf-invoice-print-v1.md`](docs/specs/scan-pdf-invoice-print-v1.md).
6. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`. Playwright ≠ enroll.
7. Older snapshots (including **2026-09-15 Billing empty**, **invoice tests / metering v3**, **invoice bank CI**, **SPA chrome**, **#733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
