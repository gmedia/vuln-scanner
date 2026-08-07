# VulnScanner — Agent Workflow Rules

## Platform
- **GitHub**: `gh` CLI. Remote: `gmedia/vuln-scanner`. Single branch: `main`.

## Product / session continuity (MANDATORY after OpenCode reset)
- Read **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)** before feature work.
- North star: **Sinexis** (hospitality security platform); repo still ships as VulnScanner scan SaaS.
- Build order: **Workspace (org+members) → soft rebrand → Guard (Wazuh thin)**. Do not implement Guard/Wazuh in the same epic as Workspace.
- Speak **Bahasa Indonesia** with the user unless they switch language.
- Prefix every git command with `GIT_MASTER=1`.

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
