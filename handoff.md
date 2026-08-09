# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.
4. **Hosts:** the machine used for OpenCode / day-to-day coding is **coding only**. **Production** is the host that serves **`vs.appmedia.id`** (public DNS). Do **not** treat coding-host Docker or local health as production attach proof. Prefer full-stack Docker on the **edge** host; on the coding host keep Docker **off or minimal** (RAM for the agent).

## Session snapshot (2026-08-09 — refresh against `main`)

| Item | State |
|------|--------|
| **`main` tip (coding)** | **`6185e01`** — post-P1 guide / GTM status (#248); re-`git pull` after reset |
| **Open PRs** | Re-check `gh pr list` (often: P1 schedule polish, P4 dual-brand, Workspace spek, this handoff) |
| **P1 Scan Attach (code)** | **S1–S5** on `main` (#235–#239) |
| **P1 ops / production docs** | #240–#243 on main |
| **P1 production** | **Closed (2026-08-08)** — edge smoke A (see below) |
| **P0 commercial** | **Policy locked** (#245): Basic **300k** / Pro **650k** / Multi **2M**; credits **10/24/60**; AM renew; attach ARPU primary; pilot #1 multi-service, 1 mo sponsored |
| **P0 GTM kit in git** | One-pager + SKU + **[`docs/commercial/am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md)** (#246) |
| **Still human (not git)** | Finance **service_id** ×3; AM **10 CRM SIDs**; named **pilot #1**; AM **send** wave-1; ops **fulfill** first yes/pilot |
| **Coding-host Docker** | All `vuln-*` **Exited**. Edge runs live stack |
| **Engineering default** | **Dual-track OK:** GTM human + optional polish (P1 UX), soft dual-brand (P4), Workspace **spek only** until approve — **no** Guard/P5 by default |

### Edge on-host smoke A (2026-08-08) — P1 production DoD

No host IPs, SSH, or secrets in this file. Access path is private ops only.

| Check | Result |
|-------|--------|
| Git tip on edge (at smoke) | **`6edd254`** (attach + ops docs; later docs-only SHAs OK to pull) |
| Compose project label | **`vuln`** on this edge (always `docker inspect` — may differ per host) |
| Containers | backend, frontend, workers, **celery_beat**, postgres, redis **healthy** |
| Alembic | **`add_scan_schedules` (head)** |
| Beat | **`schedules.run_due` every 5m** |
| Due + credits | Job **completed**, domain cost **2**, credits debit, `last_job_id` set, `next_run_at` advanced |
| Zero credits | Schedule **`enabled=false`**, `last_error` insufficient credits, **no** new job |
| Cleanup | Smoke schedules deleted; e2e credits restored |
| Cap 10 | Remote proof: 10 OK / 11th **400** |

### Remote smoke (public URL)

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** |
| Schedules CRUD + cap 10 | **Pass** |

### Deploy notes (edge)

- Prefer [`scripts/deploy-services.sh`](scripts/deploy-services.sh); include **`celery_beat`**.
- Match live `COMPOSE_PROJECT_NAME` via inspect (`vuln` vs `vuln-scanner`).
- Never commit secrets, SSH targets, or production host addresses into the public repo.

### Smoke DoD (edge) — short

1. `celery_beat` healthy; Alembic head includes `scan_schedules` / `last_error`.
2. Due schedule + credits → job enqueued, credits deducted.
3. Zero credits → schedule disabled, `last_error` set, no new job.
4. 11th enabled / re-enable over cap → HTTP 400.
5. Diff / notify / executive OK when credits allow.

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
| **P1** | Scan Attach Loop | **Code + production smoke closed**; UX polish may still land in open PRs |
| **P2** | Workspace v1 | **Spek draft** (review D1–D6) — no S1 code until user approve + implement verb |
| **P3** | Light asset registry | Later |
| **P4** | Soft Sinexis dual-brand | Open PR path OK; **no domain cut** (`vs.appmedia.id`) |
| **P5** | Guard (Wazuh thin) | **Parked** |
| **P6** | Hospitality / pilot pack | After attach story works |

**Priority rule:** If this stub, the archive, or old chat **disagrees** with the execution guide on *what to build next*, **the guide wins**, unless the user opens a stuck-job / worker incident.

**When to call engineering again:** bug on schedule/credits/notify; revise commercial copy; **implement P2** only after spek approval + explicit verb; P4 soft brand without blocking GTM.

---

## Commercial + eng docs (in repo)

| Need | Go here |
|------|---------|
| One-pager (locked) | [`docs/commercial/sinexis-one-pager.md`](docs/commercial/sinexis-one-pager.md) |
| SKU + decision log | [`docs/commercial/sku-scan-secure-addon.md`](docs/commercial/sku-scan-secure-addon.md) |
| AM wave-1 email (Bahasa) | [`docs/commercial/am-wave1-email-id.md`](docs/commercial/am-wave1-email-id.md) |
| P1 engineering spec | [`docs/specs/scan-attach-v1.md`](docs/specs/scan-attach-v1.md) |
| Workspace v1 spek (draft) | [`docs/specs/workspace-v1.md`](docs/specs/workspace-v1.md) (if present on branch/`main`) |
| Schedule ops / smoke | [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) |
| Full execution guide | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main`.

**Do not commit** raw finance/customer CSV dumps, production host IPs/ports, passwords, API keys, or customer SID/domain lists into this public repo.
