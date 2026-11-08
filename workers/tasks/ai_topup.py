"""Expire stale AI top-up orders (beat, every 15 minutes).

Only ``pending_payment`` orders past ``expires_at`` are moved to ``expired``.
``awaiting_verification`` never auto-expires (that queue is a human backlog with
its own alert), and an already ``paid`` order is never touched. A provider
``succeeded`` that arrives afterwards is still authoritative: the S3 webhook
branch credits an expired order, so this sweep only retires customer intent,
never the right to settle real money.
"""

import os
import sys
import uuid
from datetime import UTC, datetime
from typing import Any

from celery import shared_task
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.models.ai_gateway import AiTopupOrder  # noqa: E402
from app.models.billing import PaymentAttempt  # noqa: E402

EXPIRE_BATCH_SIZE = 200


def expire_stale_orders(session: Session, *, now: datetime) -> int:
    """Expire up to ``EXPIRE_BATCH_SIZE`` overdue orders; returns the count.

    The per-row ``status = 'pending_payment'`` predicate makes a sweep racing an
    admin approve a no-op for that order: approve wins, the order is not expired,
    and its pending attempt is left for the approval path to retire.
    """
    candidates: list[uuid.UUID] = list(
        session.execute(
            select(AiTopupOrder.id)
            .where(
                AiTopupOrder.status == "pending_payment",
                AiTopupOrder.expires_at < now,
            )
            .order_by(AiTopupOrder.expires_at.asc(), AiTopupOrder.id.asc())
            .limit(EXPIRE_BATCH_SIZE)
        )
        .scalars()
        .all()
    )

    expired = 0
    for order_id in candidates:
        result = session.execute(
            update(AiTopupOrder)
            .where(AiTopupOrder.id == order_id, AiTopupOrder.status == "pending_payment")
            .values(status="expired", updated_at=now)
        )
        if int(getattr(result, "rowcount", 0) or 0) != 1:
            continue
        session.execute(
            update(PaymentAttempt)
            .where(
                PaymentAttempt.topup_order_id == order_id,
                PaymentAttempt.status == "pending",
            )
            .values(
                status="expired",
                provider_status="expired",
                failed_at=now,
                updated_at=now,
            )
        )
        expired += 1
    return expired


@shared_task(bind=True, name="ai_topup.expire_stale_orders", acks_late=True, max_retries=1)  # type: ignore
def expire_stale_topup_orders(self: Any) -> dict[str, int]:
    del self
    now = datetime.now(UTC)
    session = get_sync_session()
    try:
        expired = expire_stale_orders(session, now=now)
        session.commit()
        if expired:
            logger.info("Expired stale AI top-up orders: count={count}", count=expired)
        return {"expired": expired}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
