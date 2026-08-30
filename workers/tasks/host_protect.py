from __future__ import annotations

import asyncio
import os
import sys
from typing import Any, cast
from uuid import UUID

from celery import shared_task
from loguru import logger

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))


def _run(coro: Any) -> Any:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
        if loop.is_running():
            return asyncio.run_coroutine_threadsafe(coro, loop).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


@shared_task(name="host_protect.run_scan")  # type: ignore[misc]
def run_host_scan(scan_id: str) -> dict[str, Any]:
    if os.environ.get("HOST_PROTECT_ENABLED", "false").lower() in ("0", "false", "no"):
        return {"skipped": True, "reason": "HOST_PROTECT_ENABLED off"}
    try:
        from app.database import async_session
        from app.services.host_scan_runner import run_mock_host_scan
    except Exception as exc:
        logger.exception("Host Protect import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    async def _body() -> dict[str, Any]:
        async with async_session() as db:
            return cast(dict[str, Any], await run_mock_host_scan(db, UUID(scan_id)))

    try:
        result = cast(dict[str, Any], _run(_body()))
        logger.info("Host Protect scan result={result}", result=result)
        return result
    except Exception as exc:
        logger.exception("Host Protect scan failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}


@shared_task(name="host_protect.run_due")  # type: ignore[misc]
def run_due_host_scans(limit: int = 20) -> dict[str, Any]:
    if os.environ.get("HOST_PROTECT_ENABLED", "false").lower() in ("0", "false", "no"):
        return {"skipped": True, "reason": "HOST_PROTECT_ENABLED off"}
    try:
        from sqlalchemy import text

        from celery_app import celery_app
        from utils.database import get_sync_session
    except Exception as exc:
        logger.exception("Host Protect beat import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    session = get_sync_session()
    enqueued = 0
    try:
        rows = session.execute(
            text(
                """
                SELECT s.id AS site_id, s.organization_id
                FROM host_sites s
                WHERE s.enabled = true
                ORDER BY s.created_at ASC
                LIMIT :lim
                """
            ),
            {"lim": limit},
        ).mappings()
        for row in rows:
            scan_id = session.execute(
                text(
                    """
                    INSERT INTO host_scans (id, organization_id, site_id, status, trigger, hit_count, created_at)
                    VALUES (gen_random_uuid(), :org, :site, 'queued', 'schedule', 0, NOW())
                    RETURNING id
                    """
                ),
                {"org": row["organization_id"], "site": row["site_id"]},
            ).scalar_one()
            session.commit()
            celery_app.send_task("host_protect.run_scan", args=[str(scan_id)], queue="ip_scan")
            enqueued += 1
        return {"ok": True, "enqueued": enqueued}
    except Exception as exc:
        session.rollback()
        logger.exception("Host Protect beat failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}
    finally:
        session.close()
