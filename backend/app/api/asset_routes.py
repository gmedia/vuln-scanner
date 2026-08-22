from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.asset import (
    AssetCreate,
    AssetPackResponse,
    AssetResponse,
    AssetScheduleCreate,
    AssetUpdate,
)
from app.schemas.schedule import ScheduleResponse
from app.services.asset import AssetService
from app.services.auth import get_active_org_id, get_current_user

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetResponse])
async def list_assets(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AssetResponse]:
    return await AssetService(db).list_assets(current_user, get_active_org_id(request))


@router.post("", response_model=AssetResponse, status_code=201)
async def create_asset(
    request: Request,
    body: AssetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetResponse:
    return await AssetService(db).create(current_user, get_active_org_id(request), body)


@router.get("/pack", response_model=AssetPackResponse)
async def asset_pack(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetPackResponse:
    return await AssetService(db).pack(current_user, get_active_org_id(request))


@router.get("/{asset_id}", response_model=AssetResponse)
async def get_asset(
    request: Request,
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetResponse:
    return await AssetService(db).get(current_user, get_active_org_id(request), asset_id)


@router.patch("/{asset_id}", response_model=AssetResponse)
async def update_asset(
    request: Request,
    asset_id: UUID,
    body: AssetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssetResponse:
    return await AssetService(db).update(current_user, get_active_org_id(request), asset_id, body)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    request: Request,
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await AssetService(db).delete(current_user, get_active_org_id(request), asset_id)


@router.post("/{asset_id}/schedules", response_model=ScheduleResponse, status_code=201)
async def create_asset_schedule(
    request: Request,
    asset_id: UUID,
    body: AssetScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScheduleResponse:
    return await AssetService(db).create_schedule(current_user, get_active_org_id(request), asset_id, body)
