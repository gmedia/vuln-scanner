# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`sinexis.app`** (public DNS; legacy `vs.appmedia.id` may still exist). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-09-09 — #716 merged; docs status)

| Item | State |
|------|--------|
| **`main` tip** | Re-`git pull`. Expect **`7028542b`** (`feat/host engine honest yara clam` **#716**) or newer. |
| **Host Protect engines** | **Shipped.** `engine=yara` only after batched `yara -w` on original pack; else `needles`. `clamdscan` down → one `clamscan`; Clam POST **adds** `hit_count`. Spek [`host-protect-clam-yara-real.md`](docs/specs/host-protect-clam-yara-real.md) status **implemented**. Lab Clam on **tc5** = **ops residual**, not another code epic. |
| **P13 Host WAF** | **S0–S5 + starter through 1146** on `main` (**#708**). DL0–DL3 shipped. **Do not** default to WAF **1147+**. Never paste onto `sinexis.app` edge. |
| **Open PRs** | Human/CI: **#722** footer, **#723** admin email pagination. Dependabot: **do not mass-merge**. |
| **Still human** | GTM; Host invoice `service_id`; `/admin/hpp`; Demo-ok on tc5. |
| **Engineering default** | **Do not** re-implement P12/P13. Next code only if named + `buat` (P14 **G/H** parked; pack-widen parked). Speak **Bahasa Indonesia**. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull`. `gh pr list --state open --assignee @me`. **Do not poll CI.**
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** then **`AGENTS.md`**.
3. Older session snapshots: [`docs/archive/handoff-session-snapshots-2026-09.md`](docs/archive/handoff-session-snapshots-2026-09.md). Stuck-job notes: [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md).
