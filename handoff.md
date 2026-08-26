# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`vs.appmedia.id`** (public DNS). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-08-26 — blog + schedules UI; refresh against `main`)

| Item | State |
|------|--------|
| **`main` tip (coding)** | Re-`git pull`. Tip **`b6cac21`** = **#417** `PageLoading` skeleton. Also on main: **#411–#416** public blog (design system, layperson series, dark island, duplicate dek, language/theme clip+height, reading-list cards) |
| **Recent merges (visual)** | **#403–#406** as before · **#411** blog Landing chrome · **#415** Language/Theme `overflow-hidden` + `h-11` · **#416** blog cards · **#417** `PageLoading` in `PageBoundary`. **Do not** recapture unprompted |
| **Recent merges (i18n)** | **#367–#373** |
| **Recent merges (theme / grok2api chrome)** | **#374–#378** + **#405**. `THEME_STORAGE_KEY=sinexis.theme`, default **dark**. **Keep** `--primary` `hsl(142 71% 45%)`. Header is **`h-12`** after #405 (wave9 `h-14` was later overridden — do **not** revert to `h-14` unless user asks) |
| **Theme DoD (user)** | Closer to grok2api **surface**. **Out:** invert CTA BW; clone Models/Keys; grok2api sidebar IA; commit PNG refs |
| **Open PRs** | **#418** `fix/schedules-mobile-table` — stack cards `<sm`, table `sm+`, no `min-w-[40rem]`; Vitest Schedules 13. Merge when CI green. Dependabot **#389–#393** + older — **do not mass-merge** |
| **P1 Scan Attach** | **S1–S5** + Wave B; production smoke closed |
| **P2 Workspace** | **S1–S5 on `main`**; residual **manual** multi-member / OrgSwitcher smoke (not a code epic) |
| **P4 soft dual-brand** | **On `main`** (#250); public **`sinexis.app`** — **no hard cut** |
| **P5 Guard** | Code on `main` (mock CI). **Standing permission (user 2026-08-26):** agents **may run live lab** wipe `tc5` → Manager cleanup from `tc1` → enroll/unenroll **without re-asking**. Still wipe-first **§4.1**; Playwright ≠ enroll; never print tokens/IPs. Recorded in `AGENTS.md` (PR **#407** if not yet on `main`) |
| **P7 SIEM** | Code on `main` (#307). **User enabled prod 2026-08-26:** GitHub secret `SIEM_ENABLED=true` + app-host `.env` + `vuln-backend` running with flag **true**. `SIEM_INCLUDE_FULL_LOG` stays **false**. Search still needs Guard agents + Indexer (`tc3`) or UI is empty/degraded. **Do not** add Discover/cases on `/guard`. To disable: set secret + host `.env` back to `false` |
| **P3 Assets** | **S1–S5 on `main`** (#380). Residual: **edge Alembic + `/assets` UI smoke** (human), not missing code |
| **P8 Uptime** | **S1–S5 + gaps + retention** (#397–#401). Residual: **human UI/SMTP smoke** |
| **P0 commercial** | Policy locked (#245): Basic **300k** / Pro **650k** / Multi **2M**; credits **10/24/60** |
| **Still human (not git)** | Finance **service_id** ×3; AM **10 CRM SIDs**; named **pilot #1**; AM **send**; ops **fulfill**; Uptime SMTP; Workspace/Assets **click** smoke; screenshot pack **`E2E_PASSWORD` on e2e host** only |
| **Coding-host Docker** | Prefer **off/minimal**. Compose project on edge is **`vuln`** (not `vuln-scanner`) |
| **Engineering default** | **Do not start coding.** No AI product-debt blocker before next epic. Next product epic if user asks: **P6 hospitality spek** (docs first). GTM parallel. Dependabot only when **named**. |

### Next OpenCode session

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull` — tip should be **`b6cac21`** (**#417**) or newer. If **#418** still open and CI green → squash-merge (`gh pr merge --squash`). Do **not** mass-merge Dependabot.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 then **§1.3**) then **`AGENTS.md`**. This stub is **not** the backlog. Guide wins on epic order.
3. Speak **Bahasa Indonesia** with the user; code/PR English; prefix **every** git command with `GIT_MASTER=1`. Never work on `main`. Never force-push. Never commit secrets/IPs/enroll keys. Never commit PNG screenshots (repo root `*-2k.png` / `*-mobile.png` are leftover captures — **untracked, do not add**).
4. **If user continues UI polish:** next likely `/schedules` after #418 merge (verify on phone) or other SPA tables that still use `min-w-[40rem]` / `overflow-x-auto`. **Wait** for `implement` / `buat` / `kerjakan` / `perbaiki` unless they already scoped it.
5. Recapture (2K or mobile) **only if asked**. Sequential visual-engineering / multimodal-looker (**one screenshot at a time**). Do **not** fire many parallel agents (OOM).
6. **SIEM prod is on.** Do not “enable SIEM” again unless they asked to **turn it off**. Empty `/siem` without live agents is expected.
7. **Guard live lab:** may execute (wipe-first §4.1) **without re-asking**. Public origin needs `GUARD_LAB_ALLOW_PUBLIC_PROD=1`. Wrong compose project name `vuln-scanner` conflicts with container `vuln-backend` — always `-p vuln`.

### Last session (2026-08-26) — blog CMS + schedules mobile

**Shipped on `main`:** public FastAPI `/blog` + `/admin/blog` (shadcn); design-system rule in `AGENTS.md` §11; layperson articles; dark island; Language/Theme clip; reading-list cards; `PageLoading` skeleton.

**In flight:** **#418** — `frontend/src/pages/Schedules.tsx` mobile `<ul data-testid="schedules-mobile-list">` + desktop table; shared `ScheduleRowActions`; tests in `frontend/src/test/Schedules.test.tsx` use `*AllBy*` because both layouts stay in the DOM.

**User standing:** Guard live lab OK; SIEM already on; do not invent E2E password; Palatino-as-brand **rejected** (blog must rhyme Landing).

**Rejected / watch:** ruff E501 on long CSS in blog HTML; git hook HTML `←` in comments; freeze testids (`user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, `guide-desktop-toc`).

**User-confirmed OK (do not redo):** mobile clusters A–F; Guard tables #360; Guide TOC #361/#362; **i18n S1–S7**; **theme S1–#378 + #405**; **uptime #397–#401**; **2K #403–#404**; **mobile QA #406**; grok chrome (user liked #405); **blog CMS #408–#417** (Landing chrome, not Palatino). Default locale **`id`**. Default theme **dark**. Do **not** treat `i18n-v1.md` as S0.

**Skipped / blocked (do not fake):**

- **Cluster B** `/terms` `/privacy` — no legal URL yet (not a checkbox).
- **Wave G** skip.
- Freeze testids: `user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, **`guide-desktop-toc`** (do not rename).
- Scroll root: `SidebarInset` `max-h-svh overflow-y-auto` in `AppShell.tsx` (not `window`). Nested TOC: `Sidebar` `collapsible="none"` **without** a second `SidebarProvider`.
- **Header** is **`h-12`** after **#405** (grok chrome). Do **not** restore wave9 `h-14` unless the user asks. Tap targets use **`min-h-11`** (#406).
- grok2api **sidebar IA / Models / Keys** — **out**. CTA Scan **green** — **out** to invert.
- PNG refs lived under `.sisyphus/ref-design/` (not git). Recapture PNGs under `/tmp/opencode/screenshots-mobile-wave9/` (not git).
- **ONE COMMIT = FAILURE** for 3+ files. Atomic conventional commits. PR body: What / Files changed / Next steps.

**What AI may execute without re-asking:** Guard **live lab** (wipe `tc5` first §4.1). SIEM flag already **on** — do not toggle unless asked.

**What AI may execute only if the user says so:** recapture + visual review (sequential); P6 hospitality **spek**; **one** named Dependabot PR; Workspace/Assets **click** smoke; Uptime SMTP smoke; a **bugfix** with repro; **disable** SIEM.

**What AI must not start unprompted:** GTM (finance SIDs); invent `E2E_PASSWORD`; mass-merge Dependabot; Cluster B; Wave G; SIEM UI on `/guard`; re-implement shipped S1–S5 epics; parallel screenshot agents; enroll without wipe `tc5`. Playwright ≠ host enroll.

### Edge public smoke — post-S5 + Wave B deploy (2026-08-10)

No host IPs, SSH, or secrets in this file.

| Check | Result |
|-------|--------|
| CI deploy after #270/#271 | **success** (Actions push on `main`; tip moved to `31faa67` after #272 docs) |
| Alembic (deploy log) | head includes **`add_workspace_orgs`** |
| `GET /api/health` | **200** — DB + Redis connected |
| SPA asset (at tip smoke) | `assets/index--pycNp6_.js` + Dashboard/ScanDetail/Schedules chunks (re-check after later deploys) |
| Wave B strings in SPA | Jadwal scan / Atur jadwal; HTML teknis / Laporan eksekutif (bundle probe) |
| S5 FE copy | Batas 10 jadwal aktif **per organisasi** |
| `GET /api/orgs` unauthenticated | **401** (route present) |
| Multi-member S5 cap / OrgSwitcher UI | **Manual residual** — close when ops confirms |

### Edge on-host smoke A (2026-08-08) — P1 production DoD

No host IPs, SSH, or secrets in this file. Access path is private ops only.

| Check | Result |
|-------|--------|
| Git tip on edge (at P1 smoke) | **`6edd254`** (later SHAs OK; tip now includes Workspace) |
| Compose project label | **`vuln`** on this edge (always `docker inspect` — may differ per host) |
| Containers | backend, frontend, workers, **celery_beat**, postgres, redis **healthy** |
| Alembic (at P1 smoke) | was **`add_scan_schedules`**; **now head includes `add_workspace_orgs`** |
| Beat | **`schedules.run_due` every 5m** |
| Due + credits | Job **completed**, domain cost **2**, credits debit, `last_job_id` set, `next_run_at` advanced |
| Zero credits | Schedule **`enabled=false`**, `last_error` insufficient credits, **no** new job |
| Cap 10 | **Per org** after S5 (#270); remote proof historically 10 OK / 11th **400** (was per-user pre-S5) |

### Remote smoke (public URL)

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** |
| Schedules CRUD + cap 10 (**per org** post-S5) | **Pass** unit + API surface; multi-member edge residual |
| Workspace org API surface | Present (401 without JWT) |

### Deploy notes (edge)

- Prefer [`scripts/deploy-services.sh`](scripts/deploy-services.sh); include **`celery_beat`**.
- CI main still uses `scripts/deploy.sh` (known debt; deploy job succeeded for Workspace).
- Match live `COMPOSE_PROJECT_NAME` via inspect (`vuln` vs `vuln-scanner`).
- Never commit secrets, SSH targets, or production host addresses into the public repo.

### Smoke DoD (edge) — short

**P1 (closed):**

1. `celery_beat` healthy; Alembic includes schedules / `last_error`.
2. Due schedule + credits → job enqueued, credits deducted.
3. Zero credits → schedule disabled, `last_error` set, no new job.
4. 11th enabled / re-enable over cap → HTTP 400 (**per org** after S5).
5. Diff / notify / executive OK when credits allow.

**P2 residual (manual):**

1. Alembic head **`add_workspace_orgs`** (done on edge 2026-08-10).
2. Login → personal org + JWT `org_id` / OrgSwitcher.
3. Shared scans per membership; no cross-org IDOR; WS membership OK.
4. Two members same org share enabled-schedule **cap 10** (S5 DoD).

---

## GTM execution checklist (current focus)

| # | Owner | Action | Status |
|---|--------|--------|--------|
| 1 | Finance | Create **3 service_id** (Basic / Pro / Multi); no silent VPS bundle | **Open** |
| 2 | AM | Pick **10 wave-1 SIDs** in private CRM (patterns in SKU §5) | **Open** |
| 3 | AM + product | Name **pilot #1** (multi-service / VPS+domain, 1–3 targets, sponsored 1 mo) | **Open** |
| 4 | Ops | Fulfill pilot: user + credits + schedule + notify + first HTML (Bahasa) | **Open** |
| 5 | AM | Send wave-1 using [`am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md); log CRM | **Open** |
| 6 | Ops | Confirm live `pricing` domain/IP (smoke: **2** / **1**) before quotes | **Open** |
| 7 | AM | Follow-up 7–10d; renew ownership stays AM | **Open** |

**Success (not a GitHub PR):** ≥1 pilot cycle delivered + attach line billable or sponsored with list price in CRM + wave-1 sent.

---

## Current product priority (summary — detail in guide)

**Goal bias:** **upsell** Secure/Scan add-on on existing GMD **colo / VPS / cloud**, hospitality as **strategic beachhead**.

| P | Focus | State |
|---|--------|--------|
| **P0** | One-pager + SKU + AM kit | **Policy + templates in git**; **GTM execution open** |
| **P1** | Scan Attach Loop | **Code + production smoke closed** |
| **P2** | Workspace v1 | **S1–S5 shipped** (#267 + #270); residual multi-org/S5 smoke |
| **P3** | Light asset registry | **S1–S5 on `main`** (#380); residual edge Alembic + UI smoke |
| **P4** | Soft Sinexis dual-brand | **Shipped soft** (#250); **no domain cut** |
| **P5** | Guard (Wazuh thin) | Code on `main`; **live lab standing-permitted** (wipe-first) |
| **P6** | Hospitality / pilot pack | **Not coded** — next epic if user asks (spek first) |
| **P7** | SIEM v1 | Code on `main`; **prod flag ON** (2026-08-26); never as a Guard PR |
| **P8** | Uptime | **Shipped** #397–#401; human SMTP residual |
| **UX** | i18n + theme + visual | **Shipped** through **#406**; stop polish unless named gap |

**Priority rule:** If this stub, the archive, or old chat **disagrees** with the execution guide on *what to build next*, **the guide wins**, unless the user opens a stuck-job / worker incident.

**When to call engineering again:** user names a **new epic** (prefer **P6 spek**); product **bug** with repro; **one** named Dependabot PR; Guard lab run (already permitted); never unprompted recapture / grok2api redo / P3 re-implement.

---

## Commercial + eng docs (in repo)

| Need | Go here |
|------|---------|
| One-pager (locked) | [`docs/commercial/sinexis-one-pager.md`](docs/commercial/sinexis-one-pager.md) |
| SKU + decision log | [`docs/commercial/sku-scan-secure-addon.md`](docs/commercial/sku-scan-secure-addon.md) |
| AM wave-1 email (Bahasa) | [`docs/commercial/am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md) |
| P1 engineering spec | [`docs/specs/scan-attach-v1.md`](docs/specs/scan-attach-v1.md) |
| Workspace v1 spek (approved; S1–S5 shipped) | [`docs/specs/workspace-v1.md`](docs/specs/workspace-v1.md) |
| Guard v1 spek (P5 thin) | [`docs/specs/guard-v1.md`](docs/specs/guard-v1.md) |
| Assets v1 (P3 S1–S5 shipped) | [`docs/specs/assets-v1.md`](docs/specs/assets-v1.md) |
| SIEM v1 (P7) | [`docs/specs/siem-v1.md`](docs/specs/siem-v1.md) |
| Theme v1 (light/dark + grok2api chrome) | [`docs/specs/theme-v1.md`](docs/specs/theme-v1.md) |
| Schedule ops / smoke | [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) |
| Full execution guide | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main`.

**Do not commit** raw finance/customer CSV dumps, production host IPs/ports, passwords, API keys, or customer SID/domain lists into this public repo.
