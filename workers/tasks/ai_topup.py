"""Expire stale AI top-up orders (beat, every 15 minutes) and purge proofs.

Only ``pending_payment`` orders past ``expires_at`` are moved to ``expired``.
``awaiting_verification`` never auto-expires (that queue is a human backlog with
its own alert), and an already ``paid`` order is never touched. A provider
``succeeded`` that arrives afterwards is still authoritative: the S3 webhook
branch credits an expired order, so this sweep only retires customer intent,
never the right to settle real money.

``purge_expired_topup_proofs`` deletes the transfer-proof object 90 days after a
terminal status, keeping the order row as the payment audit trail.
"""

import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

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
from app.services.topup_proofs import delete_proof  # noqa: E402

EXPIRE_BATCH_SIZE = 200

# Retention policy: a transfer proof is deleted 90 days after the order reaches
# a terminal status. The order row is kept forever as the payment audit trail.
TOPUP_PROOF_RETENTION_DAYS = 90
PROOF_PURGE_BATCH_SIZE = 200
_TERMINAL_PROOF_STATUSES = ("expired", "rejected", "canceled")


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


def purge_expired_topup_proofs(session: Session, *, now: datetime) -> int:
    """Delete proofs of up to ``PROOF_PURGE_BATCH_SIZE`` aged terminal orders.

    ``updated_at`` is the terminal timestamp: every status change stamps it and
    ``expire_stale_orders`` sets it explicitly, so it is the moment the order
    entered its current terminal status. Only ``expired``/``rejected``/
    ``canceled`` are eligible; ``paid``/``refunded``/``refund_review`` keep their
    proof as the audit trail for a completed payment.

    ``delete_proof`` is best-effort and swallows storage errors, so one failed
    object never aborts the batch. The order row is never deleted. Clearing
    ``proof_object_key`` makes a second run find nothing.
    """
    cutoff = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS)
    rows = session.execute(
        select(AiTopupOrder.id, AiTopupOrder.proof_object_key)
        .where(
            AiTopupOrder.proof_object_key.is_not(None),
            AiTopupOrder.status.in_(_TERMINAL_PROOF_STATUSES),
            AiTopupOrder.updated_at < cutoff,
        )
        .order_by(AiTopupOrder.updated_at.asc(), AiTopupOrder.id.asc())
        .limit(PROOF_PURGE_BATCH_SIZE)
    ).all()
    candidates: list[tuple[uuid.UUID, str]] = [
        (cast(uuid.UUID, order_id), cast(str, ref)) for order_id, ref in rows if ref is not None
    ]

    purged = 0
    for order_id, ref in candidates:
        delete_proof(ref)
        result = session.execute(
            update(AiTopupOrder)
            .where(AiTopupOrder.id == order_id, AiTopupOrder.proof_object_key == ref)
            .values(
                proof_object_key=None,
                proof_mime=None,
                proof_size_bytes=None,
                proof_uploaded_at=None,
                updated_at=now,
            )
        )
        if int(getattr(result, "rowcount", 0) or 0) != 1:
            continue
        purged += 1
    return purged


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


@shared_task(  # type: ignore
    bind=True,
    name="ai_topup.purge_expired_topup_proofs",
    acks_late=True,
    max_retries=1,
)
def purge_expired_topup_proofs_task(self: Any) -> dict[str, int]:
    del self
    now = datetime.now(UTC)
    session = get_sync_session()
    try:
        purged = purge_expired_topup_proofs(session, now=now)
        session.commit()
        if purged:
            logger.info("Purged expired AI top-up proofs: count={count}", count=purged)
        return {"purged": purged}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
