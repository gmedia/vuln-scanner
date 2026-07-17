from datetime import UTC, datetime, timedelta
from typing import cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, text

from utils.database import get_sync_session

type ScanJobDict = dict[str, int]

STALE_THRESHOLD_MINUTES = 30


@shared_task(bind=True, name="maintenance.fail_stale_pending", acks_late=True, max_retries=1)  # type: ignore
def fail_stale_pending_jobs(self) -> ScanJobDict:
    """Find scan jobs stuck in 'pending' status > STALE_THRESHOLD_MINUTES and mark them as failed.

    Returns a dict with the count of jobs that were auto-failed.
    """
    cutoff = datetime.now(UTC) - timedelta(minutes=STALE_THRESHOLD_MINUTES)
    session = get_sync_session()

    try:
        stmt = text(
            "UPDATE scan_jobs SET status = 'failed', "
            "result_summary = CAST(:summary AS jsonb) "
            "WHERE status = 'pending' AND created_at < :cutoff"
        )
        result = cast(
            CursorResult[int],
            session.execute(
                stmt,
                {
                    "summary": '{"error": "auto-failed: stuck pending > 30 minutes"}',
                    "cutoff": cutoff,
                },
            ),
        )
        session.commit()
        count = result.rowcount

        if count > 0:
            logger.warning(
                "Auto-failed {count} stale pending scan job(s) (pending > {threshold}m, cutoff={cutoff})",
                count=count,
                threshold=STALE_THRESHOLD_MINUTES,
                cutoff=cutoff.isoformat(),
            )
        return {"auto_failed_count": count}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
