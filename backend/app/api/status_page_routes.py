from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.status_page import (
    StatusComponentCreate,
    StatusHostnameBody,
    StatusIncidentCreate,
    StatusIncidentUpdateCreate,
    StatusPageCreate,
    StatusPageResponse,
    StatusPageUpdate,
)
from app.services.auth import get_active_org_id, get_current_user
from app.services.status_page import StatusPageService

router = APIRouter(prefix="/status-page", tags=["status-page"])


@router.get("", response_model=StatusPageResponse | None)
async def get_page(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse | None:
    return await StatusPageService(db).get_mine(current_user, get_active_org_id(request))


@router.put("", response_model=StatusPageResponse)
async def upsert_page(
    request: Request,
    body: StatusPageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).upsert(current_user, get_active_org_id(request), body)


@router.patch("", response_model=StatusPageResponse)
async def patch_page(
    request: Request,
    body: StatusPageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).update(current_user, get_active_org_id(request), body)


@router.post("/hostname", response_model=StatusPageResponse, status_code=201)
async def attach_hostname(
    request: Request,
    body: StatusHostnameBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).attach_hostname(current_user, get_active_org_id(request), body)


@router.put("/hostname", response_model=StatusPageResponse)
async def replace_hostname(
    request: Request,
    body: StatusHostnameBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).replace_hostname(current_user, get_active_org_id(request), body)


@router.delete("/hostname", response_model=StatusPageResponse)
async def detach_hostname(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).detach_hostname(current_user, get_active_org_id(request))


@router.post("/hostname/check", response_model=StatusPageResponse)
async def check_hostname(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).check_hostname(current_user, get_active_org_id(request))


@router.post("/verify-hostname", response_model=StatusPageResponse)
async def verify_hostname(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).check_hostname(current_user, get_active_org_id(request))


@router.post("/components", response_model=StatusPageResponse, status_code=201)
async def add_component(
    request: Request,
    body: StatusComponentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).add_component(current_user, get_active_org_id(request), body)


@router.delete("/components/{component_id}", status_code=204)
async def delete_component(
    request: Request,
    component_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await StatusPageService(db).delete_component(current_user, get_active_org_id(request), component_id)


@router.post("/incidents", response_model=StatusPageResponse, status_code=201)
async def create_incident(
    request: Request,
    body: StatusIncidentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).create_incident(current_user, get_active_org_id(request), body)


@router.post("/incidents/{incident_id}/updates", response_model=StatusPageResponse, status_code=201)
async def add_update(
    request: Request,
    incident_id: UUID,
    body: StatusIncidentUpdateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatusPageResponse:
    return await StatusPageService(db).add_incident_update(current_user, get_active_org_id(request), incident_id, body)
