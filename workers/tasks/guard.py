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


@shared_task(name="guard.sync_all")  # type: ignore[misc]
def sync_all_guard() -> dict[str, Any]:
    if os.environ.get("GUARD_ENABLED", "true").lower() in ("0", "false", "no"):
        return {"skipped": True, "reason": "GUARD_ENABLED off"}
    try:
        from app.database import async_session
        from app.services.guard_apply import sync_all_enabled
    except Exception as exc:
        logger.exception("Guard import failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}

    async def _body() -> dict[str, Any]:
        async with async_session() as db:
            raw = await sync_all_enabled(db)
            return {
                "ok": raw.get("ok", 0),
                "failed": raw.get("failed", 0),
                "total": raw.get("total", 0),
            }

    try:
        result = _run(_body())
        logger.info("Guard sync_all result={result}", result=result)
        return result
    except Exception as exc:
        logger.exception("Guard sync_all failed: {error}", error=exc)
        return {"ok": False, "error": str(exc)[:200]}
