from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from loguru import logger
from sqlalchemy import update

from utils.database import get_sync_session


def fail_job_no_retry(
    job_id: str,
    scan_type: str,
    err_msg: str,
    *,
    refund: bool = True,
) -> None:
    session = get_sync_session()
    try:
        from app.models.scan_job import ScanJob

        session.execute(
            update(ScanJob)
            .where(ScanJob.id == job_id)
            .values(
                status="failed",
                completed_at=datetime.now(UTC),
                result_summary={"error": err_msg[:500]},
            )
        )
        if refund:
            _refund_credits(session, job_id, scan_type)
        session.commit()
    except Exception as e:
        logger.warning(
            "fail_job_no_retry failed job={job_id} error={error}",
            job_id=job_id,
            error=e,
        )
        session.rollback()
    finally:
        session.close()


def persist_job_progress(job_id: str, progress: int) -> None:
    session = get_sync_session()
    try:
        from app.models.scan_job import ScanJob

        session.execute(update(ScanJob).where(ScanJob.id == job_id).values(progress=int(progress)))
        session.commit()
    except Exception as e:
        logger.debug("persist_job_progress job={job_id} error={error}", job_id=job_id, error=e)
        session.rollback()
    finally:
        session.close()


def _refund_credits(session: Any, job_id: str, scan_type: str) -> None:
    from app.models.credit_log import CreditLog
    from app.models.scan_job import ScanJob
    from app.models.user import User

    job = session.query(ScanJob).where(ScanJob.id == job_id).one_or_none()
    if not job or not job.user_id or not job.credit_cost:
        return
    already = session.query(CreditLog).where(CreditLog.reference_id == job.id, CreditLog.type == "refund").first()
    if already:
        return
    user = session.query(User).where(User.id == job.user_id).one_or_none()
    if not user:
        return
    user.credits += job.credit_cost
    session.add(
        CreditLog(
            user_id=user.id,
            amount=job.credit_cost,
            type="refund",
            description=f"Refund: {scan_type} scan failed",
            reference_id=job.id,
        )
    )
