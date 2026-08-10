import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_job import ScanJob
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.schemas.schedule import MAX_SCHEDULES_PER_USER, ScheduleCreate, ScheduleResponse, ScheduleUpdate
from app.services.organization import get_membership, role_at_least
from app.services.scanner import ScannerService


def compute_next_run_at(
    cadence: str,
    timezone: str,
    *,
    from_dt: datetime | None = None,
) -> datetime:
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("Asia/Jakarta")

    now_local = (from_dt or datetime.now(UTC)).astimezone(tz)
    candidate = now_local.replace(hour=2, minute=0, second=0, microsecond=0)
    if candidate <= now_local:
        candidate = candidate + timedelta(days=1)

    if cadence == "weekly":
        days_ahead = (0 - candidate.weekday()) % 7
        if days_ahead == 0 and candidate <= now_local:
            days_ahead = 7
        if candidate.weekday() != 0:
            candidate = candidate + timedelta(days=days_ahead if days_ahead else 7)
            candidate = candidate.replace(hour=2, minute=0, second=0, microsecond=0)
        elif candidate <= now_local:
            candidate = candidate + timedelta(days=7)
    elif cadence == "monthly":
        if candidate.day != 1 or candidate <= now_local:
            year = candidate.year + (1 if candidate.month == 12 else 0)
            month = 1 if candidate.month == 12 else candidate.month + 1
            candidate = candidate.replace(year=year, month=month, day=1, hour=2, minute=0, second=0, microsecond=0)
    else:
        raise ValueError(f"Unknown cadence: {cadence}")

    return candidate.astimezone(UTC)


def advance_next_run(cadence: str, timezone: str, last_next: datetime) -> datetime:
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("Asia/Jakarta")
    local = last_next.astimezone(tz)
    if cadence == "weekly":
        local = local + timedelta(days=7)
    else:
        year = local.year + (1 if local.month == 12 else 0)
        month = 1 if local.month == 12 else local.month + 1
        day = min(local.day, 28)
        local = local.replace(year=year, month=month, day=day)
    return local.astimezone(UTC)


class ScheduleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _can_read(self, schedule: ScanSchedule, user_id: UUID) -> bool:
        if schedule.user_id == user_id:
            return True
        if schedule.organization_id is None:
            return False
        membership = await get_membership(self.db, schedule.organization_id, user_id)
        return membership is not None and role_at_least(membership.role, "viewer")

    async def _can_mutate(self, schedule: ScanSchedule, user_id: UUID) -> bool:
        if schedule.organization_id is None:
            return schedule.user_id == user_id
        membership = await get_membership(self.db, schedule.organization_id, user_id)
        if membership is None:
            return False
        if role_at_least(membership.role, "admin"):
            return True
        return bool(role_at_least(membership.role, "member") and schedule.user_id == user_id)

    async def list_for_user(
        self,
        user_id: UUID,
        organization_id: UUID | None = None,
    ) -> list[ScheduleResponse]:
        if organization_id is not None:
            membership = await get_membership(self.db, organization_id, user_id)
            if membership is None or not role_at_least(membership.role, "viewer"):
                raise HTTPException(status_code=404, detail="Organization not found")
            result = await self.db.execute(
                select(ScanSchedule)
                .where(ScanSchedule.organization_id == organization_id)
                .order_by(ScanSchedule.created_at.desc())
            )
        else:
            result = await self.db.execute(
                select(ScanSchedule).where(ScanSchedule.user_id == user_id).order_by(ScanSchedule.created_at.desc())
            )
        rows = result.scalars().all()
        return [ScheduleResponse.model_validate(r) for r in rows]

    async def create(
        self,
        user: User,
        body: ScheduleCreate,
        organization_id: UUID | None = None,
    ) -> ScheduleResponse:
        if organization_id is not None:
            membership = await get_membership(self.db, organization_id, user.id)
            if membership is None:
                raise HTTPException(status_code=404, detail="Organization not found")
            if not role_at_least(membership.role, "member"):
                raise HTTPException(status_code=403, detail="Insufficient organization role")

        count_result = await self.db.execute(
            select(ScanSchedule).where(ScanSchedule.user_id == user.id, ScanSchedule.enabled.is_(True))
        )
        enabled_count = len(count_result.scalars().all())
        if body.enabled and enabled_count >= MAX_SCHEDULES_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_SCHEDULES_PER_USER} enabled schedules per user",
            )

        next_run = compute_next_run_at(body.cadence, body.timezone)
        schedule = ScanSchedule(
            id=uuid.uuid4(),
            user_id=user.id,
            organization_id=organization_id,
            name=body.name,
            scan_type=body.scan_type,
            target=body.target,
            cadence=body.cadence,
            timezone=body.timezone,
            next_run_at=next_run,
            enabled=body.enabled,
            notify_email=body.notify_email or user.email,
        )
        self.db.add(schedule)
        await self.db.commit()
        await self.db.refresh(schedule)
        return ScheduleResponse.model_validate(schedule)

    async def get_owned(self, schedule_id: UUID, user_id: UUID) -> ScanSchedule:
        result = await self.db.execute(select(ScanSchedule).where(ScanSchedule.id == schedule_id))
        schedule = result.scalar_one_or_none()
        if schedule is None or not await self._can_read(schedule, user_id):
            raise HTTPException(status_code=404, detail="Schedule not found")
        return schedule

    async def update(self, schedule_id: UUID, user_id: UUID, body: ScheduleUpdate) -> ScheduleResponse:
        schedule = await self.get_owned(schedule_id, user_id)
        if not await self._can_mutate(schedule, user_id):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        data = body.model_dump(exclude_unset=True)
        if data.get("enabled") is True and not schedule.enabled:
            count_result = await self.db.execute(
                select(ScanSchedule).where(
                    ScanSchedule.user_id == user_id,
                    ScanSchedule.enabled.is_(True),
                    ScanSchedule.id != schedule.id,
                )
            )
            enabled_count = len(count_result.scalars().all())
            if enabled_count >= MAX_SCHEDULES_PER_USER:
                raise HTTPException(
                    status_code=400,
                    detail=f"Maximum {MAX_SCHEDULES_PER_USER} enabled schedules per user",
                )
            schedule.last_error = None
        if "cadence" in data or "timezone" in data:
            cadence = data.get("cadence", schedule.cadence)
            timezone = data.get("timezone", schedule.timezone)
            schedule.next_run_at = compute_next_run_at(cadence, timezone)
        for key, value in data.items():
            setattr(schedule, key, value)
        schedule.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(schedule)
        return ScheduleResponse.model_validate(schedule)

    async def delete(self, schedule_id: UUID, user_id: UUID) -> None:
        schedule = await self.get_owned(schedule_id, user_id)
        if not await self._can_mutate(schedule, user_id):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        await self.db.delete(schedule)
        await self.db.commit()

    async def list_runs(self, schedule_id: UUID, user_id: UUID, limit: int = 20) -> list[ScanJob]:
        schedule = await self.get_owned(schedule_id, user_id)
        query = select(ScanJob).where(
            ScanJob.scan_type == schedule.scan_type,
            ScanJob.target == schedule.target,
        )
        if schedule.organization_id is not None:
            query = query.where(ScanJob.organization_id == schedule.organization_id)
        else:
            query = query.where(ScanJob.user_id == user_id)
        result = await self.db.execute(query.order_by(ScanJob.created_at.desc()).limit(limit))
        return list(result.scalars().all())

    async def run_due_now(self, schedule: ScanSchedule, user: User) -> ScanJob | None:
        if schedule.last_job_id:
            job_result = await self.db.execute(select(ScanJob).where(ScanJob.id == schedule.last_job_id))
            last = job_result.scalar_one_or_none()
            if last and last.status in ("pending", "running"):
                return None

        svc = ScannerService(self.db)
        try:
            job = await svc.start_scan(
                user=user,
                scan_type=schedule.scan_type,
                target=schedule.target,
                organization_id=schedule.organization_id,
            )
        except HTTPException as exc:
            schedule.last_error = str(exc.detail)
            schedule.updated_at = datetime.now(UTC)
            if exc.status_code == 402:
                schedule.enabled = False
            await self.db.commit()
            raise

        schedule.last_run_at = datetime.now(UTC)
        schedule.last_job_id = job.id
        schedule.next_run_at = advance_next_run(schedule.cadence, schedule.timezone, schedule.next_run_at)
        schedule.last_error = None
        schedule.updated_at = datetime.now(UTC)
        await self.db.commit()
        return job
