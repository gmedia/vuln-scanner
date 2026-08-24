from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from celery import shared_task
from loguru import logger
from sqlalchemy import select

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


@shared_task(name="uptime.run_due")  # type: ignore[misc]
def run_due() -> dict[str, Any]:
    if os.environ.get("UPTIME_ENABLED", "true").lower() in ("0", "false", "no"):
        return {"skipped": True, "reason": "UPTIME_ENABLED off"}
    try:
        from app.database import async_session
        from app.models.uptime import UptimeMonitor

        from celery_app import celery_app
    except Exception as exc:
        logger.exception("uptime.run_due import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    async def _body() -> list[str]:
        now = datetime.now(UTC)
        async with async_session() as db:
            result = await db.execute(
                select(UptimeMonitor.id).where(
                    UptimeMonitor.enabled.is_(True),
                    UptimeMonitor.next_check_at <= now,
                )
            )
            return [str(row[0]) for row in result.all()]

    try:
        ids = _run(_body())
    except Exception as exc:
        logger.exception("uptime.run_due failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}
    for mid in ids:
        celery_app.send_task("uptime.check", args=[mid], queue="uptime_check")
    return {"ok": True, "dispatched": len(ids)}


@shared_task(name="uptime.check")  # type: ignore[misc]
def check_one(monitor_id: str) -> dict[str, Any]:
    if os.environ.get("UPTIME_ENABLED", "true").lower() in ("0", "false", "no"):
        return {"skipped": True}
    try:
        from app.database import async_session
        from app.models.uptime import UptimeMonitor
        from app.models.user import User
        from app.services.email import send_uptime_email
        from app.services.uptime import UptimeService, run_probe
    except Exception as exc:
        logger.exception("uptime.check import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    async def _body() -> dict[str, Any]:
        async with async_session() as db:
            result = await db.execute(select(UptimeMonitor).where(UptimeMonitor.id == UUID(monitor_id)))
            monitor = result.scalar_one_or_none()
            if monitor is None or not monitor.enabled:
                return {"ok": False, "reason": "missing"}
            probe = run_probe(monitor)
            event = await UptimeService(db).apply_probe(monitor, probe)
            if event is not None and monitor.notify_email:
                kind = "tls" if event.to_state == "degraded" else ("down" if event.to_state == "down" else "up")
                user_row = await db.execute(select(User).where(User.id == monitor.created_by))
                creator = user_row.scalar_one_or_none()
                locale = creator.locale if creator is not None else "id"
                sent = await send_uptime_email(
                    monitor.notify_email,
                    kind=kind,
                    name=monitor.name,
                    target=monitor.target,
                    locale=locale,
                    detail=event.detail,
                )
                event.notified = bool(sent)
                await db.commit()
            return {"ok": True, "state": monitor.state, "probe_ok": probe.ok}

    try:
        return _run(_body())
    except Exception as exc:
        logger.exception("uptime.check failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}
