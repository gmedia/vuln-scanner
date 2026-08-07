# handoff.md (stub + pointer)

> **Not the product backlog.** Live roadmap and feature priority live only in
> **[`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md)**.

## After session reset

1. Read **`docs/AGENT_EXECUTION_GUIDE.md`** (§0 boot, then **§1.2–1.3** priority).
2. Read **`AGENTS.md`** for git/PR rules.
3. Do **not** implement until the user says so (`implement` / `buat` / `kerjakan` / …) or points at an approved `docs/specs/*` section.

## Current product priority (summary — detail in guide)

**Goal bias:** **upsell** Secure/Scan add-on on existing GMD **colo / VPS / cloud** (finance CSV evidence, 2026-08), with hospitality as **strategic beachhead** (not mass hotel logos in current billing).

| P | Focus |
|---|--------|
| **P0** | One-pager + **Scan/Secure Add-on SKU** + pilot intent (user-led) |
| **P1** | **Scan Attach Loop** — schedule, baseline diff, executive report |
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
| P1 engineering spec (no implement until asked) | [`docs/specs/scan-attach-v1.md`](docs/specs/scan-attach-v1.md) |

## Other links

| Need | Go here |
|------|---------|
| Full execution contract, CSV aggregates, acceptance | [`docs/AGENT_EXECUTION_GUIDE.md`](docs/AGENT_EXECUTION_GUIDE.md) |
| Git / PR / branch rules | [`AGENTS.md`](AGENTS.md) |
| Historical stuck-pending notes only | [`docs/archive/handoff-scan-pending-2026.md`](docs/archive/handoff-scan-pending-2026.md) |

**Before acting on the archive:** re-verify against current `main` (many fixes may already be shipped).

**Do not commit** raw finance/customer CSV dumps into this repo.
