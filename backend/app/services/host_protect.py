from __future__ import annotations

import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.asset import ScanAsset
from app.models.guard import GuardAgent
from app.models.host_protect import HOST_SITE_SKU_LIMITS, HostHit, HostScan, HostSite
from app.models.organization import Organization
from app.models.user import User
from app.schemas.host_protect import HostHitResponse, HostScanResponse, HostSiteCreate, HostSiteResponse, HostSiteUpdate
from app.services.organization import get_membership, require_membership, role_at_least


def sku_site_limit(sku: str | None) -> int:
    return HOST_SITE_SKU_LIMITS.get(sku or "multi", HOST_SITE_SKU_LIMITS["multi"])


class HostProtectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _require_feature(self) -> None:
        if not settings.host_protect_enabled:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    async def _org(self, organization_id: UUID) -> Organization:
        result = await self.db.execute(select(Organization).where(Organization.id == organization_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    async def _require_org(self, user: User, organization_id: UUID | None, *, min_role: str) -> UUID:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role=min_role)
        return organization_id

    def _to_site(self, site: HostSite, *, sku: str | None) -> HostSiteResponse:
        return HostSiteResponse(
            id=site.id,
            organization_id=site.organization_id,
            guard_agent_id=site.guard_agent_id,
            asset_id=site.asset_id,
            name=site.name,
            root_path=site.root_path,
            cms_hint=site.cms_hint,
            enabled=site.enabled,
            auto_quarantine=site.auto_quarantine,
            created_by=site.created_by,
            created_at=site.created_at,
            updated_at=site.updated_at,
            sku=sku,
            sku_limit=sku_site_limit(sku),
        )

    async def list_sites(self, user: User, organization_id: UUID | None) -> list[HostSiteResponse]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        org = await self._org(org_id)
        result = await self.db.execute(
            select(HostSite).where(HostSite.organization_id == org_id).order_by(HostSite.created_at.desc())
        )
        return [self._to_site(s, sku=org.sku) for s in result.scalars().all()]

    async def create_site(self, user: User, organization_id: UUID | None, body: HostSiteCreate) -> HostSiteResponse:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        org = await self._org(org_id)
        limit = sku_site_limit(org.sku)
        count_result = await self.db.execute(
            select(func.count()).select_from(HostSite).where(HostSite.organization_id == org_id)
        )
        if int(count_result.scalar() or 0) >= limit:
            raise HTTPException(status_code=400, detail=f"Host Protect site limit for {org.sku} tier is {limit}")

        agent = (
            await self.db.execute(
                select(GuardAgent).where(GuardAgent.id == body.guard_agent_id, GuardAgent.organization_id == org_id)
            )
        ).scalar_one_or_none()
        if agent is None:
            raise HTTPException(status_code=400, detail="Guard agent not found in this organization")

        if body.asset_id is not None:
            asset = (
                await self.db.execute(
                    select(ScanAsset).where(ScanAsset.id == body.asset_id, ScanAsset.organization_id == org_id)
                )
            ).scalar_one_or_none()
            if asset is None:
                raise HTTPException(status_code=400, detail="Asset not found in this organization")

        dup = await self.db.execute(
            select(HostSite.id).where(
                HostSite.organization_id == org_id,
                HostSite.guard_agent_id == body.guard_agent_id,
                HostSite.root_path == body.root_path,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Site already exists for this path")

        site = HostSite(
            id=uuid.uuid4(),
            organization_id=org_id,
            guard_agent_id=body.guard_agent_id,
            asset_id=body.asset_id,
            name=body.name,
            root_path=body.root_path,
            cms_hint=body.cms_hint,
            enabled=body.enabled,
            auto_quarantine=body.auto_quarantine,
            created_by=user.id,
        )
        self.db.add(site)
        await self.db.commit()
        await self.db.refresh(site)
        return self._to_site(site, sku=org.sku)

    async def _get_site(self, site_id: UUID, organization_id: UUID | None, user_id: UUID) -> HostSite:
        result = await self.db.execute(select(HostSite).where(HostSite.id == site_id))
        site = result.scalar_one_or_none()
        if site is None:
            raise HTTPException(status_code=404, detail="Site not found")
        membership = await get_membership(self.db, site.organization_id, user_id)
        if membership is None or not role_at_least(membership.role, "viewer"):
            raise HTTPException(status_code=404, detail="Site not found")
        if organization_id is not None and site.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Site not found")
        return site

    async def get_site(self, user: User, organization_id: UUID | None, site_id: UUID) -> HostSiteResponse:
        self._require_feature()
        site = await self._get_site(site_id, organization_id, user.id)
        org = await self._org(site.organization_id)
        return self._to_site(site, sku=org.sku)

    async def update_site(
        self, user: User, organization_id: UUID | None, site_id: UUID, body: HostSiteUpdate
    ) -> HostSiteResponse:
        self._require_feature()
        site = await self._get_site(site_id, organization_id, user.id)
        membership = await get_membership(self.db, site.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(site, key, value)
        site.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(site)
        org = await self._org(site.organization_id)
        return self._to_site(site, sku=org.sku)

    async def delete_site(self, user: User, organization_id: UUID | None, site_id: UUID) -> None:
        self._require_feature()
        site = await self._get_site(site_id, organization_id, user.id)
        membership = await get_membership(self.db, site.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "admin"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        await self.db.delete(site)
        await self.db.commit()

    async def enqueue_scan(self, user: User, organization_id: UUID | None, site_id: UUID) -> HostScanResponse:
        self._require_feature()
        site = await self._get_site(site_id, organization_id, user.id)
        membership = await get_membership(self.db, site.organization_id, user.id)
        assert membership is not None
        if not role_at_least(membership.role, "member"):
            raise HTTPException(status_code=403, detail="Insufficient organization role")
        scan = HostScan(
            id=uuid.uuid4(),
            organization_id=site.organization_id,
            site_id=site.id,
            status="queued",
            trigger="manual",
        )
        self.db.add(scan)
        await self.db.commit()
        await self.db.refresh(scan)
        return HostScanResponse.model_validate(scan)

    async def list_scans(self, user: User, organization_id: UUID | None, site_id: UUID) -> list[HostScanResponse]:
        self._require_feature()
        site = await self._get_site(site_id, organization_id, user.id)
        result = await self.db.execute(
            select(HostScan).where(HostScan.site_id == site.id).order_by(HostScan.created_at.desc())
        )
        return [HostScanResponse.model_validate(s) for s in result.scalars().all()]

    async def list_hits(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        site_id: UUID | None = None,
        hit_status: str | None = None,
        hit_class: str | None = None,
    ) -> list[HostHitResponse]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        stmt = select(HostHit).where(HostHit.organization_id == org_id)
        if site_id is not None:
            stmt = stmt.where(HostHit.site_id == site_id)
        if hit_status is not None:
            stmt = stmt.where(HostHit.status == hit_status)
        if hit_class is not None:
            stmt = stmt.where(HostHit.hit_class == hit_class)
        result = await self.db.execute(stmt.order_by(HostHit.last_seen_at.desc()))
        hits = list(result.scalars().all())
        return [
            HostHitResponse(
                id=h.id,
                organization_id=h.organization_id,
                site_id=h.site_id,
                scan_id=h.scan_id,
                rel_path=h.rel_path,
                hit_class=h.hit_class,
                engine=h.engine,
                rule_id=h.rule_id,
                status=h.status,
                sha256=h.sha256,
                first_seen_at=h.first_seen_at,
                last_seen_at=h.last_seen_at,
            )
            for h in hits
        ]
