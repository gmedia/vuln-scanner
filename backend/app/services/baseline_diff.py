"""Baseline diff: compare completed scan findings vs prior job on same target.

Fingerprint (deterministic identity key):
  title_norm = lower + collapse whitespace
  cve = upper strip or empty
  category = lower strip or empty
  port = raw_data keys port / Port / portid as str, else empty
  path = raw_data keys path / url / endpoint if present, else empty
  fingerprint = f"{category}|{cve}|{port}|{path}|{title_norm}"
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import cast
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.schemas.scan import ScanDiffResponse

_WS_RE = re.compile(r"\s+")

SEVERITY_RANK: dict[str, int] = {
    "info": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


@dataclass(frozen=True)
class DiffResult:
    new_critical: int
    new_high: int
    resolved: int
    worsened: int
    unchanged: int
    new_finding_ids: list[str]
    resolved_finding_ids: list[str]


def severity_rank(severity: str | None) -> int:
    if not severity:
        return 0
    return SEVERITY_RANK.get(severity.lower().strip(), 0)


def _raw_field(raw: dict[str, object] | None, *keys: str) -> str:
    if not isinstance(raw, dict):
        return ""
    for key in keys:
        if key in raw and raw[key] is not None:
            return str(raw[key])
    return ""


def finding_fingerprint(finding: object) -> str:
    title = getattr(finding, "title", None) or ""
    title_norm = _WS_RE.sub(" ", str(title).lower()).strip()
    cve_raw = getattr(finding, "cve_id", None) or ""
    cve = str(cve_raw).upper().strip()
    cat_raw = getattr(finding, "category", None) or ""
    category = str(cat_raw).lower().strip()
    raw_data = getattr(finding, "raw_data", None)
    raw = cast(dict[str, object], raw_data) if isinstance(raw_data, dict) else None
    port = _raw_field(raw, "port", "Port", "portid")
    path = _raw_field(raw, "path", "url", "endpoint")
    return f"{category}|{cve}|{port}|{path}|{title_norm}"


def _index_by_fingerprint(findings: Sequence[object]) -> dict[str, object]:
    indexed: dict[str, object] = {}
    for finding in findings:
        fp = finding_fingerprint(finding)
        if fp not in indexed:
            indexed[fp] = finding
    return indexed


def _finding_id(finding: object) -> str:
    return str(getattr(finding, "id", ""))


def _finding_severity(finding: object) -> str | None:
    value = getattr(finding, "severity", None)
    if value is None:
        return None
    return str(cast(object, value))


def diff_findings(baseline: Sequence[object], current: Sequence[object]) -> DiffResult:
    base_map = _index_by_fingerprint(baseline)
    curr_map = _index_by_fingerprint(current)

    base_fps = set(base_map)
    curr_fps = set(curr_map)

    new_fps = curr_fps - base_fps
    resolved_fps = base_fps - curr_fps
    shared_fps = curr_fps & base_fps

    new_finding_ids = [_finding_id(curr_map[fp]) for fp in sorted(new_fps)]
    resolved_finding_ids = [_finding_id(base_map[fp]) for fp in sorted(resolved_fps)]

    new_critical = 0
    new_high = 0
    for fp in new_fps:
        sev = (_finding_severity(curr_map[fp]) or "").lower().strip()
        if sev == "critical":
            new_critical += 1
        elif sev == "high":
            new_high += 1

    worsened = 0
    unchanged = 0
    for fp in shared_fps:
        curr_rank = severity_rank(_finding_severity(curr_map[fp]))
        base_rank = severity_rank(_finding_severity(base_map[fp]))
        if curr_rank > base_rank:
            worsened += 1
        else:
            unchanged += 1

    return DiffResult(
        new_critical=new_critical,
        new_high=new_high,
        resolved=len(resolved_fps),
        worsened=worsened,
        unchanged=unchanged,
        new_finding_ids=new_finding_ids,
        resolved_finding_ids=resolved_finding_ids,
    )


def empty_diff_response() -> ScanDiffResponse:
    return ScanDiffResponse(
        compared_to_job_id=None,
        new_critical=0,
        new_high=0,
        resolved=0,
        worsened=0,
        unchanged=0,
        new_finding_ids=[],
        resolved_finding_ids=[],
    )


def _job_anchor(job: ScanJob) -> datetime:
    return job.completed_at if job.completed_at is not None else job.created_at


async def get_scan_diff(db: AsyncSession, job_id: str, user_id: UUID) -> ScanDiffResponse:
    try:
        job_uuid = uuid.UUID(str(job_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Scan job not found") from None

    result = await db.execute(select(ScanJob).where(ScanJob.id == job_uuid, ScanJob.user_id == user_id))
    current_job = result.scalar_one_or_none()
    if current_job is None:
        raise HTTPException(status_code=404, detail="Scan job not found")

    if current_job.status != "completed":
        raise HTTPException(status_code=400, detail="Scan job must be completed to compute diff")

    current_anchor = _job_anchor(current_job)

    prior_q = select(ScanJob).where(
        ScanJob.user_id == user_id,
        ScanJob.scan_type == current_job.scan_type,
        ScanJob.target == current_job.target,
        ScanJob.status == "completed",
        ScanJob.id != current_job.id,
    )
    prior_result = await db.execute(prior_q)
    prior_candidates = list(prior_result.scalars().all())
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
        return empty_diff_response()

    curr_findings_r = await db.execute(select(ScanFinding).where(ScanFinding.job_id == current_job.id))
    base_findings_r = await db.execute(select(ScanFinding).where(ScanFinding.job_id == prior_job.id))
    current_findings = list(curr_findings_r.scalars().all())
    baseline_findings = list(base_findings_r.scalars().all())

    diff = diff_findings(baseline_findings, current_findings)
    return ScanDiffResponse(
        compared_to_job_id=prior_job.id,
        new_critical=diff.new_critical,
        new_high=diff.new_high,
        resolved=diff.resolved,
        worsened=diff.worsened,
        unchanged=diff.unchanged,
        new_finding_ids=diff.new_finding_ids,
        resolved_finding_ids=diff.resolved_finding_ids,
    )
