# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`vs.appmedia.id`** (public DNS). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-08-08 — refresh against `main`)

| Item | State |
|------|--------|
| **`main` tip (coding checkout)** | Re-`git pull` — tip was **`609742c`** (P1 closed #243) before this commercial docs PR |
| **Open PRs** | Re-check `gh pr list` |
| **P1 Scan Attach (code)** | **S1–S5 merged** on `main` (#235–#239) |
| **P1 Scan Attach (ops docs)** | #240–#243 on main |
| **P1 Scan Attach (production)** | **Closed (2026-08-08)** — on-host edge tip `6edd254` at smoke, alembic `add_scan_schedules`, beat firing `schedules.run_due`, due+credits + zero-credit gate (see below). Cap 10 proven remotely |
| **P0 commercial** | **Docs ready for AM lock:** one-pager + SKU (P1-live, talk track, fulfillment). **User/GMD still must:** IDR list, service_id, first 10 CRM targets, pilot identity |
| **Coding-host Docker** | All `vuln-*` **stopped**. Edge runs the live stack |
| **Next product default** | Finish **P0 lock (user/AM)**; code epic only if user asks (**P2** if multi-user blocks); **no** P5 Guard default |

### Edge on-host smoke A (2026-08-08) — P1 production DoD

No host IPs, SSH, or secrets in this file. Access path is private ops only.

| Check | Result |
|-------|--------|
| Git tip on edge | **`6edd254`** (matches attach + ops docs) |
| Compose project label | **`vuln`** on this edge (always `docker inspect` — may differ per host) |
| Containers | backend, frontend, workers, **celery_beat**, postgres, redis **healthy** |
| Alembic | **`add_scan_schedules` (head)** |
| Beat | Logs show **`schedules.run_due` every 5m** |
| Due + credits | Forced `next_run_at` past; `celery … call schedules.run_due` → job **completed**, domain cost **2**, credits **50→48**, `last_job_id` set, `next_run_at` advanced ~1 month |
| Zero credits | Credits **0** + due → schedule **`enabled=false`**, `last_error` = insufficient credits Need 2 have 0, **no** `last_job_id` |
| Cleanup | Smoke schedules deleted; e2e credits restored to **100** |
| Cap 10 | Prior remote proof (10 OK / 11th 400) |

### Remote smoke (public URL, earlier same day)

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** |
| Schedules CRUD + cap 10 | **Pass** (rows cleaned) |

### Deploy notes (edge)

- Prefer [`scripts/deploy-services.sh`](scripts/deploy-services.sh); include **`celery_beat`**.
- **Match live** `COMPOSE_PROJECT_NAME` via inspect (this edge used **`vuln`**; other hosts may use `vuln-scanner`).
- Never commit secrets, SSH targets, or production host addresses into the public repo.

### Smoke DoD (edge) — short

1. `celery_beat` healthy; Alembic head includes `scan_schedules` / `last_error`.
2. Due schedule + credits → job enqueued, credits deducted.
3. Zero credits → schedule disabled, `last_error` set, no new job.
4. 11th enabled / re-enable over cap → HTTP 400.
5. Regression: diff / notify / executive still OK when credits allow.

## Current product priority (summary — detail in guide)

**Goal bias:** **upsell** Secure/Scan add-on on existing GMD **colo / VPS / cloud** (finance CSV evidence, 2026-08), with hospitality as **strategic beachhead** (not mass hotel logos in current billing).

| P | Focus |
|---|--------|
| **P0** | One-pager + **Scan/Secure Add-on SKU** + pilot intent (user-led) |
| **P1** | **Scan Attach Loop** — schedule, baseline diff, executive report (**code + production smoke closed**) |
| **P2** | **Workspace v1** — org + members + org-scoped scans |
| **P3** | Light **asset registry** (multi-target tiers) |
| **P4** | Soft **Sinexis** dual-brand (must not block P1) |
| **P5** | **Guard** MVP (Wazuh thin) — second upsell |
| **P6** | Hospitality / pilot pack |

**Priority rule:** If this stub, the archive, or old chat **disagrees** with the execution guide on *what to build next*, **the guide wins**, unless the user opens a stuck-job / worker incident.

## P0 / P1 drafts (in repo)

| Need | Go here |
|------|---------|
| One-pager (positioning) | [`docs/commercial/sinexis-one-pager.md`](docs/commercial/sinexis-one-pager.md) |
| SKU tiers + target patterns | [`docs/commercial/sku-scan-secure-addon.md`](docs/commercial/sku-scan-secure-addon.md) |
| P1 engineering spec | [`docs/specs/scan-attach-v1.md`](docs/specs/scan-attach-v1.md) |
| Schedule ops / smoke | [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) |

## Other links

| Need | Go here |
|------|---------|
| Full execution contract, CSV aggregates, acceptance | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR / branch rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending notes only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main` (many fixes may already be shipped).

**Do not commit** raw finance/customer CSV dumps, production host IPs/ports, passwords, or API keys into this repo.
