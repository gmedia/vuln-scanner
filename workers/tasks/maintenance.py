from datetime import UTC, datetime, timedelta
from typing import Any, cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, text

from utils.database import get_sync_session

type ScanJobDict = dict[str, int]

STALE_PENDING_THRESHOLD_MINUTES = 30
STALE_RUNNING_THRESHOLD_MINUTES = 20
STALE_THRESHOLD_MINUTES = STALE_PENDING_THRESHOLD_MINUTES

STALE_PENDING_FAIL_SUMMARY = '{"error": "auto-failed: stuck pending > 30 minutes"}'
STALE_RUNNING_FAIL_SUMMARY = '{"error": "auto-failed: stuck running > 20 minutes"}'
STALE_FAIL_SUMMARY = STALE_PENDING_FAIL_SUMMARY

_PENDING_AGE_SQL = "created_at < :cutoff"
_RUNNING_AGE_SQL = "COALESCE(started_at, created_at) < :cutoff"


def _fail_stale_and_refund(
    *,
    status: str,
    cutoff: datetime,
    summary: str,
    age_sql: str,
    refund_reason: str,
) -> ScanJobDict:
    session = get_sync_session()
    try:
        stmt = text(
            f"""
            WITH stale AS (
                UPDATE scan_jobs
                SET status = 'failed',
                    result_summary = CAST(:summary AS jsonb),
                    completed_at = NOW()
                WHERE status = :status
                  AND {age_sql}
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
                    'Refund: ' || scan_type || ' scan auto-failed ({refund_reason})',
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
                    "summary": summary,
                    "cutoff": cutoff,
                    "status": status,
                },
            ),
        )
        row = result.one()
        session.commit()
        return {
            "auto_failed_count": int(row.auto_failed_count),
            "refunded_count": int(row.refunded_count),
        }
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@shared_task(bind=True, name="maintenance.fail_stale_pending", acks_late=True, max_retries=1)  # type: ignore
def fail_stale_pending_jobs(self: Any) -> ScanJobDict:
    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_PENDING_THRESHOLD_MINUTES)
    result = _fail_stale_and_refund(
        status="pending",
        cutoff=cutoff,
        summary=STALE_PENDING_FAIL_SUMMARY,
        age_sql=_PENDING_AGE_SQL,
        refund_reason="stuck pending",
    )
    if result["auto_failed_count"] > 0:
        logger.warning(
            "Auto-failed {count} stale pending job(s) (>{threshold}m, cutoff={cutoff}, refunded={refunded})",
            count=result["auto_failed_count"],
            threshold=STALE_PENDING_THRESHOLD_MINUTES,
            cutoff=cutoff.isoformat(),
            refunded=result["refunded_count"],
        )
    return result


@shared_task(bind=True, name="maintenance.fail_stale_running", acks_late=True, max_retries=1)  # type: ignore
def fail_stale_running_jobs(self: Any) -> ScanJobDict:
    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_RUNNING_THRESHOLD_MINUTES)
    result = _fail_stale_and_refund(
        status="running",
        cutoff=cutoff,
        summary=STALE_RUNNING_FAIL_SUMMARY,
        age_sql=_RUNNING_AGE_SQL,
        refund_reason="stuck running",
    )
    if result["auto_failed_count"] > 0:
        logger.warning(
            "Auto-failed {count} stale running job(s) (>{threshold}m, cutoff={cutoff}, refunded={refunded})",
            count=result["auto_failed_count"],
            threshold=STALE_RUNNING_THRESHOLD_MINUTES,
            cutoff=cutoff.isoformat(),
            refunded=result["refunded_count"],
        )
    return result
