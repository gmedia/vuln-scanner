# VulnScanner — Agent Workflow Rules

## Platform
- **GitHub**: `gh` CLI. Remote: `gmedia/vuln-scanner`. Single branch: `main`.

## Product / session continuity (MANDATORY after OpenCode reset)
- Read **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)** before feature work.
- **Full prod e2e + Guard enroll/unenroll:** wipe lab agent `tc5` (and leftover Manager/`guard_agents` smoke rows) **first**. See guide **§4.1**. Playwright ≠ host enroll.
- **Standing permission (user, 2026-08-26):** agents **may execute Guard live lab** (wipe `tc5` → Manager cleanup from `tc1` → enroll/unenroll/sync) **without asking again**. Still: wipe-first §4.1; never print tokens/keys/IPs; never commit secrets; `GUARD_LAB_ALLOW_PUBLIC_PROD=1` on public origin; Playwright ≠ enroll. **Revoke only if the user says so.**
- North star: **Sinexis** — security attach (upsell on colo/VPS + hospitality beachhead); repo still ships as VulnScanner scan SaaS.
- Build order (detail in guide **§1.3**): **P0 SKU lock → P1 Scan Attach Loop → P2 Workspace → P3 assets → P4 soft rebrand → P5 Guard (Wazuh thin)**. Do not implement Guard/Wazuh in the same epic as Workspace; do not block upsell attach on rebrand.
- Speak **Bahasa Indonesia** with the user unless they switch language.
- Prefix every git command with `GIT_MASTER=1`.
- Root **`handoff.md` is a stub + pointer** (archived stuck-job notes under `docs/archive/`). Not the product backlog; **`docs/AGENT_EXECUTION_GUIDE.md` wins** on priority.
- **Public repo hygiene:** never put production SSH hosts/ports, personal emails, real passwords, API keys, or customer/finance dumps in `*.md` or other tracked files. Use env vars and private ops notes instead.

## Session Start (MANDATORY)
```
gh pr list --state open --assignee @me
```
- CI green → `gh pr merge --squash` → `git branch -d <branch>`
- CI red → `git checkout <branch>` → fix → push
- Then: `git checkout main && git pull`, confirm tip, open `docs/AGENT_EXECUTION_GUIDE.md`

## Branch & Commit Rules
- **Every task = own branch**: `feat/<desc>` or `fix/<desc>` from latest `main`
- **NEVER work on main**
- **Commits**: conventional format — `feat:`, `fix:`, `refactor:`, `test:`, `style:`, `chore:`
- Push immediately after each commit. **NEVER wait for CI.**

## Workflow
1. `git checkout main && git pull`
2. `git checkout -b feat/<desc>` (or `fix/<desc>`)
3. Work with incremental commits
4. Push branch: `git push -u origin HEAD`
5. Create PR: `gh pr create --fill`
6. **Move to next task immediately** — do not poll CI

## PR Handoff Template
Every PR description must include:
```markdown
## What
- [change 1]
- [change 2]

## Files changed
- `path/file.ts` — [why]

## Next steps
- [ ] [follow-up if any]
```

## Anti-patterns
- Working on `main` branch
- Waiting/polling for CI/CD
- Multiple unrelated tasks in one PR
- Empty PR descriptions
- Force-push to shared branches
