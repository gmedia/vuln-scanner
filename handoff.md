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
| **`main` tip (coding checkout)** | `0eb7d42` — re-`git pull` after reset |
| **Open PRs** | None expected after S1–S5; re-check `gh pr list` |
| **P1 Scan Attach (code)** | **S1–S5 merged** on `main` (#235–#239): schedule, baseline diff, notify, executive HTML, credits gate + cap 10 + ops note |
| **P1 Scan Attach (production)** | **Not closed** until **edge** deploy of that tip + smoke per [`docs/scan-schedules-ops.md`](docs/scan-schedules-ops.md) (`celery_beat` required) |
| **P0 commercial** | Still **user-led** (SKU / one-pager / pilot) |
| **Coding-host Docker** | All `vuln-*` containers **stopped** (volumes kept). Default: leave stopped for OpenCode headroom; start only postgres/redis/(backend) when local tests need them |
| **Next product default** | Finish **P1 on edge** (ops), then user P0; **do not** start P2 Workspace / P5 Guard unless user asks or multi-user blocks pilot |

### Deploy notes (edge only — lessons from coding-host attempt)

- Prefer [`scripts/deploy-services.sh`](scripts/deploy-services.sh) (no volume wipe). Include **`celery_beat`** for schedules.
- Live Compose project name may be **`vuln-scanner`** (not script default `vuln`). Match existing postgres/redis **network**; wrong project name → container name conflicts / wrong network.
- Coding-host `.env` may be incomplete vs live container env — on edge use **production** env that already works; never commit secrets.
- Public URL health can be **200 on a different host** than the coding box — always verify deploy on the **DNS edge** host.

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
| **P1** | **Scan Attach Loop** — schedule, baseline diff, executive report (**code on main; edge smoke open**) |
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
