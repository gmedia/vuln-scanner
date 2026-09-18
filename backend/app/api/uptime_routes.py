from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.uptime import (
    UptimeEventResponse,
    UptimeMonitorCreate,
    UptimeMonitorResponse,
    UptimeMonitorUpdate,
    UptimeSampleListResponse,
    UptimeSampleResponse,
    UptimeStatsResponse,
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


@router.post("/monitors/{monitor_id}/pause", response_model=UptimeMonitorResponse)
async def pause_monitor(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UptimeMonitorResponse:
    current = await UptimeService(db).get(current_user, get_active_org_id(request), monitor_id)
    return await UptimeService(db).pause(
        current_user, get_active_org_id(request), monitor_id, enabled=not current.enabled
    )


@router.delete("/monitors/{monitor_id}", status_code=204)
async def delete_monitor(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await UptimeService(db).delete(current_user, get_active_org_id(request), monitor_id)


@router.get("/monitors/{monitor_id}/samples", response_model=UptimeSampleListResponse)
async def list_samples(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(default=None, alias="from"),
    until: datetime | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> UptimeSampleListResponse:
    rows, total = await UptimeService(db).list_samples(
        current_user,
        get_active_org_id(request),
        monitor_id,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    return UptimeSampleListResponse(items=[UptimeSampleResponse.model_validate(r) for r in rows], total=total)


@router.get("/monitors/{monitor_id}/stats", response_model=UptimeStatsResponse)
async def get_stats(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(default=None, alias="from"),
    until: datetime | None = Query(default=None),
) -> UptimeStatsResponse:
    pct, ok_n, total, from_at, until_at = await UptimeService(db).range_stats(
        current_user, get_active_org_id(request), monitor_id, since=since, until=until
    )
    return UptimeStatsResponse(
        uptime_pct=pct, ok_count=ok_n, total_count=total, from_at=from_at, until_at=until_at
    )


@router.get("/monitors/{monitor_id}/events", response_model=list[UptimeEventResponse])
async def list_events(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    since: datetime | None = Query(default=None, alias="from"),
    until: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[UptimeEventResponse]:
    rows = await UptimeService(db).list_events(
        current_user,
        get_active_org_id(request),
        monitor_id,
        since=since,
        until=until,
        limit=limit,
    )
    return [UptimeEventResponse.model_validate(r) for r in rows]


@router.post("/monitors/{monitor_id}/rotate-token", response_model=UptimeMonitorResponse)
async def rotate_heartbeat_token(
    request: Request,
    monitor_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UptimeMonitorResponse:
    return await UptimeService(db).rotate_heartbeat(current_user, get_active_org_id(request), monitor_id)


@router.post("/heartbeat/{token}", status_code=204)
async def ingest_heartbeat(token: str, db: AsyncSession = Depends(get_db)) -> Response:
    await UptimeService(db).ingest_heartbeat(token)
    return Response(status_code=204)
