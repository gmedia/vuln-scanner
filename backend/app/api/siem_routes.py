from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.siem import SiemEventListResponse, SiemEventResponse, SiemStatusResponse
from app.services.auth import get_active_org_id, get_current_user
from app.services.siem import SiemService

router = APIRouter(prefix="/siem", tags=["siem"])


@router.get("/status", response_model=SiemStatusResponse)
async def siem_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemStatusResponse:
    data = await SiemService(db).status(current_user, get_active_org_id(request))
    return SiemStatusResponse.model_validate(data)


@router.get("/events", response_model=SiemEventListResponse)
async def list_siem_events(
    request: Request,
    since: datetime | None = None,
    until: datetime | None = None,
    min_level: int | None = Query(default=None, ge=0, le=15),
    max_level: int | None = Query(default=None, ge=0, le=15),
    agent_id: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=128),
    limit: int | None = Query(default=None, ge=1, le=50),
    query: str | None = Query(default=None, include_in_schema=False),
    dsl: str | None = Query(default=None, include_in_schema=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemEventListResponse:
    if query is not None or dsl is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="raw query/dsl is not allowed")
    data = await SiemService(db).list_events(
        current_user,
        get_active_org_id(request),
        since=since,
        until=until,
        min_level=min_level,
        max_level=max_level,
        agent_id=agent_id,
        q=q,
        limit=limit,
    )
    return SiemEventListResponse.model_validate(data)


@router.get("/events/{external_id}", response_model=SiemEventResponse)
async def get_siem_event(
    request: Request,
    external_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemEventResponse:
    data = await SiemService(db).get_event(current_user, get_active_org_id(request), external_id)
    return SiemEventResponse.model_validate(data)
