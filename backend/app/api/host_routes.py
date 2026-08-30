from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.host_protect import HostHitResponse, HostScanResponse, HostSiteCreate, HostSiteResponse, HostSiteUpdate
from app.services.auth import get_active_org_id, get_current_user
from app.services.host_protect import HostProtectService

router = APIRouter(prefix="/host", tags=["host-protect"])


@router.get("/sites", response_model=list[HostSiteResponse])
async def list_sites(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostSiteResponse]:
    return await HostProtectService(db).list_sites(current_user, get_active_org_id(request))


@router.post("/sites", response_model=HostSiteResponse, status_code=201)
async def create_site(
    request: Request,
    body: HostSiteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).create_site(current_user, get_active_org_id(request), body)


@router.get("/sites/{site_id}", response_model=HostSiteResponse)
async def get_site(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).get_site(current_user, get_active_org_id(request), site_id)


@router.patch("/sites/{site_id}", response_model=HostSiteResponse)
async def update_site(
    request: Request,
    site_id: UUID,
    body: HostSiteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).update_site(current_user, get_active_org_id(request), site_id, body)


@router.delete("/sites/{site_id}", status_code=204)
async def delete_site(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await HostProtectService(db).delete_site(current_user, get_active_org_id(request), site_id)


@router.post("/sites/{site_id}/scan", response_model=HostScanResponse, status_code=201)
async def enqueue_scan(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostScanResponse:
    return await HostProtectService(db).enqueue_scan(current_user, get_active_org_id(request), site_id)


@router.get("/sites/{site_id}/scans", response_model=list[HostScanResponse])
async def list_scans(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostScanResponse]:
    return await HostProtectService(db).list_scans(current_user, get_active_org_id(request), site_id)


@router.get("/hits", response_model=list[HostHitResponse])
async def list_hits(
    request: Request,
    site_id: UUID | None = None,
    hit_status: str | None = Query(default=None, alias="status"),
    hit_class: str | None = Query(default=None, alias="class"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostHitResponse]:
    return await HostProtectService(db).list_hits(
        current_user,
        get_active_org_id(request),
        site_id=site_id,
        hit_status=hit_status,
        hit_class=hit_class,
    )
