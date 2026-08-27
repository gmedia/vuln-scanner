from __future__ import annotations

import html
import socket
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.organization import Organization
from app.models.status_page import (
    PLATFORM_HOSTS,
    RESERVED_HOST_SUFFIXES,
    STATUS_PAGE_CUSTOM_HOST_SKUS,
    STATUS_PAGE_PUBLISH_SKUS,
    StatusIncident,
    StatusIncidentUpdate,
    StatusPage,
    StatusPageComponent,
)
from app.models.uptime import UptimeMonitor
from app.models.user import User
from app.schemas.status_page import (
    StatusComponentCreate,
    StatusComponentResponse,
    StatusIncidentCreate,
    StatusIncidentResponse,
    StatusIncidentUpdateCreate,
    StatusIncidentUpdateResponse,
    StatusPageCreate,
    StatusPageResponse,
    StatusPageUpdate,
)
from app.services.organization import require_membership


def _cname_target() -> str:
    return settings.status_page_cname_target.strip().lower().rstrip(".")


def _public_path(slug: str) -> str:
    return f"/status/{slug}"


def _escape(text: str) -> str:
    return html.escape(text, quote=True)


def assert_custom_hostname(host: str) -> None:
    if host in PLATFORM_HOSTS:
        raise HTTPException(status_code=400, detail="hostname is reserved")
    if any(host.endswith(suf) for suf in RESERVED_HOST_SUFFIXES):
        raise HTTPException(status_code=400, detail="hostname is reserved")


def verify_cname(hostname: str) -> bool:
    target = _cname_target()
    try:
        cname, aliases, _ = socket.gethostbyname_ex(hostname)
    except OSError:
        return False
    names = {hostname.lower().rstrip("."), cname.lower().rstrip(".")}
    names.update(a.lower().rstrip(".") for a in aliases)
    return target in names


def _overall(states: list[str], open_incidents: list[StatusIncident]) -> str:
    if any(i.impact == "critical" and i.status != "resolved" for i in open_incidents):
        return "major"
    if any(s == "down" for s in states):
        return "partial" if any(s == "up" for s in states) else "major"
    if any(s == "degraded" for s in states) or any(i.status != "resolved" for i in open_incidents):
        return "degraded"
    if not states:
        return "operational"
    return "operational"


class StatusPageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _enabled(self) -> None:
        if not settings.status_page_enabled:
            raise HTTPException(status_code=404, detail="Status page is disabled")

    async def _org(self, organization_id: UUID) -> Organization:
        result = await self.db.execute(select(Organization).where(Organization.id == organization_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    async def _page_for_org(self, organization_id: UUID) -> StatusPage | None:
        result = await self.db.execute(
            select(StatusPage)
            .options(
                selectinload(StatusPage.components).selectinload(StatusPageComponent.monitor),
                selectinload(StatusPage.incidents).selectinload(StatusIncident.updates),
            )
            .where(StatusPage.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    def _to_response(self, page: StatusPage) -> StatusPageResponse:
        comps: list[StatusComponentResponse] = []
        states: list[str] = []
        for c in sorted(page.components, key=lambda x: x.sort_order):
            state = c.monitor.state if c.monitor is not None else None
            if state:
                states.append(state)
            comps.append(
                StatusComponentResponse(
                    id=c.id,
                    monitor_id=c.monitor_id,
                    display_name=c.display_name,
                    sort_order=c.sort_order,
                    state=state,
                )
            )
        incidents = [
            StatusIncidentResponse(
                id=i.id,
                title=i.title,
                impact=i.impact,
                status=i.status,
                started_at=i.started_at,
                resolved_at=i.resolved_at,
                created_at=i.created_at,
                updates=[
                    StatusIncidentUpdateResponse(id=u.id, body=u.body, status=u.status, created_at=u.created_at)
                    for u in sorted(i.updates, key=lambda x: x.created_at)
                ],
            )
            for i in sorted(page.incidents, key=lambda x: x.created_at, reverse=True)
        ]
        return StatusPageResponse(
            id=page.id,
            organization_id=page.organization_id,
            slug=page.slug,
            title=page.title,
            published=page.published,
            custom_hostname=page.custom_hostname,
            hostname_status=page.hostname_status,
            cname_target=_cname_target(),
            public_path=_public_path(page.slug),
            created_at=page.created_at,
            updated_at=page.updated_at,
            components=comps,
            incidents=incidents,
            overall=_overall(states, [i for i in page.incidents if i.status != "resolved"]),
        )

    async def get_mine(self, user: User, organization_id: UUID | None) -> StatusPageResponse | None:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        page = await self._page_for_org(organization_id)
        if page is None:
            return None
        return self._to_response(page)

    async def upsert(self, user: User, organization_id: UUID | None, body: StatusPageCreate) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        if (org.sku or "basic") not in STATUS_PAGE_PUBLISH_SKUS:
            raise HTTPException(status_code=403, detail="Status page requires Pro or Multi SKU")
        existing = await self._page_for_org(organization_id)
        if existing is not None:
            existing.title = body.title
            existing.slug = body.slug
            await self.db.commit()
            page = await self._page_for_org(organization_id)
            assert page is not None
            return self._to_response(page)
        clash = await self.db.execute(select(StatusPage).where(StatusPage.slug == body.slug))
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="slug already in use")
        page = StatusPage(
            organization_id=organization_id,
            created_by=user.id,
            slug=body.slug,
            title=body.title,
            published=False,
            hostname_status="none",
        )
        self.db.add(page)
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def update(self, user: User, organization_id: UUID | None, body: StatusPageUpdate) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        if body.title is not None:
            page.title = body.title
        if body.published is not None:
            if body.published and (org.sku or "basic") not in STATUS_PAGE_PUBLISH_SKUS:
                raise HTTPException(status_code=403, detail="Status page requires Pro or Multi SKU")
            page.published = body.published
        if "custom_hostname" in body.model_fields_set:
            if not body.custom_hostname:
                page.custom_hostname = None
                page.hostname_status = "none"
            else:
                if (org.sku or "basic") not in STATUS_PAGE_CUSTOM_HOST_SKUS:
                    raise HTTPException(status_code=403, detail="Custom domain requires Multi SKU")
                assert_custom_hostname(body.custom_hostname)
                other = await self.db.execute(
                    select(StatusPage).where(
                        StatusPage.custom_hostname == body.custom_hostname, StatusPage.id != page.id
                    )
                )
                if other.scalar_one_or_none() is not None:
                    raise HTTPException(status_code=409, detail="hostname already in use")
                page.custom_hostname = body.custom_hostname
                page.hostname_status = "pending_dns"
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def verify_hostname(self, user: User, organization_id: UUID | None) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None or not page.custom_hostname:
            raise HTTPException(status_code=400, detail="No custom hostname set")
        ok = verify_cname(page.custom_hostname)
        page.hostname_status = "active" if ok else "failed"
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def add_component(
        self, user: User, organization_id: UUID | None, body: StatusComponentCreate
    ) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        mon = await self.db.execute(
            select(UptimeMonitor).where(
                UptimeMonitor.id == body.monitor_id, UptimeMonitor.organization_id == organization_id
            )
        )
        monitor = mon.scalar_one_or_none()
        if monitor is None:
            raise HTTPException(status_code=404, detail="Monitor not found")
        self.db.add(
            StatusPageComponent(
                page_id=page.id,
                monitor_id=monitor.id,
                display_name=body.display_name,
                sort_order=body.sort_order,
            )
        )
        try:
            await self.db.commit()
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(status_code=409, detail="component already exists") from exc
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def delete_component(self, user: User, organization_id: UUID | None, component_id: UUID) -> None:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        row = next((c for c in page.components if c.id == component_id), None)
        if row is None:
            raise HTTPException(status_code=404, detail="Component not found")
        await self.db.delete(row)
        await self.db.commit()

    async def create_incident(
        self, user: User, organization_id: UUID | None, body: StatusIncidentCreate
    ) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        now = datetime.now(UTC)
        incident = StatusIncident(
            page_id=page.id,
            created_by=user.id,
            title=body.title,
            impact=body.impact,
            status=body.status,
            started_at=now,
            resolved_at=now if body.status == "resolved" else None,
        )
        self.db.add(incident)
        await self.db.flush()
        self.db.add(
            StatusIncidentUpdate(
                incident_id=incident.id,
                created_by=user.id,
                body=body.body,
                status=body.status,
            )
        )
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def add_incident_update(
        self,
        user: User,
        organization_id: UUID | None,
        incident_id: UUID,
        body: StatusIncidentUpdateCreate,
    ) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        incident = next((i for i in page.incidents if i.id == incident_id), None)
        if incident is None:
            raise HTTPException(status_code=404, detail="Incident not found")
        incident.status = body.status
        if body.status == "resolved":
            incident.resolved_at = datetime.now(UTC)
        else:
            incident.resolved_at = None
        self.db.add(
            StatusIncidentUpdate(
                incident_id=incident.id,
                created_by=user.id,
                body=body.body,
                status=body.status,
            )
        )
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def public_by_slug(self, slug: str) -> StatusPageResponse:
        self._enabled()
        result = await self.db.execute(
            select(StatusPage)
            .options(
                selectinload(StatusPage.components).selectinload(StatusPageComponent.monitor),
                selectinload(StatusPage.incidents).selectinload(StatusIncident.updates),
            )
            .where(StatusPage.slug == slug, StatusPage.published.is_(True))
        )
        page = result.scalar_one_or_none()
        if page is None:
            raise HTTPException(status_code=404, detail="Not found")
        return self._to_response(page)

    async def public_by_host(self, host: str) -> StatusPageResponse:
        self._enabled()
        hostname = host.split(":")[0].lower().rstrip(".")
        result = await self.db.execute(
            select(StatusPage)
            .options(
                selectinload(StatusPage.components).selectinload(StatusPageComponent.monitor),
                selectinload(StatusPage.incidents).selectinload(StatusIncident.updates),
            )
            .where(
                StatusPage.custom_hostname == hostname,
                StatusPage.published.is_(True),
                StatusPage.hostname_status == "active",
            )
        )
        page = result.scalar_one_or_none()
        if page is None:
            raise HTTPException(status_code=404, detail="Not found")
        return self._to_response(page)


def render_status_html(page: StatusPageResponse) -> str:
    banner = {
        "operational": "All systems operational",
        "degraded": "Degraded performance",
        "partial": "Partial outage",
        "major": "Major outage",
    }.get(page.overall or "operational", "All systems operational")
    comps = "".join(
        f"<li><span>{_escape(c.display_name)}</span><strong>{_escape(c.state or 'unknown')}</strong></li>"
        for c in page.components
    )
    incs = "".join(
        f"<article><h2>{_escape(i.title)}</h2><p>{_escape(i.status)} · {_escape(i.impact)}</p>"
        + "".join(f"<p>{_escape(u.body)}</p>" for u in i.updates)
        + "</article>"
        for i in page.incidents
    )
    title = _escape(page.title)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="robots" content="noindex">
<style>
:root{{--background:hsl(0 0% 4%);--foreground:hsl(0 0% 96%);--muted-foreground:hsl(0 0% 45%);
--border:hsl(0 0% 16%);--primary:hsl(142 71% 45%);}}
body{{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:var(--background);color:var(--foreground);
max-width:42rem;margin-inline:auto;padding:2rem 1rem;}}
h1{{font-size:1.5rem}} .banner{{border:1px solid var(--border);padding:1rem;border-radius:.5rem;margin:1rem 0}}
ul{{list-style:none;padding:0}} li{{display:flex;justify-content:space-between;border-bottom:1px solid var(--border);
padding:.75rem 0}} .foot{{color:var(--muted-foreground);font-size:.75rem;margin-top:2rem}}
</style></head><body>
<p class="eyebrow" style="color:var(--primary);letter-spacing:.08em;text-transform:uppercase;font-size:.7rem">Status</p>
<h1>{title}</h1>
<div class="banner">{_escape(banner)}</div>
<ul>{comps}</ul>
{incs}
<p class="foot">Best-effort outside-in checks. Not an SLA.</p>
</body></html>"""
