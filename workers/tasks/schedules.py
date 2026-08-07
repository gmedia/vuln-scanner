from __future__ import annotations

import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from celery import shared_task
from loguru import logger
from sqlalchemy import text

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))


def _advance_next_run(cadence: str, timezone: str, last_next: datetime) -> datetime:
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("Asia/Jakarta")
    if last_next.tzinfo is None:
        last_next = last_next.replace(tzinfo=UTC)
    local = last_next.astimezone(tz)
    if cadence == "weekly":
        local = local + timedelta(days=7)
    else:
        year = local.year + (1 if local.month == 12 else 0)
        month = 1 if local.month == 12 else local.month + 1
        day = min(local.day, 28)
        local = local.replace(year=year, month=month, day=day)
    return local.astimezone(UTC)


def _dispatch_scan(job_id: str, scan_type: str, target: str) -> str | None:
    try:
        from celery_app import celery_app

        if scan_type == "ip":
            result = celery_app.send_task(
                "ip_scan.run",
                args=[job_id, target, "1-1000"],
                queue="ip_scan",
            )
        elif scan_type == "domain":
            result = celery_app.send_task(
                "domain_scan.run",
                args=[job_id, target],
                queue="domain_scan",
            )
        else:
            logger.warning("Unsupported schedule scan_type={scan_type}", scan_type=scan_type)
            return None
        task_id = result.id
        return str(task_id) if task_id is not None else None
    except Exception as exc:
        logger.exception("Failed to dispatch scheduled scan: {error}", error=exc)
        return None


@shared_task(name="schedules.run_due")  # type: ignore[misc]
def run_due_schedules(limit: int = 50) -> dict[str, Any]:
    session = get_sync_session()
    enqueued = 0
    skipped = 0
    errors = 0
    try:
        rows = session.execute(
            text(
                """
                SELECT id, user_id, scan_type, target, cadence, timezone, next_run_at, last_job_id
                FROM scan_schedules
                WHERE enabled = true
                  AND next_run_at <= NOW()
                ORDER BY next_run_at ASC
                LIMIT :lim
                FOR UPDATE SKIP LOCKED
                """
            ),
            {"lim": limit},
        ).fetchall()

        for row in rows:
            schedule_id = row[0]
            user_id = row[1]
            scan_type = row[2]
            target = row[3]
            cadence = row[4]
            timezone = row[5]
            next_run_at = row[6]
            last_job_id = row[7]

            if last_job_id:
                st = session.execute(
                    text("SELECT status FROM scan_jobs WHERE id = :jid"),
                    {"jid": last_job_id},
                ).scalar()
                if st in ("pending", "running"):
                    skipped += 1
                    continue

            pricing = session.execute(
                text("SELECT credit_cost FROM pricing WHERE scan_type = :st LIMIT 1"),
                {"st": scan_type},
            ).scalar()
            credit_cost = int(pricing) if pricing is not None else 0

            credits = session.execute(
                text("SELECT credits FROM users WHERE id = :uid"),
                {"uid": user_id},
            ).scalar()
            if credits is None:
                errors += 1
                continue
            if credit_cost > 0 and int(credits) < credit_cost:
                session.execute(
                    text(
                        """
                        UPDATE scan_schedules
                        SET last_error = :err, enabled = false, updated_at = NOW()
                        WHERE id = :sid
                        """
                    ),
                    {
                        "err": f"Insufficient credits. Need {credit_cost}, have {credits}.",
                        "sid": schedule_id,
                    },
                )
                session.commit()
                errors += 1
                continue

            job_id = uuid.uuid4()
            if credit_cost > 0:
                upd = session.execute(
                    text(
                        """
                        UPDATE users SET credits = credits - :cost
                        WHERE id = :uid AND credits >= :cost
                        RETURNING credits
                        """
                    ),
                    {"cost": credit_cost, "uid": user_id},
                ).scalar()
                if upd is None:
                    session.execute(
                        text(
                            """
                            UPDATE scan_schedules
                            SET last_error = :err, enabled = false, updated_at = NOW()
                            WHERE id = :sid
                            """
                        ),
                        {"err": "Insufficient credits (race)", "sid": schedule_id},
                    )
                    session.commit()
                    errors += 1
                    continue

            session.execute(
                text(
                    """
                    INSERT INTO scan_jobs (
                        id, scan_type, target, status, progress, user_id, credit_cost, created_at
                    ) VALUES (
                        :id, :scan_type, :target, 'pending', 0, :user_id, :credit_cost, NOW()
                    )
                    """
                ),
                {
                    "id": job_id,
                    "scan_type": scan_type,
                    "target": target,
                    "user_id": user_id,
                    "credit_cost": credit_cost,
                },
            )
            if credit_cost > 0:
                session.execute(
                    text(
                        """
                        INSERT INTO credit_logs (id, user_id, amount, type, description, reference_id, created_at)
                        VALUES (:id, :uid, :amount, 'deduct', :desc, :ref, NOW())
                        """
                    ),
                    {
                        "id": uuid.uuid4(),
                        "uid": user_id,
                        "amount": credit_cost,
                        "desc": f"Scheduled scan: {scan_type} on {target}",
                        "ref": job_id,
                    },
                )

            task_id = _dispatch_scan(str(job_id), scan_type, target)
            if not task_id:
                if credit_cost > 0:
                    session.execute(
                        text("UPDATE users SET credits = credits + :cost WHERE id = :uid"),
                        {"cost": credit_cost, "uid": user_id},
                    )
                session.execute(
                    text(
                        """
                        UPDATE scan_jobs
                        SET status = 'failed',
                            result_summary = CAST(:summary AS jsonb),
                            completed_at = NOW()
                        WHERE id = :jid
                        """
                    ),
                    {
                        "summary": '{"error": "failed to dispatch scheduled scan"}',
                        "jid": job_id,
                    },
                )
                session.execute(
                    text(
                        """
                        UPDATE scan_schedules
                        SET last_error = :err, updated_at = NOW()
                        WHERE id = :sid
                        """
                    ),
                    {"err": "Failed to dispatch scan task", "sid": schedule_id},
                )
                session.commit()
                errors += 1
                continue

            session.execute(
                text("UPDATE scan_jobs SET celery_task_id = :tid WHERE id = :jid"),
                {"tid": task_id, "jid": job_id},
            )

            if isinstance(next_run_at, datetime):
                base_next = next_run_at if next_run_at.tzinfo else next_run_at.replace(tzinfo=UTC)
            else:
                base_next = datetime.now(UTC)
            new_next = _advance_next_run(cadence, timezone or "Asia/Jakarta", base_next)

            session.execute(
                text(
                    """
                    UPDATE scan_schedules
                    SET last_run_at = NOW(),
                        last_job_id = :jid,
                        next_run_at = :next_run,
                        last_error = NULL,
                        updated_at = NOW()
                    WHERE id = :sid
                    """
                ),
                {"jid": job_id, "next_run": new_next, "sid": schedule_id},
            )
            session.commit()
            enqueued += 1
            logger.info(
                "Enqueued scheduled scan schedule_id={sid} job_id={jid} type={st} target={target}",
                sid=schedule_id,
                jid=job_id,
                st=scan_type,
                target=target,
            )

        return {"enqueued": enqueued, "skipped": skipped, "errors": errors, "examined": len(rows)}
    except Exception:
        session.rollback()
        logger.exception("run_due_schedules failed")
        raise
    finally:
        session.close()
