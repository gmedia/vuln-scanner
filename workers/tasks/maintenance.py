import os
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

AUTO_FAIL_ALERT_THRESHOLD = int(os.getenv("AUTO_FAIL_ALERT_THRESHOLD", "1"))


def _record_auto_fail_metric(status: str, count: int) -> None:
    if count <= 0:
        return
    try:
        import redis

        from utils.redis_helpers import build_redis_url

        r = redis.Redis.from_url(build_redis_url(), socket_connect_timeout=2)
        key = f"metrics:maintenance:auto_failed:{status}"
        r.incrby(key, count)
        r.expire(key, 86400 * 7)
    except Exception as e:
        logger.debug("Failed to record auto-fail metric: {error}", error=e)


def _alert_auto_fail(
    *,
    status: str,
    count: int,
    refunded: int,
    threshold_minutes: int,
    cutoff: datetime,
) -> None:
    if count <= 0:
        return

    logger.warning(
        "Auto-failed {count} stale {status} job(s) (>{threshold}m, cutoff={cutoff}, refunded={refunded})",
        count=count,
        status=status,
        threshold=threshold_minutes,
        cutoff=cutoff.isoformat(),
        refunded=refunded,
    )

    _record_auto_fail_metric(status, count)

    if count < AUTO_FAIL_ALERT_THRESHOLD:
        return

    logger.error(
        "ALERT: auto-failed {count} stale {status} job(s) (threshold={alert_threshold}, refunded={refunded})",
        count=count,
        status=status,
        alert_threshold=AUTO_FAIL_ALERT_THRESHOLD,
        refunded=refunded,
    )

    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("maintenance.status", status)
            scope.set_extra("auto_failed_count", count)
            scope.set_extra("refunded_count", refunded)
            scope.set_extra("threshold_minutes", threshold_minutes)
            scope.set_extra("cutoff", cutoff.isoformat())
            sentry_sdk.capture_message(
                f"Auto-failed {count} stale {status} scan job(s)",
                level="error",
            )
    except Exception:
        pass


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
            refundable AS (
                SELECT id AS job_id, user_id, credit_cost, scan_type
                FROM stale
                WHERE COALESCE(credit_cost, 0) > 0
            ),
            by_user AS (
                SELECT user_id, SUM(credit_cost)::int AS total_refund
                FROM refundable
                GROUP BY user_id
            ),
            refund_users AS (
                UPDATE users u
                SET credits = u.credits + b.total_refund
                FROM by_user b
                WHERE u.id = b.user_id
                RETURNING u.id AS user_id, b.total_refund
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
                FROM refundable
                RETURNING id
            )
            SELECT
                (SELECT COUNT(*) FROM stale)::int AS auto_failed_count,
                (SELECT COUNT(*) FROM refundable)::int AS refunded_count
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
    _alert_auto_fail(
        status="pending",
        count=result["auto_failed_count"],
        refunded=result["refunded_count"],
        threshold_minutes=STALE_PENDING_THRESHOLD_MINUTES,
        cutoff=cutoff,
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
    _alert_auto_fail(
        status="running",
        count=result["auto_failed_count"],
        refunded=result["refunded_count"],
        threshold_minutes=STALE_RUNNING_THRESHOLD_MINUTES,
        cutoff=cutoff,
    )
    return result
