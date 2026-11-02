"""Daily USD/IDR FX-rate refresh (beat).

Stores at most one snapshot per ``effective_date`` for the admin model editor.
This task only stores the daily snapshot; reservations lock the rate at reserve
time, so later snapshots never change an already-reserved price.

An unavailable upstream is logged and swallowed on purpose: a beat retry loop
against a dead provider is worse than a stale rate, and the stale
``effective_date`` stays visible in admin so a human can enter the rate.
"""

import os
import sys
from typing import Any

from celery import shared_task
from loguru import logger

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.config import settings  # noqa: E402
from app.services.ai_fx import (  # noqa: E402
    FxFetchError,
    fetch_rate_sync,
    upsert_rate_sync,
)


@shared_task(name="ai_fx.refresh")  # type: ignore[misc]
def refresh_ai_fx() -> dict[str, Any]:
    """Fetch and store today's USD->IDR rate once per day (beat)."""
    if not settings.ai_gateway_enabled:
        return {"skipped": "ai_gateway_disabled"}
    if not settings.ai_fx_auto_fetch:
        return {"skipped": "auto_fetch_disabled"}

    session = get_sync_session()
    try:
        quote = fetch_rate_sync()
        upsert_rate_sync(
            session,
            rate=quote.rate,
            source=quote.source,
            effective_date=quote.effective_date,
        )
        session.commit()
        return {
            "rate": str(quote.rate),
            "effective_date": quote.effective_date.isoformat(),
            "source": quote.source,
        }
    except FxFetchError as exc:
        session.rollback()
        logger.warning("ai_fx refresh failed: {}", exc)
        return {"error": "fx_fetch_failed"}
    finally:
        session.close()
