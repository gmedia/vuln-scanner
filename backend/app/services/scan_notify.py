from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.i18n import DEFAULT_LOCALE, normalize_lang
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.services.baseline_diff import DiffResult, diff_findings, empty_diff_response


def should_send_diff_alert(
    new_critical: int,
    new_high: int,
    *,
    initial_report: bool = False,
    has_baseline: bool = True,
) -> bool:
    if int(new_critical) + int(new_high) > 0:
        return True
    return bool(initial_report and not has_baseline)


def _job_anchor(job: ScanJob) -> datetime:
    return job.completed_at if job.completed_at is not None else job.created_at


@dataclass(frozen=True)
class NotifyDiffContext:
    job_id: str
    target: str
    scan_type: str
    email_to: str
    diff: DiffResult
    has_baseline: bool
    schedule_id: str | None
    locale: str = DEFAULT_LOCALE


def resolve_notify_email(session: Session, job: ScanJob) -> str | None:
    sched = session.execute(
        select(ScanSchedule).where(ScanSchedule.last_job_id == job.id).limit(1)
    ).scalar_one_or_none()
    if sched is not None and sched.notify_email:
        return str(sched.notify_email).strip() or None

    user = session.execute(select(User).where(User.id == job.user_id)).scalar_one_or_none()
    if user is None:
        return None
    email = (user.email or "").strip()
    return email or None


def compute_diff_sync(session: Session, job: ScanJob) -> tuple[DiffResult, bool, UUID | None]:
    if job.status != "completed":
        empty = empty_diff_response()
        return (
            DiffResult(
                new_critical=empty.new_critical,
                new_high=empty.new_high,
                resolved=empty.resolved,
                worsened=empty.worsened,
                unchanged=empty.unchanged,
                new_finding_ids=list(empty.new_finding_ids),
                resolved_finding_ids=list(empty.resolved_finding_ids),
            ),
            False,
            None,
        )

    current_anchor = _job_anchor(job)
    prior_candidates = list(
        session.execute(
            select(ScanJob).where(
                ScanJob.user_id == job.user_id,
                ScanJob.scan_type == job.scan_type,
                ScanJob.target == job.target,
                ScanJob.status == "completed",
                ScanJob.id != job.id,
            )
        )
        .scalars()
        .all()
    )
    prior_candidates.sort(
        key=lambda j: (
            0 if j.completed_at is not None else 1,
            -(j.completed_at.timestamp() if j.completed_at is not None else 0.0),
            -j.created_at.timestamp(),
        )
    )
    prior_job: ScanJob | None = None
    for candidate in prior_candidates:
        if _job_anchor(candidate) < current_anchor:
            prior_job = candidate
            break

    if prior_job is None:
        return (
            DiffResult(
                new_critical=0,
                new_high=0,
                resolved=0,
                worsened=0,
                unchanged=0,
                new_finding_ids=[],
                resolved_finding_ids=[],
            ),
            False,
            None,
        )

    current_findings = list(session.execute(select(ScanFinding).where(ScanFinding.job_id == job.id)).scalars().all())
    baseline_findings = list(
        session.execute(select(ScanFinding).where(ScanFinding.job_id == prior_job.id)).scalars().all()
    )
    return diff_findings(baseline_findings, current_findings), True, prior_job.id


def build_notify_context(session: Session, job_id: str) -> NotifyDiffContext | None:
    try:
        job_uuid = UUID(str(job_id))
    except ValueError:
        return None

    job = session.execute(select(ScanJob).where(ScanJob.id == job_uuid)).scalar_one_or_none()
    if job is None or job.status != "completed":
        return None

    email_to = resolve_notify_email(session, job)
    if not email_to:
        return None

    owner = session.execute(select(User).where(User.id == job.user_id)).scalar_one_or_none()
    locale = normalize_lang(getattr(owner, "locale", None) if owner is not None else DEFAULT_LOCALE)

    diff, has_baseline, _prior = compute_diff_sync(session, job)
    sched = session.execute(
        select(ScanSchedule).where(ScanSchedule.last_job_id == job.id).limit(1)
    ).scalar_one_or_none()

    return NotifyDiffContext(
        job_id=str(job.id),
        target=str(job.target),
        scan_type=str(job.scan_type),
        email_to=email_to,
        diff=diff,
        has_baseline=has_baseline,
        schedule_id=str(sched.id) if sched is not None else None,
        locale=locale,
    )
