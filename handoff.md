# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.3.1** product-depth queue — **not** GTM).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section. **Do not** answer “lanjut” with AM/sales checklists.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-15 — owner lock: product depth, not GTM)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`f74a0ce2`** (`fix: stop showing generic vulnerability titles on mobile findings` **#776**) or newer. Invoice compose env **#769** is on this tip. Do **not** SSH Alembic after a green `main` deploy. |
| **This session** | Owner corrected agents: **do not** recommend AM/sales/GTM as next work. Chat user = **product**. Default queue: guide **§1.3.1**. Invoice v1 **pay loop closed on prod** (user confirmed earlier). **Never** put real account numbers / holder names in git. Nearby SPA: Uptime sheet **#767/#770/#773**, status incident **#771**, Guide TOC **#772**, OSV/mobile titles **#774/#776**. |
| **Invoice product** | **#749** I1–I10 shipped. I9 bank copy: CI `append_if_set` (**#755**) + quoted values (**#759**) + **compose `backend.environment`** (**#769**). Customer surface: Workspace Billing. Admin: `/admin/invoices`. Send = status flip, not email. **Mark paid** applies `org.sku`. Empty env still renders `"—"` (intentional). Spec [`docs/specs/sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md). |
| **Metering v3** | **Shipped** (#742–#744, spec DoD **#764**). Scan/Host/Uptime = SKU seats; `credit_cost = 0`. AI IDR wallet stays. **Do not** re-open Scan credit debit. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human (off-repo)** | GTM / Host `service_id` / `/admin/hpp` `hostscan` exist as **AM/finance** checklists. **Do not** lead the session with them. Invoice smoke is **done** — do **not** treat bank dashes as open. |
| **Engineering default** | **§1.3.1:** Uptime advanced + **P15 S1–S9** **shipped** (S2 AppShell **#704**). Recommend **Scan PDF / invoice HTML print** — wait for `buat` (needs S0). Invoice v1 closed: **no** upgrade CTA / pay button / auto-create on signup / gateway. **Do not** re-implement P12/P13 or P15 chrome. **Do not** start WAF **1147+**, P14 **G/H**, pack-widen, or YARA/Clam unless named + `buat`. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths/bank details. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: recommend guide **§1.3.1** (default **Scan PDF / invoice HTML print**, needs S0); P15 S1–S9 + Uptime advanced are **shipped**; wait for `buat`. Invoice v1 pay loop is **closed**. **Do not** pitch GTM/AM/10 SIDs. **Do not** silent-code WAF/YARA/G/H or more list pages. Do **not** re-open bank env CI / compose `INVOICE_BANK_*` unless deploy is red or bank copy is dashes again.
4. Invoice files if asked: `backend/app/services/invoice.py` (`bank_copy`), `backend/app/config.py` (`invoice_bank_*`), `.github/workflows/ci.yml` (`append_if_set`), `docker-compose.prod.yml` / `docker-compose.yml` (`INVOICE_BANK_*` on **backend**), `frontend/src/pages/WorkspaceSettings.tsx`, `frontend/src/pages/admin/AdminInvoices.tsx`, spec [`docs/specs/sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md).
5. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`. Playwright ≠ enroll.
6. Older snapshots (including **2026-09-15 Billing empty**, **invoice tests / metering v3**, **invoice bank CI**, **SPA chrome**, **#733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
