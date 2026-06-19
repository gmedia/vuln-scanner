import uuid
import math
from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.config import settings
from app.models.scan_job import ScanJob
from app.models.scan_finding import ScanFinding
from app.schemas.scan import ScanJobResponse, ScanJobDetailResponse, ScanFindingResponse, PaginatedResponse

celery_app = Celery(
    "vuln_scanner_api",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)


class ScannerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_scan(self, scan_type: str, target: str, ports: str | None = None, platform: str | None = None, file_path: str | None = None) -> ScanJob:
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type=scan_type,
            target=target,
            status="pending",
            progress=0,
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        task = self._dispatch_task(str(job.id), scan_type, target, ports, platform, file_path)
        job.celery_task_id = task.id
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        return job

    def _dispatch_task(self, job_id: str, scan_type: str, target: str, ports: str | None, platform: str | None, file_path: str | None = None):
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

    async def get_job(self, job_id: str) -> ScanJobDetailResponse | None:
        result = await self.db.execute(
            select(ScanJob).where(ScanJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if not job:
            return None

        findings_result = await self.db.execute(
            select(ScanFinding).where(ScanFinding.job_id == job_id)
        )
        findings = findings_result.scalars().all()

        detail = ScanJobDetailResponse.model_validate(job)
        detail.findings = [ScanFindingResponse.model_validate(f) for f in findings]
        return detail

    async def get_findings(self, job_id: str) -> list[ScanFindingResponse]:
        result = await self.db.execute(
            select(ScanFinding).where(ScanFinding.job_id == job_id)
        )
        findings = result.scalars().all()
        return [ScanFindingResponse.model_validate(f) for f in findings]

    async def get_history(self, page: int = 1, limit: int = 20, scan_type: str | None = None) -> PaginatedResponse:
        query = select(ScanJob)
        count_query = select(func.count(ScanJob.id))

        if scan_type:
            query = query.where(ScanJob.scan_type == scan_type)
            count_query = count_query.where(ScanJob.scan_type == scan_type)

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
