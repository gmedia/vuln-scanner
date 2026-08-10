from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

from celery import shared_task
from loguru import logger

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))


@shared_task(name="guard.sync_all")  # type: ignore[misc]
def sync_all_guard() -> dict[str, Any]:
    if os.environ.get("GUARD_ENABLED", "true").lower() in ("0", "false", "no"):
        return {"skipped": True, "reason": "GUARD_ENABLED off"}
    try:
        from app.database import async_session
        from app.services.guard import GuardService
    except Exception as exc:
        logger.exception("Guard import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    async def _body() -> dict[str, Any]:
        async with async_session() as db:
            return await GuardService(db).sync_all_enabled()

    try:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError("closed")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_body())
        logger.info("Guard sync_all result={result}", result=result)
        return result
    except Exception as exc:
        logger.exception("Guard sync_all failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}
