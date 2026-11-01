"""Reap stale open AI reservations (beat).

A crashed stream leaves an ``open`` reservation holding wallet funds forever.
This task releases rows older than ``STALE_RESERVATION_MINUTES`` and refunds
the hold exactly once, writing the matching ``release`` ledger row.

Refunds must happen even when the AI gateway is switched off, so this task is
deliberately not gated on ``settings.ai_gateway_enabled``.
"""

import os
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

from celery import shared_task
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.models.ai_gateway import AiReservation, AiWallet, AiWalletLedger  # noqa: E402

STALE_RESERVATION_MINUTES = 20
_REAP_BATCH = 100


def reap_stale_reservations(
    session: Session,
    *,
    now: datetime | None = None,
    stale_minutes: int = STALE_RESERVATION_MINUTES,
) -> tuple[int, int]:
    """Release stale open reservations; returns (released_count, refunded_idr)."""
    cutoff = (now or datetime.now(UTC)) - timedelta(minutes=stale_minutes)
    stale_rows: list[AiReservation] = list(
        session.execute(
            select(AiReservation)
            .where(AiReservation.status == "open", AiReservation.created_at < cutoff)
            .order_by(AiReservation.created_at)
            .limit(_REAP_BATCH)
        )
        .scalars()
        .all()
    )

    released_count = 0
    refunded_idr = 0
    for reservation in stale_rows:
        close_result = session.execute(
            update(AiReservation)
            .where(AiReservation.id == reservation.id, AiReservation.status == "open")
            .values(status="released")
        )
        if int(getattr(close_result, "rowcount", 0) or 0) != 1:
            continue

        session.execute(
            update(AiWallet)
            .where(AiWallet.organization_id == reservation.organization_id)
            .values(balance_idr=AiWallet.balance_idr + reservation.hold_idr)
        )
        balance = int(
            session.execute(
                select(AiWallet.balance_idr).where(AiWallet.organization_id == reservation.organization_id)
            ).scalar_one()
        )
        session.add(
            AiWalletLedger(
                organization_id=reservation.organization_id,
                kind="release",
                delta_idr=reservation.hold_idr,
                balance_after_idr=balance,
                reservation_id=reservation.id,
            )
        )
        released_count += 1
        refunded_idr += reservation.hold_idr

    return released_count, refunded_idr


@shared_task(name="ai_reservations.reap")  # type: ignore[misc]
def reap_ai_reservations() -> dict[str, Any]:
    """Beat entrypoint: refund stale AI holds and never raise to beat."""
    session = get_sync_session()
    try:
        released_count, refunded_idr = reap_stale_reservations(session)
        session.commit()
        return {"released": released_count, "refunded_idr": refunded_idr}
    except Exception as exc:
        session.rollback()
        logger.warning("ai_reservations reap failed: {}", exc)
        return {"error": "reap_failed"}
    finally:
        session.close()
