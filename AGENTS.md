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

---

# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-03  
**Commit:** 192d7ee  
**Branch:** main  

Child maps: [`backend/AGENTS.md`](backend/AGENTS.md) · [`frontend/AGENTS.md`](frontend/AGENTS.md) · [`workers/AGENTS.md`](workers/AGENTS.md) · [`scripts/AGENTS.md`](scripts/AGENTS.md)

## OVERVIEW

Sinexis/VulnScanner: FastAPI + Celery + Vite SPA Docker stack. Scan attach SaaS with Workspace, Guard (Wazuh thin), SIEM/Uptime flags, Host Protect/WAF. Three deployable roots — not a Python/npm workspace.

## STRUCTURE

```
./
├── backend/          # FastAPI; Alembic here only
├── workers/          # Sibling Celery (not backend/celery)
├── frontend/         # Vite React SPA
├── nginx/            # Local compose proxy; prod = host nginx
├── packaging/        # host-protect-helper Debian (customer box)
├── scripts/          # deploy*.sh — prefer deploy-services.sh
├── docs/             # AGENT_EXECUTION_GUIDE wins vs handoff.md
├── monitoring/       # scrape/alert templates only
└── docker-compose*.yml
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| REST / HTML islands | `backend/app/api/` | `/blog` `/legal` `/status` are FastAPI, not Vite |
| Enqueue scans | `backend/app/services/scanner.py` | Not the nmap engine |
| Scan engines | `workers/tasks/{ip,domain,mobile}_scan.py` | |
| SPA pages | `frontend/src/pages/` | |
| shadcn kit | `frontend/src/components/ui/` | Do not restyle for one screenshot |
| Product priority | `docs/AGENT_EXECUTION_GUIDE.md` | Beats `handoff.md` |
| User URLs | `docs/AGENT_PAGE_REGISTRY.md` | |
| Specs | `docs/specs/*.md` | |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `app` | FastAPI | `backend/app/main.py` | API + HTML islands |
| `api_router` | APIRouter | `backend/app/api/router.py` | Mounts feature routers |
| Celery `vuln_scanner` | Celery | `workers/celery_app.py` | Real workers; API has thin clients |
| SPA | `main.tsx` | `frontend/src/main.tsx` | Vite 5173; prod host 5174 |

## CONVENTIONS

- Ruff line 120, py312; mypy strict (tests/alembic excluded).
- Pytest cov fail-under **75** backend / **76** workers. Vitest 75/70.
- Node **>=24**. Prefix git: `GIT_MASTER=1`.
- Vite proxy → `http://backend:8000` (Docker DNS).
- Feature flags: `SIEM_ENABLED` compose default false; Host Protect/WAF prod true, local/CI false.

## ANTI-PATTERNS (THIS PROJECT)

- Mix Guard/Wazuh with Workspace epic; SIEM under Guard PR; Discover on `/guard`.
- Mock Host Protect hits; paste WAF on `sinexis.app` edge; Imunify-clone PRs.
- SSH Alembic after green `main` deploy; `deploy.sh` for routine (wipes volumes).
- Native `<select>` / primary native `<button>`; second color palette.
- Secrets/hosts/PII in tracked markdown.

## COMMANDS

```bash
make install-dev && make lint && make test
cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000
cd workers && celery -A celery_app worker -Q ip_scan --loglevel=info
cd frontend && npm run dev
# routine prod: scripts/deploy-services.sh  (not deploy.sh)
```

## NOTES

- Duplicate Celery apps in backend services talk Redis; canonical app is `workers/celery_app.py`.
- Extra tasks (guard, host_protect, schedules) often ride `ip_scan`.
- Playwright ≠ Guard enroll. Wipe `tc5` first for live lab.
