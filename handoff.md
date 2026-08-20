# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`vs.appmedia.id`** (public DNS). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-08-20 — refresh against `main`)

| Item | State |
|------|--------|
| **`main` tip (coding)** | **`aa4ab50`** — **#362** Guide TOC sticky offset; re-`git pull` after reset |
| **Recent merges (UI wave)** | **#356** Cluster A (auth/shell mobile) · **#357** C+D (verify/forgot) · **#358** 404 · **#359** landing CTAs · **#360** Guard enroll/agent tables `min-w` + scroll · **#361** nested Guide TOC sidebar · **#362** TOC `top-14` (user: CI main hijau, deploy OK) |
| **Open PRs** | Dependabot **#252–#266** and **#314–#324** — **do not mass-merge**; only a **named** PR if CI green |
| **P1 Scan Attach (code)** | **S1–S5** on `main` (#235–#239) + **Wave B** SPA polish (#271) |
| **P1 production** | **Closed (2026-08-08)** smoke A; later tips CI-deployed |
| **P2 Workspace** | **S1–S5 on `main`** (#267 + #270); spek D1–D6; edge Alembic **`add_workspace_orgs`**; cap **10 enabled / org** |
| **P4 soft dual-brand** | **On `main`** (#250); public **`sinexis.app`** and/or legacy hostname — **no hard cut** |
| **P5 Guard** | **On `main`**: spek #273 · thin #274 · Http #275 · tables #360 · guide TOC #361/#362 — mock CI default; **edge lab + env + live smoke still human** |
| **P7 SIEM** | Spek + S0–S5 code on `main` (#307 family); host flag `SIEM_ENABLED` (default false). **Do not** add Discover/cases on `/guard` |
| **P0 commercial** | **Policy locked** (#245): Basic **300k** / Pro **650k** / Multi **2M**; credits **10/24/60**; AM renew; attach ARPU primary; pilot #1 multi-service, 1 mo sponsored |
| **P0 GTM kit in git** | One-pager + SKU + **[`docs/commercial/am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md)** (#246) |
| **Still human (not git)** | Finance **service_id** ×3; AM **10 CRM SIDs**; named **pilot #1**; AM **send** wave-1; ops **fulfill**; Guard lab Manager/Indexer + **wipe `tc5` before enroll e2e**; screenshot pack 08–18 needs **`E2E_PASSWORD` on e2e host** (do **not** invent on coding host) |
| **Coding-host Docker** | Prefer **off/minimal**. Edge runs live stack (CI **deploy** job on `main`) |
| **Engineering default** | **GTM human**. No new UI wave. No SIEM creep. **P3 / further Guard / named Dependabot** only on **explicit verb**. Guide/mobile polish **done** — do not re-implement TOC |

### Next OpenCode session — do not start coding

1. `GIT_MASTER=1 git checkout main && GIT_MASTER=1 git pull` — tip should be **`aa4ab50`** or newer.
2. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§1.3). This stub is **not** the backlog.
3. Speak **Bahasa Indonesia** with the user; code/PR English; prefix git with `GIT_MASTER=1`.
4. **Wait** for `implement` / `buat` / `kerjakan` / a named Dependabot PR / a screenshot zip.

**User-confirmed OK (do not redo):** mobile clusters A–F, Guard tables #360, Guide nested TOC #361, sticky `top-14` #362.

**Skipped / blocked (do not fake):**

- **Cluster B** `/terms` `/privacy` — no legal URL yet (not a checkbox).
- **Wave G** skip.
- Freeze testids: `user-menu`, `org-switcher*`, `export-executive`, `rescan-button`, `guard-state`, **`guide-desktop-toc`** (do not rename).
- Scroll root: `SidebarInset` `max-h-svh overflow-y-auto` in `AppShell.tsx` (not `window`). TOC sticky must use **`top-14`** (header `h-14`). Nested TOC: `Sidebar` `collapsible="none"` **without** a second `SidebarProvider`.

**What AI may execute only if the user says so:** P3 Asset S1 (spek [`assets-v1.md`](docs/specs/assets-v1.md) — answer §11 first); one named Dependabot PR; P6 hospitality docs; a **bugfix** with repro/screenshots.

**What AI must not start unprompted:** GTM; live Guard lab; invent `E2E_PASSWORD`; mass-merge Dependabot; Cluster B; Wave G; SIEM UI on `/guard`; re-polish Guide TOC.

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
| **P3** | Light asset registry | **Draft spek S0** (#282); S1+ on explicit verb + §11 |
| **P4** | Soft Sinexis dual-brand | **Shipped soft** (#250); **no domain cut** |
| **P5** | Guard (Wazuh thin) | **S0–S5 + Http + tables + guide TOC on `main`**; live lab residual human — see [`guard-v1.md`](docs/specs/guard-v1.md) |
| **P6** | Hospitality / pilot pack | After attach story works |
| **P7** | SIEM v1 | **S0–S5 on `main`**; flag off by default; never as a Guard PR |

**Priority rule:** If this stub, the archive, or old chat **disagrees** with the execution guide on *what to build next*, **the guide wins**, unless the user opens a stuck-job / worker incident.

**When to call engineering again:** product **bug** with screenshot/repro; **P3 S1+** explicit verb + assets §11; **one** named Dependabot PR; **P6** docs; never “improve Guide TOC” unless new screenshots.

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
| Assets v1 (P3 S0 draft) | [`docs/specs/assets-v1.md`](docs/specs/assets-v1.md) |
| SIEM v1 (P7) | [`docs/specs/siem-v1.md`](docs/specs/siem-v1.md) |
| Schedule ops / smoke | [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) |
| Full execution guide | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main`.

**Do not commit** raw finance/customer CSV dumps, production host IPs/ports, passwords, API keys, or customer SID/domain lists into this public repo.
