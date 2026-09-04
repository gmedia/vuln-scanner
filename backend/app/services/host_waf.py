from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.host_protect import HostSite
from app.models.host_waf import HostWafEvent, HostWafPolicy
from app.models.organization import Organization
from app.models.user import User
from app.schemas.host_waf import (
    HostWafEventResponse,
    HostWafPolicyResponse,
    HostWafPolicyUpsert,
    HostWafSnippetResponse,
)
from app.services.host_handoff import handoff_waf_block
from app.services.host_waf_render import render_coraza_include, render_nginx_modsec
from app.services.organization import require_membership


def _strip_query(path: str) -> str:
    cut = path.split("?", 1)[0]
    return cut[:256] or "/"


class HostWafService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _require_feature(self) -> None:
        if not settings.host_waf_enabled:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    async def _require_org(self, user: User, organization_id: UUID | None, *, min_role: str) -> UUID:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role=min_role)
        return organization_id

    async def _site(self, org_id: UUID, site_id: UUID) -> HostSite:
        site = (
            await self.db.execute(select(HostSite).where(HostSite.id == site_id, HostSite.organization_id == org_id))
        ).scalar_one_or_none()
        if site is None:
            raise HTTPException(status_code=404, detail="Site not found")
        return site

    def _to_policy(self, policy: HostWafPolicy, site_name: str | None) -> HostWafPolicyResponse:
        return HostWafPolicyResponse(
            id=policy.id,
            organization_id=policy.organization_id,
            site_id=policy.site_id,
            mode=policy.mode,
            engine=policy.engine,
            paranoia=policy.paranoia,
            updated_by=policy.updated_by,
            created_at=policy.created_at,
            updated_at=policy.updated_at,
            site_name=site_name,
        )

    async def list_policies(self, user: User, organization_id: UUID | None) -> list[HostWafPolicyResponse]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        result = await self.db.execute(
            select(HostWafPolicy, HostSite.name)
            .join(HostSite, HostSite.id == HostWafPolicy.site_id)
            .where(HostWafPolicy.organization_id == org_id)
            .order_by(HostWafPolicy.updated_at.desc())
        )
        return [self._to_policy(p, name) for p, name in result.all()]

    async def upsert_policy(
        self, user: User, organization_id: UUID | None, site_id: UUID, body: HostWafPolicyUpsert
    ) -> HostWafPolicyResponse:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        if body.mode == "protect":
            org = (await self.db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            if org.sku != "multi":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="WAF protect requires Host Multi SKU",
                )
        site = await self._site(org_id, site_id)
        existing = (
            await self.db.execute(select(HostWafPolicy).where(HostWafPolicy.site_id == site.id))
        ).scalar_one_or_none()
        now = datetime.now(UTC)
        if existing is None:
            existing = HostWafPolicy(
                organization_id=org_id,
                site_id=site.id,
                mode=body.mode,
                engine=body.engine,
                paranoia=body.paranoia,
                updated_by=user.id,
                created_at=now,
                updated_at=now,
            )
            self.db.add(existing)
        else:
            existing.mode = body.mode
            existing.engine = body.engine
            existing.paranoia = body.paranoia
            existing.updated_by = user.id
            existing.updated_at = now
        await self.db.commit()
        await self.db.refresh(existing)
        return self._to_policy(existing, site.name)

    async def list_events(
        self, user: User, organization_id: UUID | None, site_id: UUID | None
    ) -> list[HostWafEventResponse]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        stmt = select(HostWafEvent).where(HostWafEvent.organization_id == org_id)
        if site_id is not None:
            stmt = stmt.where(HostWafEvent.site_id == site_id)
        stmt = stmt.order_by(HostWafEvent.created_at.desc()).limit(100)
        rows = (await self.db.execute(stmt)).scalars().all()
        return [HostWafEventResponse.model_validate(r) for r in rows]

    async def simulate(self, user: User, organization_id: UUID | None, site_id: UUID) -> HostWafEventResponse:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="member")
        site = await self._site(org_id, site_id)
        policy = (
            await self.db.execute(select(HostWafPolicy).where(HostWafPolicy.site_id == site.id))
        ).scalar_one_or_none()
        if policy is None or policy.mode == "off":
            raise HTTPException(status_code=400, detail="WAF policy is off")
        action = "block" if policy.mode == "protect" else "log"
        event = HostWafEvent(
            organization_id=org_id,
            site_id=site.id,
            policy_id=policy.id,
            action=action,
            rule_id="mock.sqli.1",
            method="GET",
            path=_strip_query("/sinexis-waf-lab?q=1%27+OR+1%3D1"),
            http_status=403 if action == "block" else 200,
        )
        self.db.add(event)
        await self.db.flush()
        await handoff_waf_block(self.db, event, site, user)
        await self.db.commit()
        await self.db.refresh(event)
        return HostWafEventResponse.model_validate(event)

    async def snippet(self, user: User, organization_id: UUID | None, site_id: UUID) -> HostWafSnippetResponse:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        site = await self._site(org_id, site_id)
        policy = (
            await self.db.execute(select(HostWafPolicy).where(HostWafPolicy.site_id == site.id))
        ).scalar_one_or_none()
        if policy is None:
            raise HTTPException(status_code=400, detail="WAF policy is missing")
        if policy.engine == "coraza":
            content = render_coraza_include(policy, site)
            filename = "sinexis-host-waf-coraza.conf"
        else:
            content = render_nginx_modsec(policy, site)
            filename = "sinexis-host-waf-modsec.conf"
        if "sinexis.app" in content.lower() and "do not paste onto sinexis.app" not in content.lower():
            raise HTTPException(status_code=500, detail="refusing edge-bound snippet")
        return HostWafSnippetResponse(
            site_id=site.id,
            engine=policy.engine,
            mode=policy.mode,
            filename=filename,
            content=content,
        )
