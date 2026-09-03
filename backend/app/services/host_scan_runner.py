from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent
from app.models.host_protect import HostCommand, HostHit, HostQuarantineEvent, HostScan, HostSite
from app.services.host_engine import scan_clam, scan_local_root
from app.services.host_handoff import CRITICAL_CLASSES, handoff_critical_hit
from app.services.host_path import jail_rel_path, quarantine_basename, validate_root_path

HELPER_STALE_SECONDS = 20 * 60

MOCK_HITS: tuple[dict[str, str], ...] = (
    {
        "rel_path": "wp-content/uploads/cache.php",
        "hit_class": "webshell",
        "rule_id": "mock.webshell.php",
    },
)


async def _persist_hits(
    db: AsyncSession,
    scan: HostScan,
    site: HostSite,
    specs: list[dict[str, str]] | tuple[dict[str, str], ...],
    engine: str,
) -> int:
    now = datetime.now(UTC)
    hit_count = 0
    for spec in specs:
        existing = await db.execute(
            select(HostHit).where(
                HostHit.site_id == site.id,
                HostHit.rel_path == spec["rel_path"],
                HostHit.rule_id == spec["rule_id"],
            )
        )
        hit = existing.scalar_one_or_none()
        is_new = hit is None
        row_engine = spec.get("engine") or engine
        if hit is None:
            hit = HostHit(
                id=uuid.uuid4(),
                organization_id=site.organization_id,
                site_id=site.id,
                scan_id=scan.id,
                rel_path=spec["rel_path"],
                hit_class=spec["hit_class"],
                engine=row_engine,
                rule_id=spec["rule_id"],
                status="open",
                sha256=spec.get("sha256") or None,
            )
            db.add(hit)
            await db.flush()
        else:
            hit.last_seen_at = now
            hit.scan_id = scan.id
            hit.engine = row_engine
            digest = spec.get("sha256")
            if digest:
                hit.sha256 = digest
        if is_new and hit.hit_class in CRITICAL_CLASSES:
            await handoff_critical_hit(db, hit, site)
        if is_new and site.auto_quarantine and hit.hit_class in CRITICAL_CLASSES:
            try:
                jail_rel_path(site.root_path, hit.rel_path)
                jail_ok = True
            except ValueError:
                jail_ok = False
            if jail_ok:
                dest = quarantine_basename(str(hit.id), hit.rel_path)
                if settings.host_protect_allow_local_walk:
                    hit.status = "quarantined"
                    db.add(
                        HostQuarantineEvent(
                            organization_id=hit.organization_id,
                            hit_id=hit.id,
                            actor_user_id=site.created_by,
                            action="quarantine",
                            dest_basename=dest,
                        )
                    )
                else:
                    hit.status = "pending_quarantine"
                    db.add(
                        HostCommand(
                            organization_id=hit.organization_id,
                            site_id=site.id,
                            hit_id=hit.id,
                            actor_user_id=site.created_by,
                            kind="quarantine",
                            status="queued",
                            dest_basename=dest,
                        )
                    )
        if row_engine != "mock":
            hit_count += 1
    return hit_count


async def _ignore_open_mock_hits(db: AsyncSession, site_id: UUID) -> None:
    await db.execute(
        update(HostHit)
        .where(
            HostHit.site_id == site_id,
            HostHit.engine == "mock",
            HostHit.status == "open",
        )
        .values(status="ignored")
    )


async def run_mock_host_scan(db: AsyncSession, scan_id: UUID) -> dict[str, Any]:
    return await _run_with_specs(db, scan_id, list(MOCK_HITS), "mock")


async def run_host_scan_job(db: AsyncSession, scan_id: UUID) -> dict[str, Any]:
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
    try:
        root = validate_root_path(site.root_path)
    except ValueError as exc:
        scan.status = "failed"
        scan.error = str(exc)[:200]
        scan.finished_at = datetime.now(UTC)
        await db.commit()
        return {"ok": False, "error": str(exc)[:200]}
    allow_walk = bool(settings.host_protect_allow_local_walk)
    if allow_walk and os.path.isdir(root):
        specs = scan_local_root(root)
        engine = "yara"
        for clam_hit in scan_clam(root):
            row = dict(clam_hit)
            row["engine"] = "clam"
            specs.append(row)
        return await _finish_scan(db, scan, site, specs, engine)
    agent_row = await db.execute(select(GuardAgent).where(GuardAgent.id == site.guard_agent_id))
    agent = agent_row.scalar_one_or_none()
    polled = agent.last_helper_poll_at if agent is not None else None
    if polled is not None and polled.tzinfo is None:
        polled = polled.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    helper_fresh = polled is not None and (now - polled).total_seconds() <= HELPER_STALE_SECONDS
    if helper_fresh:
        await _ignore_open_mock_hits(db, site.id)
        await db.commit()
        return {
            "ok": True,
            "pending_agent": True,
            "error": None,
            "hit_count": 0,
            "scan_id": str(scan.id),
        }
    scan.status = "failed"
    scan.error = "host protect helper has not polled this Guard agent"
    scan.finished_at = now
    await _ignore_open_mock_hits(db, site.id)
    await db.commit()
    return {
        "ok": False,
        "pending_agent": False,
        "error": scan.error,
        "hit_count": 0,
        "scan_id": str(scan.id),
    }


async def _run_with_specs(
    db: AsyncSession,
    scan_id: UUID,
    specs: list[dict[str, str]],
    engine: str,
) -> dict[str, Any]:
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
    return await _finish_scan(db, scan, site, specs, engine)


async def _finish_scan(
    db: AsyncSession,
    scan: HostScan,
    site: HostSite,
    specs: list[dict[str, str]],
    engine: str,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    scan.status = "running"
    scan.started_at = now
    await db.flush()
    if engine != "mock":
        await _ignore_open_mock_hits(db, site.id)
    hit_count = await _persist_hits(db, scan, site, specs, engine)
    scan.status = "completed"
    scan.finished_at = datetime.now(UTC)
    scan.hit_count = hit_count
    scan.error = None
    await db.commit()
    return {"ok": True, "hit_count": hit_count, "scan_id": str(scan.id), "engine": engine}
