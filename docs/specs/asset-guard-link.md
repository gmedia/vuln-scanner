# Spec: Optional Guard agent ↔ scan asset link

**Status:** S0–S2 (this PR). Manual 1:0..1 link. **Not** a CMDB or asset overview page.
**Goal:** operators see that a named scan target and a Guard sensor belong to the same host, without merging catalogs.
**Non-goals:** auto-match hostname/IP (wave 2); requiring Guard for asset CRUD; new SPA routes (`/assets/:id`); merging Guard into `/assets`.

## Cardinality

- One `guard_agents` row may point at **zero or one** `scan_assets` row (`asset_id` nullable).
- One `scan_assets` row may be referenced by **at most one** agent in the same org (partial unique on `asset_id`).
- `HostSite.asset_id` stays independent (Host Protect site label). This FK does not drive Host Protect.

## API

| Method | Path | Auth | Body |
|--------|------|------|------|
| `PATCH` | `/api/guard/agents/{id}/asset` | admin+ | `{ "asset_id": uuid \| null }` |

- Guard feature flag required (same as other Guard writes).
- Asset must exist in the **same org**. Else 404.
- If another agent already owns that `asset_id`: **409**.
- Viewer: list only. Member: cannot PATCH.

## List enrichment

- `GET /api/assets`: `guard_agent_id`, `guard_agent_name` (null if unlinked). Does **not** require Guard enabled.
- `GET /api/guard/agents`: `asset_id`, `asset_name`, `asset_target` (null if unlinked).

## SPA

- `/assets` card: chip + link to `/guard` when linked.
- `/guard` agent row/card: chip + link to `/assets`; admin Select to link/unlink.
- No overview page.

## Tests

- Link, unlink, 409 second agent, IDOR other org asset, viewer 403, asset list fields without Guard enable.
