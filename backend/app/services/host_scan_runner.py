from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.host_protect import HostHit, HostQuarantineEvent, HostScan, HostSite
from app.services.host_handoff import CRITICAL_CLASSES, handoff_critical_hit
from app.services.host_path import jail_rel_path, quarantine_basename

MOCK_HITS: tuple[dict[str, str], ...] = (
    {
        "rel_path": "wp-content/uploads/cache.php",
        "hit_class": "webshell",
        "rule_id": "mock.webshell.php",
    },
)


async def run_mock_host_scan(db: AsyncSession, scan_id: UUID) -> dict[str, Any]:
    result = await db.execute(select(HostScan).where(HostScan.id == scan_id))
    scan = result.scalar_one_or_none()
    if scan is None:
        return {"ok": False, "error": "scan not found"}

    site_result = await db.execute(select(HostSite).where(HostSite.id == scan.site_id))
    site = site_result.scalar_one_or_none()
    if site is None:
        scan.status = "failed"
        scan.error = "site not found"
        scan.finished_at = datetime.now(UTC)
        await db.commit()
        return {"ok": False, "error": "site not found"}

    now = datetime.now(UTC)
    scan.status = "running"
    scan.started_at = now
    await db.flush()

    hit_count = 0
    for spec in MOCK_HITS:
        existing = await db.execute(
            select(HostHit).where(
                HostHit.site_id == site.id,
                HostHit.rel_path == spec["rel_path"],
                HostHit.rule_id == spec["rule_id"],
            )
        )
        hit = existing.scalar_one_or_none()
        is_new = hit is None
        if hit is None:
            hit = HostHit(
                id=uuid.uuid4(),
                organization_id=site.organization_id,
                site_id=site.id,
                scan_id=scan.id,
                rel_path=spec["rel_path"],
                hit_class=spec["hit_class"],
                engine="mock",
                rule_id=spec["rule_id"],
                status="open",
            )
            db.add(hit)
            await db.flush()
        else:
            hit.last_seen_at = now
            hit.scan_id = scan.id
        if is_new and hit.hit_class in CRITICAL_CLASSES:
            await handoff_critical_hit(db, hit, site)
        if is_new and site.auto_quarantine and hit.hit_class in CRITICAL_CLASSES:
            try:
                jail_rel_path(site.root_path, hit.rel_path)
                jail_ok = True
            except ValueError:
                jail_ok = False
            if jail_ok:
                hit.status = "quarantined"
                db.add(
                    HostQuarantineEvent(
                        organization_id=hit.organization_id,
                        hit_id=hit.id,
                        actor_user_id=site.created_by,
                        action="quarantine",
                        dest_basename=quarantine_basename(str(hit.id), hit.rel_path),
                    )
                )
        hit_count += 1

    scan.status = "completed"
    scan.finished_at = datetime.now(UTC)
    scan.hit_count = hit_count
    scan.error = None
    await db.commit()
    return {"ok": True, "hit_count": hit_count, "scan_id": str(scan.id)}
