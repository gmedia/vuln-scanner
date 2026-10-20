"""Subscription lifecycle finalization (beat).

Closes ``cancel_at_period_end`` subscriptions and marks overdue periods
``past_due``. It never revokes access or deletes data: access enforcement is a
separate product decision, and the invoice remains the collection path.
"""

import os
from datetime import UTC, datetime
from typing import Any, cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, text

from utils.database import get_sync_session

# Days after ``current_period_end`` before an active subscription becomes
# ``past_due``. Configurable so ops can widen the grace window without a deploy.
PAST_DUE_GRACE_DAYS = int(os.getenv("BILLING_PAST_DUE_GRACE_DAYS", "7"))

_CLOSE_CANCELED = text(
    """
    UPDATE subscriptions
    SET status = 'canceled',
        cancel_at_period_end = false,
        canceled_at = :now,
        ended_at = :now,
        updated_at = :now
    WHERE cancel_at_period_end = true
      AND current_period_end IS NOT NULL
      AND current_period_end <= :now
    RETURNING id
    """
)

_MARK_PAST_DUE = text(
    """
    UPDATE subscriptions
    SET status = 'past_due',
        updated_at = :now
    WHERE status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end + make_interval(days => :grace_days) <= :now
    RETURNING id
    """
)


def _count_rows(session: Any, statement: Any, params: dict[str, Any]) -> int:
    result = cast(CursorResult[Any], session.execute(statement, params))
    return len(result.all())


@shared_task(bind=True, name="billing.finalize_periods", acks_late=True, max_retries=1)  # type: ignore
def finalize_periods(self: Any) -> dict[str, int]:
    now = datetime.now(UTC)
    session = get_sync_session()
    try:
        canceled = _count_rows(session, _CLOSE_CANCELED, {"now": now})
        past_due = _count_rows(
            session,
            _MARK_PAST_DUE,
            {"now": now, "grace_days": PAST_DUE_GRACE_DAYS},
        )
        session.commit()
        if canceled or past_due:
            logger.info(
                "Billing finalize: canceled={canceled} past_due={past_due} grace_days={grace}",
                canceled=canceled,
                past_due=past_due,
                grace=PAST_DUE_GRACE_DAYS,
            )
        return {"canceled_count": canceled, "past_due_count": past_due}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
