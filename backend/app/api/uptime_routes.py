from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.uptime import (
    UptimeEventResponse,
    UptimeMonitorCreate,
    UptimeMonitorResponse,
    UptimeMonitorUpdate,
    UptimeSampleResponse,
)
from app.services.auth import get_active_org_id, get_current_user
from app.services.uptime import UptimeService

router = APIRouter(prefix="/uptime", tags=["uptime"])


@router.get("/monitors", response_model=list[UptimeMonitorResponse])
async def list_monitors(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UptimeMonitorResponse]:
    return await UptimeService(db).list_monitors(current_user, get_active_org_id(request))


@router.post("/monitors", response_model=UptimeMonitorResponse, status_code=201)
async def create_monitor(
    request: Request,
    body: UptimeMonitorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UptimeMonitorResponse:
    return await UptimeService(db).create(current_user, get_active_org_id(request), body)


@router.get("/monitors/{monitor_id}", response_model=UptimeMonitorResponse)
async def get_monitor(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UptimeMonitorResponse:
    return await UptimeService(db).get(current_user, get_active_org_id(request), monitor_id)


@router.patch("/monitors/{monitor_id}", response_model=UptimeMonitorResponse)
async def update_monitor(
    request: Request,
    monitor_id: UUID,
    body: UptimeMonitorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UptimeMonitorResponse:
    return await UptimeService(db).update(current_user, get_active_org_id(request), monitor_id, body)


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await UptimeService(db).delete(current_user, get_active_org_id(request), monitor_id)


@router.get("/monitors/{monitor_id}/samples", response_model=list[UptimeSampleResponse])
async def list_samples(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UptimeSampleResponse]:
    rows = await UptimeService(db).list_samples(current_user, get_active_org_id(request), monitor_id)
    return [UptimeSampleResponse.model_validate(r) for r in rows]


@router.get("/monitors/{monitor_id}/events", response_model=list[UptimeEventResponse])
async def list_events(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UptimeEventResponse]:
    rows = await UptimeService(db).list_events(current_user, get_active_org_id(request), monitor_id)
    return [UptimeEventResponse.model_validate(r) for r in rows]
