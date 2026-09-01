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

## CI deploy vs Alembic (do not confuse)

When **`main` CI is green including the `deploy` job**, production already ran **`scripts/deploy.sh`**, which **`git pull`s `main`**, rebuilds, and **`docker exec vuln-backend alembic upgrade head`**. That is the prod migration path.

- **Do not** tell the user to SSH and run Alembic “next” after a successful `main` deploy. Schema for that SHA (e.g. `hpp_rates`) is already applied if deploy succeeded.
- **Do not** treat “CI green” as tests-only: on `push` to `main`, workflow **CI/CD** includes **deploy** (unless `workflow_dispatch` `skip_deploy`).
- Residual after deploy is **product/ops** (fill HPP rates in `/admin/hpp`, GTM, live SSL/SMTP smoke) — not a second migration.
- Manual Alembic only if **deploy failed**, user asked for a **host without CI**, or they used **`deploy-services.sh --skip-migrate`**. Prefer `deploy-services.sh` (non-destructive) for routine app deploys; it also migrates when `backend` is in the service list and `--skip-migrate` is unset.
- Never print deploy hosts, SSH ports, or secrets.
- Human ops: [`docs/deploy.md`](docs/deploy.md).

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

## Design system (MANDATORY)

Public marketing and in-app SPA share **one visual family**. Detail: `docs/AGENT_EXECUTION_GUIDE.md` §11 and `docs/specs/shadcn-ui-migration.md`.

1. **Tokens** — copy `frontend/src/index.css` `:root` (`--background`, `--foreground`, `--primary` `hsl(142 71% 45%)`, `--border`, `--muted-foreground`). Do not invent a second palette (no `#0a7`, no Palatino-as-brand).
2. **Public HTML islands** (`/blog`, future `/legal`, …) — **Landing chrome**, not a separate “editorial” skin: `h-12` header, BrandMark (`SINE` + `XIS` accent + crosshair), `max-w-6xl` / `2xl:max-w-[90rem]`, footer line + Sign in / Get started. Island stays FastAPI HTML (SEO); CSS must **rhyme** Landing, not Palatino briefing.
3. **SPA pages** (dashboard, admin, auth) — primitives in `frontend/src/components/ui/` only. **No** native `<select>` (eslint `no-restricted-syntax`; use `Select`). **No** native `<button>` for primary actions (use `Button`). Allowed native `<button>`: icon toggles (show password) and full-width list/card rows. Unlabeled inputs forbidden. New forms: `Label` + `Input`/`Textarea`/`Select`.
   **Filter bars** (search/date/select rows): copy Credit History — equal `gap-3` grid, each field `flex min-w-0 flex-col gap-1.5`, controls `h-10 min-h-10`. `DatePicker`/`DateTimePicker` trigger chrome = `border-border bg-input` (same as `Input`). Do **not** use uneven `grid-cols-12` spans or a far-right Apply with empty gutter. Reference: `frontend/src/pages/credit/CreditHistory.tsx`.
4. **Do not** restyle kit files to match one screenshot. Frozen e2e testids stay.
