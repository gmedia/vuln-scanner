# Scan assets — operator note (P3)

Short ops reference after **#380**. No secrets, hosts, or customer targets in git.

## What shipped

| Piece | Notes |
|-------|--------|
| Alembic **`add_scan_assets`** | `scan_assets` table; `organizations.sku` (default `multi`); `scan_schedules.asset_id` (1:1) |
| API | `/api/assets` CRUD; `POST /api/assets/{id}/schedules`; `GET /api/assets/pack` |
| SPA | `/assets` — SKU hard cap disables Add at limit |
| Caps | Assets: Basic **1** · Pro **3** · Multi **10**. Enabled schedules still **10 / org** |

## Edge after auto-deploy

On the **production** host (not the coding laptop):

1. Confirm git tip includes **#380** (or newer) and Alembic head includes `add_scan_assets`.
2. Login as an org member → open **`/assets`**.
3. Create **one** named domain or IP (use a **lab** target, never paste customer hosts into tickets that land in git).
4. **Create schedule** on that row (weekly). Confirm 409 if you try a second schedule on the same asset.
5. If org `sku=basic`, a second asset must **400** (“Asset limit”).
6. Optional: **Download pack JSON** / `GET /api/assets/pack` (viewer+).

Do **not** treat this as Guard enroll. Playwright ≠ host enroll. Wipe `tc5` first only if a full Guard e2e was requested.

## SKU vs sold tier

Fulfillment: set `organizations.sku` to the **invoiced** tier so the product cap matches finance (`service_id` ×3 still human — see `docs/commercial/sku-scan-secure-addon.md`).
