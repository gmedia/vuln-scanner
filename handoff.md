# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-14 — invoice tests + metering v3 spec)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`57ed3d05`** (`docs: mark metering v3 spec shipped` **#764**) or newer. Invoice bank env + quoting already on this tip via **#755** + **#759**. Do **not** SSH Alembic after a green `main` deploy. |
| **This session** | After user confirmed **#759** merged + CI/`deploy` green: (1) pytest + vitest for I9 `bank_copy` empty vs set, send includes bank, draft does not; Workspace Billing `sent` / dashes / hidden on draft — **#763**. Fictional strings only. (2) Metering v3 spec + guide Phase B: **shipped** (#742–#744 already on `main`; DoD ticked) — **#764**. User confirmed both merged, `main` CI green. Local leftover invoice CI branches already deleted earlier. **Never** put real account numbers / holder names in git. |
| **Invoice product** | **#749** I1–I10 shipped. Bank copy only on `sent` invoices (`bank_copy()` in `backend/app/services/invoice.py`). Customer surface: Workspace Billing card (`WorkspaceSettings.tsx`). Admin invoices SPA does **not** render bank copy. Empty env → API still returns `bank` with all-null fields; SPA shows `"—"`. Tests: `backend/tests/test_invoices.py`, `frontend/src/test/WorkspaceSettings.test.tsx`. |
| **Metering v3** | **Shipped.** Spec [`docs/specs/metering-v3-sku-seats.md`](docs/specs/metering-v3-sku-seats.md) DoD all `[x]`. Scan/Host/Uptime = SKU seats; `credit_cost = 0`; no Scan credit debit. AI IDR wallet stays. **Do not** re-open Scan credit debit. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human** | **GTM** (finance `service_id`, AM wave-1, pilot #1); Host invoice `service_id`; fill `/admin/hpp` `hostscan`; Demo-ok narrative. **Invoice bank smoke:** open a `sent` invoice in Workspace Billing — copy must show bank name/account/holder, not `"—"`. If dashes: GitHub **production** environment secrets missing (not a code bug). Guide **§1.3 P0** + **§7 “lanjut”**. |
| **Engineering default** | Invoice v1 and metering v3 spec hygiene are **closed**. **Do not** re-implement P12/P13. **Do not** start WAF **1147+**, P14 **G/H**, pack-widen, or YARA/Clam code unless named + `buat`. Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths/bank details. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: report **GTM / HPP / invoice bank smoke** still human; **do not** silent-code WAF/YARA/G/H or more list pages. Invoice I9 and metering v3 docs are shipped — do **not** re-open bank env CI unless deploy is red again.
4. Invoice files if asked: `backend/app/services/invoice.py` (`bank_copy`), `backend/app/config.py` (`invoice_bank_*`), `.github/workflows/ci.yml` (`append_if_set`), `frontend/src/pages/WorkspaceSettings.tsx` (Billing card), spec [`docs/specs/sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md).
5. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`. Playwright ≠ enroll.
6. Older snapshots (including **2026-09-14 invoice bank CI**, **2026-09-13 SPA chrome**, **2026-09-11 #733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
