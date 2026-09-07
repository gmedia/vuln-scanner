# Spec: CI selective tests (path + module)

**Status:** **S1 + S2 on `main`** (`#635`, `#637`). **S3** this PR (`feat/ci-selective-s3`). Human residual: required GitHub check **`ci-ok` only**.
**Goal:** Cut PR CI time without weakening merge/deploy gates (AuthZ, credits, Host Protect honesty, Guard IDOR).
**Epic:** engineering hygiene — **not** P14, Guard, Workspace, or GTM.
**Depends:** existing `.github/workflows/ci.yml` (name **CI/CD**); pytest fail-under **75** backend / **76** workers; Playwright serial chromium (`workers: 1`).
**Not this epic:** pytest `--lf` / `--testmon` as merge gate; lowering `fail-under`; parallel Playwright workers; mass-splitting 19 routers into 19 jobs; Dependabot auto-merge.

---

## 0) Why

Today every PR runs:

| Job | Scope |
|-----|--------|
| `python-tests` | matrix `backend`, `workers` — **full** `pytest tests/` + coverage XML (**fail-under in addopts**) |
| `python-lint` / `python-typecheck` | same matrix |
| `frontend-typecheck` / `frontend-unit-tests` / `frontend-lint` / `frontend-build` | full `tsc`, `vitest run` (**no** `--coverage` in CI), eslint, `npm run build` |
| `e2e-tests` | **needs all of the above**; Docker Compose full stack; **26** Playwright specs; timeout 40m |
| `docker-scan` | matrix 3 images + Trivy (continue-on-error) |
| `deploy` | **`main` only**; `needs` unit jobs **+ e2e** |

There is **no `paths:` filter**. Docs-only PRs still pay Compose + Playwright.

**Bottleneck:** E2E (compose + serial 26 specs), not pytest file count (61 + 21).

**GitHub trap:** a `skipped` job in `needs` **skips descendants**. If `deploy.needs` still lists `e2e-tests` and E2E is skipped, **production deploy never runs**. Any skip logic **must** add an aggregator job.

---

## 1) Invariants (non-negotiable)

1. **`push` to `main`, Sunday cron, and `workflow_dispatch` without skip flags** run the **full** suite as today (including full Playwright, full pytest both dirs, coverage fail-under).
2. **Do not** run a **subset of pytest files** on CI while `--cov-fail-under` remains in `backend/pyproject.toml` / `workers/pyproject.toml`. Partial collection **fails the job** or forces a weaker gate.
3. **Do not** change fail-under numbers in this epic.
4. Vitest CI (`npm test` → `vitest run`) has **no** coverage gate; subset is *technically* safe but **not S1**.
5. `deploy` must `needs` a **green aggregator**, never a possibly-skipped E2E job.
6. Frozen e2e testids stay: `user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, `guide-desktop-toc`.
7. Playwright ≠ Guard host enroll. No IPs/secrets in the spec or workflow comments beyond existing secret **names**.
8. **`skip_tests=true` ⇒ never deploy** (preserve today: skipped unit/e2e makes `deploy` skip). Aggregator must not invert this.
9. Path-filter **outputs are strings**. Job `if` must use `== 'true'` (bare `"false"` is truthy in GitHub Actions).
10. **Unknown paths fail-closed** → `always_full`. `docs_only` only if **every** changed file is docs/markdown.
11. **`push` to `main` empty diff** is **not** docs_only. `always_full` is an **event** bit first (`push`+`main`, `schedule`, `dispatch`, workflow/`Makefile` change, missing merge-base).
12. Required GitHub check after S1: **`ci-ok` only**. Per-matrix job names (`python-tests (backend)`) as required checks will **block docs-only PRs** when skipped.

---

## 2) Two filter layers (do not mix)

| Layer | What it skips | When |
|-------|----------------|------|
| **Package** (S1) | Entire **jobs** (python backend vs workers vs frontend vs e2e vs docker-scan dir) | PR paths |
| **Product module** (S2–S3) | Playwright `--grep` tags; optional Vitest globs | PR paths **after** S1 |

Pytest on a changed Python package = **always full `tests/` for that package**.

---

## 3) S1 — Path-filter jobs + `ci-ok` aggregator

### 3.1 Job `changes`

**Runs on every workflow event** (PR, `push`/`main`, schedule, dispatch). Do **not** `if: pull_request` only — downstream jobs `needs: [changes]`.

Use `dorny/paths-filter@v3` (PR files API) **or** `git diff --name-only origin/main...HEAD` with `fetch-depth: 0` (or enough history). Fallback: **missing merge-base (fork / shallow) → `always_full=true`**.

Compute `always_full` **before** interpreting an empty file list. On `push` to `main`, the diff vs `origin/main` is often **empty** — that must still be full suite.

Outputs (boolean):

| Output | Paths (inclusive) |
|--------|-------------------|
| `backend` | `backend/**` |
| `workers` | `workers/**` |
| `frontend` | `frontend/**` |
| `compose` | `docker-compose*.yml`, `.env.example`, `nginx/**`, `scripts/deploy*.sh`, `scripts/smoke-broker.sh`, root compose-related files |
| `packaging` | `packaging/**` |
| `ci` | `.github/workflows/**`, `Makefile` |
| `docs_only` | true iff **every** changed file matches `docs/**`, root `*.md`, `docs/content/**`, `SECURITY.md`, `README.md`, `handoff.md`, `AGENTS.md` — **and** `always_full` is false |
| `unknown` | any other path (`monitoring/**`, extra `scripts/*`, `.pre-commit-config.yaml`, `LICENSE`, `.dockerignore`, …) |

`always_full` =

```
github.ref == 'refs/heads/main'
|| github.event_name == 'schedule'
|| github.event_name == 'workflow_dispatch'
|| outputs.ci == 'true'
|| merge-base missing
|| outputs.unknown == 'true'
```

Unmapped files **must not** skip all jobs and green `ci-ok`.

### 3.2 Job `if` (in addition to existing `skip_tests` / `skip_build`)

Let `RUN_TESTS` = existing expression (`github.event_name != 'workflow_dispatch' || !inputs.skip_tests`) — this is a **run** predicate, not “skip is true”.

**Every filtered job:** `needs: [changes]`.

**S1 mandates split jobs** (not a shared `if` on the whole matrix with two rows): `python-tests-backend`, `python-tests-workers`, `python-lint-backend`, `python-lint-workers`, `python-typecheck-backend`, `python-typecheck-workers`, `docker-scan-backend`, `docker-scan-workers`, `docker-scan-frontend`. Keeps `ci-ok.needs` explicit.

If an implementer keeps one matrix job, there is **one** `if` combining `matrix.dir`:

```yaml
python-tests:
  needs: [changes]
  if: ${{ (github.event_name != 'workflow_dispatch' || !inputs.skip_tests)
          && (needs.changes.outputs.always_full == 'true'
              || needs.changes.outputs[matrix.dir] == 'true') }}
```

| Job | Run when |
|-----|----------|
| `python-tests-backend` | `RUN_TESTS` and (`always_full == 'true'` or `backend == 'true'`) |
| `python-tests-workers` | `RUN_TESTS` and (`always_full == 'true'` or `workers == 'true'`) |
| `python-lint-*` / `python-typecheck-*` | same per dir |
| `frontend-*` (4 jobs) | `RUN_TESTS` and (`always_full == 'true'` or `frontend == 'true'`) |
| `e2e-tests` | see §3.5 (not path-`if` alone — must survive skipped unit `needs`) |
| `docker-scan-*` | existing **skip_build** predicate (`event != dispatch \|\| !inputs.skip_build`) and (`always_full` or that dir or `compose`) |
| docs_only PR | test/lint/e2e/scan **skipped**; `changes` success; `ci-ok` **success** |
| `changes` **failure** | `ci-ok` **failure** (must `needs: [changes]` and fail on `needs.changes.result == 'failure'`) |

**S1 does not** skip backend pytest for SPA-only if `frontend/src/api/**` should later force backend — **deferred to S3**. S1: any `frontend/**` still skips python if `backend/**` unchanged. Host Protect honesty pytest is backend-only; **main** still always runs it via `always_full`.

### 3.3 Aggregator `ci-ok` (mandatory)

```yaml
ci-ok:
  name: ci-ok
  runs-on: ubuntu-latest
  needs:
    - changes
    - python-tests-backend
    - python-tests-workers
    - frontend-typecheck
    - frontend-unit-tests
    - frontend-build
    - python-lint-backend
    - python-lint-workers
    - python-typecheck-backend
    - python-typecheck-workers
    - frontend-lint
    - e2e-tests
  if: ${{ always() && !cancelled() }}
  steps:
    - name: Fail if any required job failed
      env:
        RESULTS: ${{ toJSON(needs) }}
      run: |
        python3 - <<'PY'
        import json, os, sys
        needs = json.loads(os.environ["RESULTS"])
        bad = []
        for name, body in needs.items():
            r = body.get("result")
            if r not in ("success", "skipped"):
                bad.append(f"{name}={r}")
        if bad:
            print("ci-ok fail:", ", ".join(bad))
            sys.exit(1)
        PY
```

`docker-scan-*` stays **out of** `ci-ok` (Trivy `continue-on-error`; deploy does not need scan). Do not newly block deploy on Trivy.

**Do not** put `if: always()` on `deploy`.

### 3.4 `deploy`

Keep today’s event gate **and** require tests actually ran when dispatching:

```yaml
deploy:
  needs: [ci-ok]
  if: ${{ github.ref_name == 'main'
          && needs.ci-ok.result == 'success'
          && (github.event_name == 'push'
              || (github.event_name == 'workflow_dispatch'
                  && !inputs.skip_deploy
                  && !inputs.skip_tests)) }}
```

- `schedule` (Sunday cron): **full suite, no deploy** (unchanged).
- `skip_tests=true`: **never deploy** even if `ci-ok` is green from skips.
- `push` to `main`: deploy only if `ci-ok` success (full suite via `always_full`).

Remove the long `needs` list of unit + e2e jobs.

### 3.5 `e2e-tests.needs`

Today E2E `needs` all unit/lint jobs (ci.yml ~L180). After S1, SPA-only skips python; backend-only skips frontend jobs. Default GHA: a **skipped** need **skips E2E** even if the path `if` is true.

**Required:** keep E2E **after** unit (do not waste 40m compose on red pytest) **and**:

```yaml
e2e-tests:
  needs: [changes, python-tests-backend, python-tests-workers, frontend-typecheck, frontend-unit-tests, frontend-build, python-lint-backend, python-lint-workers, python-typecheck-backend, python-typecheck-workers, frontend-lint]
  if: ${{
    always()
    && !cancelled()
    && (github.event_name != 'workflow_dispatch' || !inputs.skip_tests)
    && (needs.changes.outputs.always_full == 'true'
        || needs.changes.outputs.frontend == 'true'
        || needs.changes.outputs.backend == 'true'
        || needs.changes.outputs.workers == 'true'
        || needs.changes.outputs.compose == 'true'
        || needs.changes.outputs.packaging == 'true')
    && (needs.python-tests-backend.result == 'success' || needs.python-tests-backend.result == 'skipped')
    && (needs.python-tests-workers.result == 'success' || needs.python-tests-workers.result == 'skipped')
    && (needs.frontend-typecheck.result == 'success' || needs.frontend-typecheck.result == 'skipped')
    && (needs.frontend-unit-tests.result == 'success' || needs.frontend-unit-tests.result == 'skipped')
    && (needs.frontend-build.result == 'success' || needs.frontend-build.result == 'skipped')
    && (needs.python-lint-backend.result == 'success' || needs.python-lint-backend.result == 'skipped')
    && (needs.python-lint-workers.result == 'success' || needs.python-lint-workers.result == 'skipped')
    && (needs.python-typecheck-backend.result == 'success' || needs.python-typecheck-backend.result == 'skipped')
    && (needs.python-typecheck-workers.result == 'success' || needs.python-typecheck-workers.result == 'skipped')
    && (needs.frontend-lint.result == 'success' || needs.frontend-lint.result == 'skipped')
  }}
```

If **any** needed unit job is `failure` or `cancelled`, the conjunction is false → E2E skipped → `ci-ok` sees `e2e-tests=skipped` **and** the failed unit `failure` → `ci-ok` fails. Docs-only: path clause false → E2E skipped → units skipped → `ci-ok` success.

### 3.6 S1 files

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | `changes`, per-job `if`, `ci-ok`, `deploy.needs` |
| `docs/specs/ci-selective-tests.md` | this file; mark S1 shipped when merged |
| **Not** `backend/pyproject.toml` fail-under | |

No new npm/pip dependencies except the GitHub Action `dorny/paths-filter` (pin major v3).

### 3.7 S1 DoD

- [ ] Docs-only PR: `changes` + `ci-ok` green; pytest/e2e/docker-scan skipped; **no** deploy (not `main`).
- [ ] PR `frontend/src/pages/...` only: frontend jobs + e2e; python jobs skipped; `ci-ok` green if those pass.
- [ ] PR `backend/app/...` only: python **backend** + e2e; workers skipped.
- [ ] PR `workers/**` only: workers pytest/lint/type + e2e; backend python skipped.
- [ ] Merge to `main`: **all** jobs run; `deploy` needs **only** `ci-ok`.
- [ ] Workflow file change (`ci`): `always_full`.
- [ ] Fork / missing merge-base: `always_full`.
- [ ] Existing `workflow_dispatch` skip_* flags still work; **`skip_tests` never deploys**.
- [ ] `changes` failure fails `ci-ok`.
- [ ] Unmapped path (e.g. `monitoring/**`) → `always_full`, not silent skip.
- [ ] Branch protection: required check is **`ci-ok`** (document in PR; human may need to update repo Settings — agents cannot always do this).
- [ ] `push` to `main` with empty path diff still runs **full** suite then deploy (if `ci-ok` green).

---

## 4) S2 — Playwright smoke vs module tags

**Shipped** on `main` (`#637`). Do not start S3 until named.

### 4.1 Tags

Add a **single** product tag plus optional `@smoke` on specs. Do **not** invent 19 tags.

| Tag | Specs (current filenames — adjust if renamed) |
|-----|-----------------------------------------------|
| `@smoke` | `auth-flow`, `dashboard`, `navigation`, `landing` (subset of tests **inside** file if needed), plus any test that asserts frozen testids |
| `@scan` | `ip-scanner*`, `domain-scanner*`, `mobile-scanner*`, `scan-detail`, `scan-lifecycle`, `export` |
| `@guard` | `guard.spec.ts` |
| `@siem` | `siem.spec.ts` |
| `@uptime` | `uptime.spec.ts` |
| `@ai` | `ai.spec.ts` |
| `@admin` | `admin.spec.ts`, `admin-users`, `admin-user-detail` |
| `@shell` | `profile`, `credit-history`, `not-found`, `verify-email`, `forgot-password`, `reset-password`, `landing` |

A spec may have `@smoke` **and** `@scan`.

### 4.2 PR vs main

| Event | Command |
|-------|---------|
| PR and not `always_full` | `npx playwright test --grep '@smoke|@<tags for changed modules>'` |
| `main` / schedule / dispatch / `ci` / `compose` / `packaging` / `backend` **or** `workers` **or** `frontend` with **no** module map hit | **full** `npx playwright test` (S2 conservative default: if `frontend` or `backend` or `workers` changed **and** module detection is incomplete → **full** E2E) |

**S2 conservative rule (wins over the PR command table if they conflict):**

- Docs-only: E2E still skipped (S1). Compose is **not** started.
- Product PR: `--grep` quoted YAML string; include `@smoke` **or** `--pass-with-no-tests`. Unquoted `|` is a pipe.
- Unknown frontend/backend/workers map (ui kit, AppShell, locales, `global-setup.ts`, `playwright.config.ts`) → **full** Playwright.
- `core` true → **full** E2E. Root globs `auth*` / `org*` **forbidden** (over-match). Use rooted paths (`backend/app/api/auth_routes.py`, …).
- `main` / schedule / dispatch: full, no grep.
- Compose + `global-setup.ts` **still run** whenever E2E job runs; grep only cuts spec time, not stack boot.
- Frozen testids: several are **not** in current e2e (`org-switcher*`, `export-executive`, `rescan-button`, `guide-desktop-toc`). S2 DoD must **add assertions** or **drop them from the smoke claim** — tagging files is not enough. `user-menu` lives in `auth-flow.spec.ts`; `guard-state` in `guard.spec.ts` (tag `@guard` + put `@smoke` only if we accept Guard UI in every PR smoke).
- No Host Protect Playwright; no Guard enroll in CI.

### 4.3 Module path map (S2 — E2E only)

Keep the map in **one** YAML fragment in the workflow **or** `.github/ci-module-filters.yml` consumed by `dorny/paths-filter` extra filters.

| Module | Path globs (minimum) |
|--------|----------------------|
| `scan` | `backend/app/api/scan_routes.py`, `schedule_routes.py`, `backend/app/services/scanner.py`, `schedule.py`, `frontend/src/pages/{Ip,Domain,Mobile,Scan,Schedules}*`, `frontend/e2e/*scanner*`, `frontend/e2e/scan-*`, `frontend/e2e/export.spec.ts`, `workers/tasks/*scan*` |
| `guard` | `backend/app/**/guard*`, `frontend/src/pages/Guard.tsx`, `frontend/e2e/guard.spec.ts` |
| `host` | `backend/app/**/host*`, `packaging/**`, `frontend/src/pages/HostProtect.tsx` — **no dedicated e2e today**; PR still runs `@smoke` only unless we add a spec later |
| `siem` | `backend/app/**/siem*`, `frontend/src/pages/Siem.tsx`, `frontend/e2e/siem.spec.ts` |
| `uptime` | `backend/app/**/uptime*`, `status_page*`, `frontend/src/pages/{Uptime,StatusPage}*`, `frontend/e2e/uptime.spec.ts` |
| `ai` | `backend/app/**/ai*`, `openai_v1*`, `frontend/src/pages/**/Ai*`, `frontend/e2e/ai.spec.ts` |
| `admin` | `backend/app/api/admin_routes.py`, `frontend/src/pages/admin/**`, `frontend/e2e/admin*.spec.ts` |
| `core` | `auth*`, `org*`, `credit*`, `middleware`, `app/main.py`, `app/api/router.py`, `app/services/auth.py`, `organization.py` — **forces full E2E + already full pytest** |

If `core` is true → Playwright **full** (not only smoke).

### 4.4 S2 files

| File | Change |
|------|--------|
| `frontend/e2e/*.spec.ts` | `test.describe.configure` or `test(..., { tag: ['@scan'] })` — Playwright **tag** in title ` @scan` **or** native `tag` (Playwright 1.42+). Prefer **title suffix** `@scan` if current `@playwright/test` in lockfile is old; verify version in S2. |
| `.github/workflows/ci.yml` | grep expression from `changes` outputs |
| this spec | S2 shipped (`#637`) |

### 4.5 S2 DoD

- [x] `main` still runs 26 specs (no grep) — `e2e_full` on `always_full`.
- [x] PR module map + `--grep` (quoted `|`); incomplete map → full E2E.
- [x] `auth_routes.py` / `mod_core` → **full** E2E.
- [x] Frozen testids in `@smoke` except `guard-state` (`@guard` only).
- [x] No change to pytest collection.

---

## 5) S3 — Optional Vitest globs + SPA-api → backend

**Shipped** (this slice). S2 was already on `main`.

- Vitest: `npx vitest run src/test/<Page>.test.*` when the PR only touches matching `frontend/src/pages/**` and/or those test files. Existing files only (`--` skip missing stems).
- If PR touches `components/ui`, `components/layout`, `locales`, `store`, `App.tsx`/`main.tsx`, `vitest.config.ts`, `package.json`/`lock`, or `src/test/setup.ts` → full `npm test`.
- If PR touches `frontend/src/api/**` → set `spa_api` and run **python-tests-backend** (full pytest that package; no file subset). Also full Vitest (client contract).
- `always_full` / `main` / schedule / dispatch: full `npm test`.
- Still **no** pytest file subset.

---

## 6) Explicitly out of scope

- `pytest tests/test_host_waf.py` on CI merge gate.
- `--cov-fail-under` only on `main`.
- nx / turbo / pytest-testmon / vitest `--changed`.
- Skipping E2E when `backend` models change.
- Putting WAF on `sinexis.app` edge (unrelated; do not touch nginx product conf in this epic).
- Guard lab workflow (`guard-lab-enroll-smoke.yml`) — leave manual.

---

## 7) Implementation slices (`buat` one at a time)

| Slice | Verb | PR title idea |
|-------|------|----------------|
| **S1** | `buat S1` | `ci: path-filter jobs and ci-ok aggregator` |
| **S2** | `buat S2` | `ci: Playwright smoke and module tags on PRs` |
| **S3** | `buat S3` | `ci: vitest globs and api path forces backend tests` |

Default if user says only `buat` after this spec: **S1 only** (done). **S3** named and implemented. No further CI slice in this epic.

---

## 8) Risks

| Risk | Mitigation |
|------|------------|
| Deploy with **zero tests** | `skip_tests` in deploy `if`; `always_full` on `push`/`main`; unknown paths fail-closed; `ci-ok` needs `changes` |
| `deploy` never runs | `needs: [ci-ok]` only; no `always()` on deploy; required check = `ci-ok` |
| `"false"` truthy | always `== 'true'` |
| Matrix `if` + skipped | **Split jobs** in S1 |
| `dorny/paths-filter` vs shallow clone | Action PR API or `fetch-depth: 0`; `always_full` on failure |
| Module map rot | S2: `core` + unknown → full E2E |
| Agents skip tests locally | Unchanged `make test`; this spec is **CI only** |
| First S1 merge **deploys** | Expected if `ci-ok` green on `main`; no dry-run flag (same as today) |

---

## 9) Related

- Workflow: `.github/workflows/ci.yml`
- Coverage: `backend/pyproject.toml`, `workers/pyproject.toml`, `frontend/vitest.config.ts` (CI vitest **without** coverage)
- Playwright: `frontend/playwright.config.ts`
- Product priority: `docs/AGENT_EXECUTION_GUIDE.md` (do not reorder epics)

---

*S0 draft for agent implementation. Code/commits/PR: English. User chat: Bahasa Indonesia.*
