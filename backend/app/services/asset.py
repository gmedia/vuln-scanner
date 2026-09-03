from __future__ import annotations

import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import ASSET_SKU_LIMITS, ScanAsset
from app.models.organization import Organization
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.schemas.asset import (
    AssetCreate,
    AssetPackItem,
    AssetPackResponse,
    AssetResponse,
    AssetScheduleCreate,
    AssetUpdate,
    TagColorsResponse,
    TagColorsUpdate,
)
from app.schemas.schedule import ScheduleCreate, ScheduleResponse
from app.services.organization import get_membership, require_membership, role_at_least
from app.services.schedule import ScheduleService


def sku_asset_limit(sku: str | None) -> int:
    return ASSET_SKU_LIMITS.get(sku or "multi", ASSET_SKU_LIMITS["multi"])


class AssetService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _org(self, organization_id: UUID) -> Organization:
        result = await self.db.execute(select(Organization).where(Organization.id == organization_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    async def _schedule_id(self, asset_id: UUID) -> UUID | None:
        result = await self.db.execute(select(ScanSchedule.id).where(ScanSchedule.asset_id == asset_id))
        return result.scalar_one_or_none()

    def _to_response(self, asset: ScanAsset, *, sku: str | None, schedule_id: UUID | None = None) -> AssetResponse:
        return AssetResponse(
            id=asset.id,
            organization_id=asset.organization_id,
            name=asset.name,
            scan_type=asset.scan_type,
            target=asset.target,
            notes=asset.notes,
            tags=list(asset.tags or []),
            created_by=asset.created_by,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
            schedule_id=schedule_id,
            sku=sku,
            sku_limit=sku_asset_limit(sku),
        )

    async def list_assets(
        self, user: User, organization_id: UUID | None, tag: str | None = None
    ) -> list[AssetResponse]:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        org = await self._org(organization_id)
        result = await self.db.execute(
            select(ScanAsset).where(ScanAsset.organization_id == organization_id).order_by(ScanAsset.created_at.desc())
        )
        assets = list(result.scalars().all())
        needle = tag.strip().lower() if tag else None
        out: list[AssetResponse] = []
        for a in assets:
            if needle and needle not in [t.lower() for t in (a.tags or [])]:
                continue
            sid = await self._schedule_id(a.id)
            out.append(self._to_response(a, sku=org.sku, schedule_id=sid))
        return out

    async def create(self, user: User, organization_id: UUID | None, body: AssetCreate) -> AssetResponse:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        limit = sku_asset_limit(org.sku)
        count_result = await self.db.execute(
            select(func.count()).select_from(ScanAsset).where(ScanAsset.organization_id == organization_id)
        )
        count = int(count_result.scalar() or 0)
        if count >= limit:
            raise HTTPException(
                status_code=400,
                detail=f"Asset limit for {org.sku} tier is {limit}",
            )
        existing = await self.db.execute(
            select(ScanAsset.id).where(
                ScanAsset.organization_id == organization_id,
                ScanAsset.scan_type == body.scan_type,
                ScanAsset.target == body.target,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Asset already exists for this target")
        asset = ScanAsset(
            id=uuid.uuid4(),
            organization_id=organization_id,
            name=body.name,
            scan_type=body.scan_type,
            target=body.target,
            notes=body.notes,
            tags=list(body.tags),
            created_by=user.id,
        )
        self.db.add(asset)
        await self.db.commit()
        await self.db.refresh(asset)
        return self._to_response(asset, sku=org.sku, schedule_id=None)

    async def _get_in_org(self, asset_id: UUID, organization_id: UUID | None, user_id: UUID) -> ScanAsset:
        result = await self.db.execute(select(ScanAsset).where(ScanAsset.id == asset_id))
        asset = result.scalar_one_or_none()
        if asset is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        membership = await get_membership(self.db, asset.organization_id, user_id)
        if membership is None or not role_at_least(membership.role, "viewer"):
            raise HTTPException(status_code=404, detail="Asset not found")
        if organization_id is not None and asset.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Asset not found")
        return asset

    async def get(self, user: User, organization_id: UUID | None, asset_id: UUID) -> AssetResponse:
        asset = await self._get_in_org(asset_id, organization_id, user.id)
        org = await self._org(asset.organization_id)
        sid = await self._schedule_id(asset.id)
        return self._to_response(asset, sku=org.sku, schedule_id=sid)

    async def update(
        self, user: User, organization_id: UUID | None, asset_id: UUID, body: AssetUpdate
    ) -> AssetResponse:
        asset = await self._get_in_org(asset_id, organization_id, user.id)
        membership = await get_membership(self.db, asset.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin") and not (
            role_at_least(membership.role, "member") and asset.created_by == user.id
        ):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(asset, key, value)
        asset.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(asset)
        org = await self._org(asset.organization_id)
        sid = await self._schedule_id(asset.id)
        return self._to_response(asset, sku=org.sku, schedule_id=sid)

    async def delete(self, user: User, organization_id: UUID | None, asset_id: UUID) -> None:
        asset = await self._get_in_org(asset_id, organization_id, user.id)
        membership = await get_membership(self.db, asset.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        await self.db.delete(asset)
        await self.db.commit()

    async def pack(self, user: User, organization_id: UUID | None) -> AssetPackResponse:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        org = await self._org(organization_id)
        items = await self.list_assets(user, organization_id)
        return AssetPackResponse(
            organization_id=organization_id,
            sku=org.sku,
            sku_limit=sku_asset_limit(org.sku),
            count=len(items),
            assets=[
                AssetPackItem(
                    id=a.id,
                    name=a.name,
                    scan_type=a.scan_type,
                    target=a.target,
                    schedule_id=a.schedule_id,
                )
                for a in items
            ],
        )

    async def create_schedule(
        self,
        user: User,
        organization_id: UUID | None,
        asset_id: UUID,
        body: AssetScheduleCreate,
    ) -> ScheduleResponse:
        asset = await self._get_in_org(asset_id, organization_id, user.id)
        await require_membership(self.db, asset.organization_id, user.id, min_role="member")
        existing = await self.db.execute(select(ScanSchedule.id).where(ScanSchedule.asset_id == asset.id))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Asset already has a schedule")
        created = await ScheduleService(self.db).create(
            user,
            ScheduleCreate(
                name=body.name or asset.name,
                scan_type=asset.scan_type,
                target=asset.target,
                cadence=body.cadence,
                timezone=body.timezone,
                notify_email=body.notify_email,
                enabled=body.enabled,
            ),
            organization_id=asset.organization_id,
        )
        result = await self.db.execute(select(ScanSchedule).where(ScanSchedule.id == created.id))
        schedule = result.scalar_one()
        schedule.asset_id = asset.id
        await self.db.commit()
        await self.db.refresh(schedule)
        return ScheduleResponse.model_validate(schedule)

    async def get_tag_colors(self, user: User, organization_id: UUID | None) -> TagColorsResponse:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        org = await self._org(organization_id)
        return TagColorsResponse(colors=dict(org.tag_colors or {}))

    async def update_tag_colors(
        self, user: User, organization_id: UUID | None, body: TagColorsUpdate
    ) -> TagColorsResponse:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        merged = dict(org.tag_colors or {})
        merged.update(body.colors)
        org.tag_colors = merged
        org.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(org)
        return TagColorsResponse(colors=dict(org.tag_colors or {}))
