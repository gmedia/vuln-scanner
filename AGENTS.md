# VulnScanner — Agent Workflow Rules

## Platform
- **GitHub**: `gh` CLI. Remote: `gmedia/vuln-scanner`. Single branch: `main`.

## Session Start (MANDATORY)
```
gh pr list --state open --assignee @me
```
- CI green → `gh pr merge --squash` → `git branch -d <branch>`
- CI red → `git checkout <branch>` → fix → push

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
