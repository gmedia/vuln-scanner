import math
import uuid
from uuid import UUID

from celery import Celery
from celery.exceptions import CeleryError
from celery.result import AsyncResult
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.scan import PaginatedResponse, ScanFindingResponse, ScanJobDetailResponse, ScanJobResponse

celery_app = Celery(
    "vuln_scanner_api",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
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
    ) -> ScanJob:
        result = await self.db.execute(select(PricingConfig).where(PricingConfig.scan_type == scan_type))
        pricing = result.scalar_one_or_none()
        if pricing:
            credit_cost = pricing.credit_cost
        else:
            config_attr = settings.scan_type_pricing_map.get(scan_type, "")
            credit_cost = getattr(settings, config_attr, 0) if config_attr else 0

        # Atomic check-and-deduct: only deduct if user has enough credits
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

    async def get_job(self, job_id: str, user_id: UUID) -> ScanJobDetailResponse | None:
        query = select(ScanJob).where(ScanJob.id == job_id, ScanJob.user_id == user_id)
        result = await self.db.execute(query)
        job = result.scalar_one_or_none()
        if not job:
            return None

        findings_result = await self.db.execute(select(ScanFinding).where(ScanFinding.job_id == job_id))
        findings = findings_result.scalars().all()

        detail = ScanJobDetailResponse.model_validate(job)
        detail.findings = [ScanFindingResponse.model_validate(f) for f in findings]
        return detail

    async def get_findings(self, job_id: str, user_id: UUID) -> list[ScanFindingResponse]:
        # Verify job exists and belongs to user before returning findings
        job_result = await self.db.execute(select(ScanJob.id).where(ScanJob.id == job_id, ScanJob.user_id == user_id))
        if not job_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Scan job not found")
        result = await self.db.execute(select(ScanFinding).where(ScanFinding.job_id == job_id))
        findings = result.scalars().all()
        return [ScanFindingResponse.model_validate(f) for f in findings]

    async def get_history(
        self,
        page: int = 1,
        limit: int = 20,
        scan_type: str | None = None,
        user_id: UUID | None = None,
    ) -> PaginatedResponse:
        query = select(ScanJob)
        count_query = select(func.count(ScanJob.id))

        if scan_type:
            if scan_type not in ("ip", "domain", "apk", "ipa"):
                raise HTTPException(status_code=400, detail="Invalid scan type")
            query = query.where(ScanJob.scan_type == scan_type)
            count_query = count_query.where(ScanJob.scan_type == scan_type)

        if user_id is not None:
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
