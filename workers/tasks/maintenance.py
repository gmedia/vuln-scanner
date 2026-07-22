from datetime import UTC, datetime, timedelta
from typing import Any, cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, text

from utils.database import get_sync_session

type ScanJobDict = dict[str, int]

STALE_THRESHOLD_MINUTES = 30
STALE_FAIL_SUMMARY = '{"error": "auto-failed: stuck pending > 30 minutes"}'


@shared_task(bind=True, name="maintenance.fail_stale_pending", acks_late=True, max_retries=1)  # type: ignore
def fail_stale_pending_jobs(self: Any) -> ScanJobDict:
    """Find scan jobs stuck in 'pending' > STALE_THRESHOLD_MINUTES, mark failed, refund credits."""
    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_THRESHOLD_MINUTES)
    session = get_sync_session()

    try:
        stmt = text(
            """
            WITH stale AS (
                UPDATE scan_jobs
                SET status = 'failed',
                    result_summary = CAST(:summary AS jsonb),
                    completed_at = NOW()
                WHERE status = 'pending'
                  AND created_at < :cutoff
                RETURNING id, user_id, credit_cost, scan_type
            ),
            refund_users AS (
                UPDATE users u
                SET credits = u.credits + s.credit_cost
                FROM stale s
                WHERE u.id = s.user_id
                  AND COALESCE(s.credit_cost, 0) > 0
                RETURNING s.id AS job_id, s.user_id, s.credit_cost, s.scan_type
            ),
            ins AS (
                INSERT INTO credit_logs (
                    id, user_id, amount, type, description, reference_id, created_at
                )
                SELECT
                    gen_random_uuid(),
                    user_id,
                    credit_cost,
                    'refund',
                    'Refund: ' || scan_type || ' scan auto-failed (stuck pending)',
                    job_id,
                    NOW()
                FROM refund_users
                RETURNING id
            )
            SELECT
                (SELECT COUNT(*) FROM stale)::int AS auto_failed_count,
                (SELECT COUNT(*) FROM refund_users)::int AS refunded_count
            """
        )
        result = cast(
            CursorResult[Any],
            session.execute(
                stmt,
                {
                    "summary": STALE_FAIL_SUMMARY,
                    "cutoff": cutoff,
                },
            ),
        )
        row = result.one()
        session.commit()

        auto_failed_count = int(row.auto_failed_count)
        refunded_count = int(row.refunded_count)

        if auto_failed_count > 0:
            logger.warning(
                "Auto-failed {count} stale pending job(s) (>{threshold}m, cutoff={cutoff}, refunded={refunded})",
                count=auto_failed_count,
                threshold=STALE_THRESHOLD_MINUTES,
                cutoff=cutoff.isoformat(),
                refunded=refunded_count,
            )
        return {"auto_failed_count": auto_failed_count, "refunded_count": refunded_count}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
