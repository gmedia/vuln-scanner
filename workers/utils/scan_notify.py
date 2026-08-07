from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

from loguru import logger
from sqlalchemy.orm import Session

_BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


def _run_async(coro: Any) -> Any:
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def maybe_notify_scan_complete(session: Session, job_id: str) -> dict[str, Any]:
    result: dict[str, Any] = {"sent": False, "skipped": True, "reason": "unknown"}
    try:
        from app.services.email import send_scan_diff_email
        from app.services.scan_notify import (
            build_notify_context,
            should_send_diff_alert,
        )

        ctx = build_notify_context(session, job_id)
        if ctx is None:
            result["reason"] = "no_context"
            return result

        if not should_send_diff_alert(
            ctx.diff.new_critical,
            ctx.diff.new_high,
            has_baseline=ctx.has_baseline,
        ):
            result["reason"] = "no_new_critical_high"
            result["new_critical"] = ctx.diff.new_critical
            result["new_high"] = ctx.diff.new_high
            return result

        ok = bool(
            _run_async(
                send_scan_diff_email(
                    ctx.email_to,
                    target=ctx.target,
                    job_id=ctx.job_id,
                    new_critical=ctx.diff.new_critical,
                    new_high=ctx.diff.new_high,
                    resolved=ctx.diff.resolved,
                    worsened=ctx.diff.worsened,
                )
            )
        )
        result["sent"] = ok
        result["skipped"] = not ok
        result["reason"] = "sent" if ok else "smtp_failed"
        result["email_to"] = ctx.email_to
        result["new_critical"] = ctx.diff.new_critical
        result["new_high"] = ctx.diff.new_high
        if ok:
            logger.info(
                "Scan diff email sent job={job_id} critical={c} high={h}",
                job_id=job_id,
                c=ctx.diff.new_critical,
                h=ctx.diff.new_high,
            )
        else:
            logger.warning("Scan diff email failed job={job_id}", job_id=job_id)
        return result
    except Exception as exc:
        logger.warning(
            "Scan notify skipped job={job_id} error={error}",
            job_id=job_id,
            error=exc,
        )
        result["reason"] = f"error:{type(exc).__name__}"
        return result
