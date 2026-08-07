from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.scan import ScanJobResponse
from app.schemas.schedule import ScheduleCreate, ScheduleResponse, ScheduleUpdate
from app.services.auth import get_current_user
from app.services.schedule import ScheduleService

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScheduleResponse]:
    return await ScheduleService(db).list_for_user(current_user.id)


@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    body: ScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduleResponse:
    return await ScheduleService(db).create(current_user, body)


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduleResponse:
    schedule = await ScheduleService(db).get_owned(schedule_id, current_user.id)
    return ScheduleResponse.model_validate(schedule)


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduleResponse:
    return await ScheduleService(db).update(schedule_id, current_user.id, body)


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await ScheduleService(db).delete(schedule_id, current_user.id)


@router.get("/{schedule_id}/runs", response_model=list[ScanJobResponse])
async def list_schedule_runs(
    schedule_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScanJobResponse]:
    jobs = await ScheduleService(db).list_runs(schedule_id, current_user.id)
    return [ScanJobResponse.model_validate(j) for j in jobs]
