import math
import uuid
from uuid import UUID

from celery import Celery
from celery.exceptions import CeleryError
from celery.result import AsyncResult
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import settings
from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.scan import (
    PaginatedFindingsResponse,
    PaginatedResponse,
    ScanFindingResponse,
    ScanJobDetailResponse,
    ScanJobResponse,
)
from app.services.organization import get_membership, role_at_least

celery_app = Celery(
    "vuln_scanner",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "ip_scan.run": {"queue": "ip_scan"},
        "domain_scan.run": {"queue": "domain_scan"},
        "mobile_scan.run": {"queue": "mobile_scan"},
    },
    broker_connection_retry_on_startup=True,
)


class ScannerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_scan(
        self,
        user: User,
        scan_type: str,
        target: str,
        ports: str | None = None,
        platform: str | None = None,
        file_path: str | None = None,
        organization_id: UUID | None = None,
    ) -> ScanJob:
        if organization_id is not None:
            membership = await get_membership(self.db, organization_id, user.id)
            if membership is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            if not role_at_least(membership.role, "member"):
                raise HTTPException(status_code=403, detail="Insufficient organization role")

        result = await self.db.execute(select(PricingConfig).where(PricingConfig.scan_type == scan_type))
        pricing = result.scalar_one_or_none()
        if pricing:
            credit_cost = pricing.credit_cost
        else:
            config_attr = settings.scan_type_pricing_map.get(scan_type, "")
            credit_cost = getattr(settings, config_attr, 0) if config_attr else 0

        if credit_cost > 0:
            await self.db.execute(
                text("UPDATE users SET credits = credits - :cost WHERE id = :uid AND credits >= :cost"),
                {"cost": credit_cost, "uid": user.id.hex},
            )
            await self.db.flush()
            check_result = await self.db.execute(select(User.credits).where(User.id == user.id))
            current_credits = check_result.scalar_one()
            if current_credits == user.credits:
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits. Need {credit_cost}, have {user.credits}.",
                )

        job = ScanJob(
            id=uuid.uuid4(),
            scan_type=scan_type,
            target=target,
            status="pending",
            progress=0,
            user_id=user.id,
            organization_id=organization_id,
            credit_cost=credit_cost,
        )
        self.db.add(job)
        await self.db.flush()

        credit_log = CreditLog(
            user_id=user.id,
            amount=credit_cost,
            type="deduct",
            description=f"Scan: {scan_type} on {target}",
            reference_id=job.id,
        )
        self.db.add(credit_log)
        await self.db.flush()

        try:
            task = self._dispatch_task(str(job.id), scan_type, target, ports, platform, file_path)
        except CeleryError:
            # Rollback credit deduction and job creation
            await self.db.execute(
                text("UPDATE users SET credits = credits + :cost WHERE id = :uid"),
                {"cost": credit_cost, "uid": user.id.hex},
            )
            refund_log = CreditLog(
                user_id=user.id,
                amount=credit_cost,
                type="refund",
                description=f"Refund: failed to dispatch {scan_type} scan on {target}",
                reference_id=job.id,
            )
            self.db.add(refund_log)
            await self.db.commit()
            raise HTTPException(status_code=500, detail="Failed to dispatch scan task") from None

        job.celery_task_id = task.id
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        return job

    def _dispatch_task(
        self,
        job_id: str,
        scan_type: str,
        target: str,
        ports: str | None,
        platform: str | None,
        file_path: str | None = None,
    ) -> AsyncResult:
        if scan_type == "ip":
            return celery_app.send_task(
                "ip_scan.run",
                args=[job_id, target, ports or "1-1000"],
                queue="ip_scan",
            )
        elif scan_type == "domain":
            return celery_app.send_task(
                "domain_scan.run",
                args=[job_id, target],
                queue="domain_scan",
            )
        elif scan_type in ("apk", "ipa"):
            return celery_app.send_task(
                "mobile_scan.run",
                args=[job_id, file_path or target, platform or "unknown"],
                queue="mobile_scan",
            )
        raise ValueError(f"Unknown scan type: {scan_type}")

    async def _can_access_job(self, job: ScanJob, user_id: UUID) -> bool:
        if job.user_id == user_id:
            return True
        if job.organization_id is None:
            return False
        membership = await get_membership(self.db, job.organization_id, user_id)
        return membership is not None and role_at_least(membership.role, "viewer")

    async def get_job(self, job_id: str, user_id: UUID, *, include_raw: bool = False) -> ScanJobDetailResponse | None:
        result = await self.db.execute(select(ScanJob).where(ScanJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return None
        if not await self._can_access_job(job, user_id):
            return None

        findings_q = select(ScanFinding).where(ScanFinding.job_id == job_id)
        if not include_raw:
            findings_q = findings_q.options(defer(ScanFinding.raw_data))
        findings_result = await self.db.execute(findings_q)
        findings = findings_result.scalars().all()

        detail = ScanJobDetailResponse.model_validate(job)
        if include_raw:
            detail.findings = [self._finding_response(f, include_raw=True) for f in findings]
        else:
            detail.findings = []
        return detail

    async def get_findings(
        self,
        job_id: str,
        user_id: UUID,
        *,
        page: int = 1,
        limit: int = 50,
    ) -> PaginatedFindingsResponse:
        result = await self.db.execute(select(ScanJob).where(ScanJob.id == job_id))
        job = result.scalar_one_or_none()
        if job is None or not await self._can_access_job(job, user_id):
            raise HTTPException(status_code=404, detail="Scan job not found")
        count_result = await self.db.execute(select(func.count(ScanFinding.id)).where(ScanFinding.job_id == job_id))
        total = count_result.scalar() or 0
        findings_result = await self.db.execute(
            select(ScanFinding)
            .where(ScanFinding.job_id == job_id)
            .options(defer(ScanFinding.raw_data))
            .order_by(ScanFinding.found_at.desc(), ScanFinding.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        findings = findings_result.scalars().all()
        return PaginatedFindingsResponse(
            items=[self._finding_response(f, include_raw=False) for f in findings],
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total > 0 else 0,
        )

    async def get_finding(self, job_id: str, finding_id: str, user_id: UUID) -> ScanFindingResponse:
        result = await self.db.execute(select(ScanJob).where(ScanJob.id == job_id))
        job = result.scalar_one_or_none()
        if job is None or not await self._can_access_job(job, user_id):
            raise HTTPException(status_code=404, detail="Scan job not found")
        finding_result = await self.db.execute(
            select(ScanFinding).where(ScanFinding.id == finding_id, ScanFinding.job_id == job.id)
        )
        finding = finding_result.scalar_one_or_none()
        if finding is None:
            raise HTTPException(status_code=404, detail="Finding not found")
        return self._finding_response(finding, include_raw=True)

    @staticmethod
    def _finding_response(finding: ScanFinding, *, include_raw: bool) -> ScanFindingResponse:
        return ScanFindingResponse(
            id=finding.id,
            job_id=finding.job_id,
            severity=finding.severity,
            category=finding.category,
            title=finding.title,
            description=finding.description,
            cve_id=finding.cve_id,
            cvss_score=finding.cvss_score,
            remediation=finding.remediation,
            impact=finding.impact,
            attacker_benefit=finding.attacker_benefit,
            raw_data=finding.raw_data if include_raw else None,
            found_at=finding.found_at,
        )

    async def get_history(
        self,
        page: int = 1,
        limit: int = 20,
        scan_type: str | None = None,
        user_id: UUID | None = None,
        organization_id: UUID | None = None,
    ) -> PaginatedResponse:
        query = select(ScanJob)
        count_query = select(func.count(ScanJob.id))

        if scan_type:
            if scan_type not in ("ip", "domain", "apk", "ipa"):
                raise HTTPException(status_code=400, detail="Invalid scan type")
            query = query.where(ScanJob.scan_type == scan_type)
            count_query = count_query.where(ScanJob.scan_type == scan_type)

        if organization_id is not None:
            if user_id is None:
                raise HTTPException(status_code=401, detail="Authentication required")
            membership = await get_membership(self.db, organization_id, user_id)
            if membership is None or not role_at_least(membership.role, "viewer"):
                raise HTTPException(status_code=404, detail="Organization not found")
            query = query.where(ScanJob.organization_id == organization_id)
            count_query = count_query.where(ScanJob.organization_id == organization_id)
        elif user_id is not None:
            query = query.where(ScanJob.user_id == user_id)
            count_query = count_query.where(ScanJob.user_id == user_id)

        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        query = query.order_by(ScanJob.created_at.desc())
        query = query.offset((page - 1) * limit).limit(limit)

        result = await self.db.execute(query)
        jobs = result.scalars().all()

        return PaginatedResponse(
            items=[ScanJobResponse.model_validate(j) for j in jobs],
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total > 0 else 0,
        )
