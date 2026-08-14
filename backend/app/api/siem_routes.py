from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.siem import (
    SiemCaseCreate,
    SiemCaseEventAttach,
    SiemCaseListResponse,
    SiemCaseNoteCreate,
    SiemCasePatch,
    SiemCaseResponse,
    SiemEventListResponse,
    SiemEventResponse,
    SiemStatusResponse,
)
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


@router.get("/cases", response_model=SiemCaseListResponse)
async def list_siem_cases(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseListResponse:
    data = await SiemService(db).list_cases(current_user, get_active_org_id(request))
    return SiemCaseListResponse.model_validate(data)


@router.post("/cases", response_model=SiemCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_siem_case(
    request: Request,
    body: SiemCaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseResponse:
    data = await SiemService(db).create_case(
        current_user,
        get_active_org_id(request),
        title=body.title,
        external_id=body.external_id,
        assignee_user_id=body.assignee_user_id,
    )
    return SiemCaseResponse.model_validate(data)


@router.get("/cases/{case_id}", response_model=SiemCaseResponse)
async def get_siem_case(
    request: Request,
    case_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseResponse:
    data = await SiemService(db).get_case(current_user, get_active_org_id(request), case_id)
    return SiemCaseResponse.model_validate(data)


@router.patch("/cases/{case_id}", response_model=SiemCaseResponse)
async def patch_siem_case(
    request: Request,
    case_id: UUID,
    body: SiemCasePatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseResponse:
    data = await SiemService(db).patch_case(
        current_user,
        get_active_org_id(request),
        case_id,
        title=body.title,
        status_value=body.status,
        assignee_user_id=body.assignee_user_id,
    )
    return SiemCaseResponse.model_validate(data)


@router.post("/cases/{case_id}/events", response_model=SiemCaseResponse)
async def attach_siem_case_event(
    request: Request,
    case_id: UUID,
    body: SiemCaseEventAttach,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseResponse:
    data = await SiemService(db).attach_event(
        current_user,
        get_active_org_id(request),
        case_id,
        body.external_id,
    )
    return SiemCaseResponse.model_validate(data)


@router.post("/cases/{case_id}/notes", response_model=SiemCaseResponse)
async def add_siem_case_note(
    request: Request,
    case_id: UUID,
    body: SiemCaseNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SiemCaseResponse:
    data = await SiemService(db).add_note(
        current_user,
        get_active_org_id(request),
        case_id,
        body.body,
    )
    return SiemCaseResponse.model_validate(data)
