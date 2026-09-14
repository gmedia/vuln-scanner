# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / `fix` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-14 — invoice bank CI + quoting)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`843eed77`** (`fix: SPA visual QA recapture — 2k density and mobile fold` **#760**) or newer. Invoice bank env + quoting is on this tip via **#755** + **#759**. Do **not** SSH Alembic after a green `main` deploy. |
| **This session** | User asked CI to inject `INVOICE_BANK_*` into prod `.env` (empty GitHub secret must not wipe host). Then `main` deploy failed: `append_if_set` wrote unquoted values; `deploy.sh` sources `.env`; a holder name with spaces became `command not found` (exit 127). Fix: quote + escape `\`, `"`, `$`, backtick in `append_if_set`. User confirmed **#759** merged, CI green including **deploy**. Follow-up: deleted leftover local `feat/ci-invoice-bank-env` / `fix/quote-env-append-if-set`; pytest `tests/test_invoices.py` 9/9; vitest AdminInvoices + WorkspaceSettings green. **Never** put real account numbers / holder names in git. |
| **Invoice product** | **#749** I1–I10 shipped. Bank copy only on `sent` invoices (`bank_copy()` in `backend/app/services/invoice.py`). Customer surface: Workspace Billing card (`WorkspaceSettings.tsx`). Admin invoices SPA does **not** render bank copy. Empty env → API still returns `bank` with all-null fields; SPA shows `"—"`. |
| **Open PRs** | Boot: `gh pr list --state open --assignee @me`. Dependabot: **do not mass-merge**. |
| **Still human** | **GTM** (finance `service_id`, AM wave-1, pilot #1); Host invoice `service_id`; fill `/admin/hpp` `hostscan`; Demo-ok narrative. **Invoice bank smoke:** open a `sent` invoice in Workspace Billing — copy must show bank name/account/holder, not `"—"`. If dashes: GitHub **production** environment secrets missing (not a code bug). Guide **§1.3 P0** + **§7 “lanjut”**. |
| **Engineering default** | Invoice v1 is **closed** as engineering. **Do not** re-implement P12/P13. **Do not** start WAF **1147+**, P14 **G/H**, pack-widen, or YARA/Clam code unless named + `buat`. Optional chore (only if named): tick metering-v3 spec DoD (`docs/specs/metering-v3-sku-seats.md` — code #742–#744 shipped, checkboxes still `[ ]`). Speak **Bahasa Indonesia**. Prefix git **`GIT_MASTER=1`**. Never work on `main`. Never print tokens/IPs/customer paths/bank details. Never commit `.omo/` or screenshot PNGs. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. CI green on **your** PRs → squash-merge then delete branch. **Do not poll CI.** Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**. Guide **wins** on epic order vs this stub.
3. If user says **“lanjut”** without a named slice: report **GTM / HPP / invoice bank smoke** still human; **do not** silent-code WAF/YARA/G/H or more list pages. Invoice I9 is shipped — do **not** re-open bank env CI unless deploy is red again.
4. Invoice files if asked: `backend/app/services/invoice.py` (`bank_copy`), `backend/app/config.py` (`invoice_bank_*`), `.github/workflows/ci.yml` (`append_if_set`), `frontend/src/pages/WorkspaceSettings.tsx` (Billing card), spec [`docs/specs/sinexis-invoice-v1.md`](docs/specs/sinexis-invoice-v1.md).
5. Host WAF live lab (only if asked again): leftover `lab-host-waf-fixture` `DELETE /api/host/sites` first; `HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1`; `HOST_WAF_LAB_VHOST_SSH=tc5`; `./scripts/host-waf-lab-smoke.sh --apply-vhost`; include packed snippet on **lab vhost**; `sudo nginx -t`. Standing permission **2026-08-26** is **Guard enroll/unenroll** (wipe `tc5` first, guide **§4.1**), not a blank cheque to keep applying vhosts. **Never** wipe `sx-erpstg`. Playwright ≠ enroll.
6. Older snapshots (including **2026-09-13 SPA chrome** and **2026-09-11 #733 / tc5**): [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
