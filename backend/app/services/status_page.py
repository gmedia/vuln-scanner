from __future__ import annotations

import html
import logging
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
    StatusHostnameBody,
    StatusIncidentCreate,
    StatusIncidentResponse,
    StatusIncidentUpdateCreate,
    StatusIncidentUpdateResponse,
    StatusPageCreate,
    StatusPageResponse,
    StatusPageUpdate,
)
from app.services.cloudflare_custom_hostnames import (
    CfHostname,
    CloudflareCustomHostnames,
    CloudflareHostnameError,
    cf_configured,
    map_hostname_status,
)
from app.services.organization import require_membership

logger = logging.getLogger(__name__)


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

    async def _assert_slug_free(self, slug: str, page_id: UUID | None = None) -> None:
        stmt = select(StatusPage).where(StatusPage.slug == slug)
        if page_id is not None:
            stmt = stmt.where(StatusPage.id != page_id)
        clash = await self.db.execute(stmt)
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="slug already in use")

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
            txt_name=page.txt_name,
            txt_value=page.txt_value,
            ssl_status=page.ssl_status,
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
            if body.slug != existing.slug:
                await self._assert_slug_free(body.slug, existing.id)
            existing.title = body.title
            existing.slug = body.slug
            await self.db.commit()
            page = await self._page_for_org(organization_id)
            assert page is not None
            return self._to_response(page)
        await self._assert_slug_free(body.slug)
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
        if body.slug is not None and body.slug != page.slug:
            await self._assert_slug_free(body.slug, page.id)
            page.slug = body.slug
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
                page.hostname_status = "pending_txt"
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def _set_hostname(self, org: Organization, page: StatusPage, hostname: str) -> None:
        if (org.sku or "basic") not in STATUS_PAGE_CUSTOM_HOST_SKUS:
            raise HTTPException(status_code=403, detail="Custom domain requires Multi SKU")
        assert_custom_hostname(hostname)
        other = await self.db.execute(
            select(StatusPage).where(StatusPage.custom_hostname == hostname, StatusPage.id != page.id)
        )
        if other.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="hostname already in use")
        page.custom_hostname = hostname
        page.hostname_status = "pending_txt"

    def _apply_cf(self, page: StatusPage, cf: CfHostname) -> None:
        page.cf_hostname_id = cf.id
        page.txt_name = cf.txt_name
        page.txt_value = cf.txt_value
        page.ssl_status = cf.ssl_status
        page.hostname_status = map_hostname_status(cf.ssl_status, cf.status)

    def _clear_cf(self, page: StatusPage) -> None:
        page.cf_hostname_id = None
        page.txt_name = None
        page.txt_value = None
        page.ssl_status = None

    async def _cf_ensure(self, hostname: str) -> CfHostname | None:
        if settings.status_page_cf_stub_active or not cf_configured():
            return None
        client = CloudflareCustomHostnames()
        try:
            return await client.ensure(hostname)
        finally:
            await client.aclose()

    async def _cf_get(self, cf_id: str, hostname: str) -> CfHostname | None:
        if settings.status_page_cf_stub_active or not cf_configured():
            return None
        client = CloudflareCustomHostnames()
        try:
            if cf_id:
                return await client.get(cf_id)
            return await client.find_by_hostname(hostname)
        finally:
            await client.aclose()

    async def _cf_delete(self, cf_id: str | None) -> None:
        if not cf_id or settings.status_page_cf_stub_active or not cf_configured():
            return
        client = CloudflareCustomHostnames()
        try:
            await client.delete(cf_id)
        except CloudflareHostnameError:
            logger.warning("cloudflare custom hostname delete failed")
        finally:
            await client.aclose()

    async def attach_hostname(
        self, user: User, organization_id: UUID | None, body: StatusHostnameBody
    ) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        if page.custom_hostname:
            raise HTTPException(status_code=409, detail="hostname already attached; use update")
        published = page.published
        await self._set_hostname(org, page, body.hostname)
        page.published = published
        try:
            cf = await self._cf_ensure(body.hostname)
        except CloudflareHostnameError as exc:
            raise HTTPException(status_code=502, detail="Cloudflare hostname create failed") from exc
        if cf is not None:
            self._apply_cf(page, cf)
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def replace_hostname(
        self, user: User, organization_id: UUID | None, body: StatusHostnameBody
    ) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        org = await self._org(organization_id)
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        if not page.custom_hostname:
            raise HTTPException(status_code=400, detail="No custom hostname set")
        old_cf_id = page.cf_hostname_id
        await self._set_hostname(org, page, body.hostname)
        await self._cf_delete(old_cf_id)
        self._clear_cf(page)
        try:
            cf = await self._cf_ensure(body.hostname)
        except CloudflareHostnameError as exc:
            raise HTTPException(status_code=502, detail="Cloudflare hostname create failed") from exc
        if cf is not None:
            self._apply_cf(page, cf)
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def detach_hostname(self, user: User, organization_id: UUID | None) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None:
            raise HTTPException(status_code=404, detail="Status page not found")
        await self._cf_delete(page.cf_hostname_id)
        page.custom_hostname = None
        page.hostname_status = "none"
        self._clear_cf(page)
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def check_hostname(self, user: User, organization_id: UUID | None) -> StatusPageResponse:
        self._enabled()
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role="member")
        page = await self._page_for_org(organization_id)
        if page is None or not page.custom_hostname:
            raise HTTPException(status_code=400, detail="No custom hostname set")
        if settings.status_page_cf_stub_active:
            page.hostname_status = "active"
            page.ssl_status = "active"
        elif cf_configured():
            try:
                cf = await self._cf_get(page.cf_hostname_id or "", page.custom_hostname)
            except CloudflareHostnameError as exc:
                page.hostname_status = "failed"
                await self.db.commit()
                raise HTTPException(status_code=502, detail="Cloudflare hostname check failed") from exc
            if cf is None:
                page.hostname_status = "pending_txt"
            else:
                self._apply_cf(page, cf)
        else:
            page.hostname_status = "pending_txt"
        await self.db.commit()
        loaded = await self._page_for_org(organization_id)
        assert loaded is not None
        return self._to_response(loaded)

    async def verify_hostname(self, user: User, organization_id: UUID | None) -> StatusPageResponse:
        return await self.check_hostname(user, organization_id)

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


_CROSSHAIR_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
    '<circle cx="12" cy="12" r="10"/>'
    '<line x1="22" x2="18" y1="12" y2="12"/>'
    '<line x1="6" x2="2" y1="12" y2="12"/>'
    '<line x1="12" x2="12" y1="6" y2="2"/>'
    '<line x1="12" x2="12" y1="22" y2="18"/>'
    "</svg>"
)

_STATUS_CSS = """
:root{
  --background:hsl(0 0% 98%);--foreground:hsl(0 0% 7%);--muted:hsl(0 0% 96%);
  --muted-foreground:hsl(0 0% 45%);--border:hsl(0 0% 90%);
  --primary:hsl(142 71% 45%);--primary-foreground:hsl(0 0% 4%);
  --ok:hsl(142 71% 38%);--warn:hsl(38 92% 42%);--bad:hsl(0 72% 51%);
  --rail:72rem;
}
.dark{
  color-scheme:dark;
  --background:hsl(0 0% 4%);--foreground:hsl(0 0% 96%);--muted:hsl(0 0% 12%);
  --muted-foreground:hsl(0 0% 45%);--border:hsl(0 0% 16%);
  --primary:hsl(142 71% 45%);--primary-foreground:hsl(0 0% 4%);
  --ok:hsl(142 71% 45%);--warn:hsl(38 92% 55%);--bad:hsl(0 72% 58%);
}
*{box-sizing:border-box}
html{color-scheme:light dark;background:var(--background)}
body{
  margin:0;min-height:100dvh;display:flex;flex-direction:column;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  color:var(--foreground);background:var(--background);line-height:1.55;letter-spacing:-0.011em;
}
a{color:var(--primary);text-underline-offset:0.15em}
.site-header{border-bottom:1px solid var(--border)}
.site-header-inner,.site-footer-inner{
  width:min(var(--rail),100%);margin:0 auto;padding:0 1rem;
  display:flex;align-items:center;justify-content:space-between;gap:0.75rem;
}
.site-header-inner{height:3rem}
.brand{display:inline-flex;align-items:center;gap:0.6rem;text-decoration:none;color:var(--foreground)}
.brand svg{width:1.25rem;height:1.25rem;color:var(--primary);flex-shrink:0}
.brand-text{
  font-family:ui-monospace,"JetBrains Mono",Menlo,monospace;
  font-size:0.875rem;font-weight:700;letter-spacing:0.08em;
}
.brand-accent{color:var(--primary)}
.header-actions{display:flex;align-items:center;gap:0.5rem}
.header-actions a,.theme-switch button{
  display:inline-flex;align-items:center;min-height:2.75rem;padding:0 0.75rem;
  font-size:0.75rem;text-decoration:none;color:var(--foreground);
  border:1px solid var(--border);border-radius:0.375rem;background:transparent;cursor:pointer;font-family:inherit;
}
.header-actions a.ghost{border-color:transparent;color:var(--muted-foreground)}
.header-actions a.primary{background:var(--primary);color:var(--primary-foreground);border-color:transparent}
.theme-switch{display:inline-flex;border:1px solid var(--border);border-radius:0.375rem;overflow:hidden}
.theme-switch button{border:0;border-radius:0;font-size:0.6875rem;padding:0 0.6rem}
.theme-switch button[aria-pressed="true"]{background:var(--muted)}
main.rail{flex:1;width:min(var(--rail),calc(100% - 2rem));margin:0 auto;padding:2.5rem 0 4rem}
.eyebrow{
  font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--primary);margin:0 0 0.5rem;
}
h1{font-size:clamp(1.75rem,3vw,2.25rem);line-height:1.15;font-weight:700;letter-spacing:-0.03em;margin:0 0 1.25rem}
.banner{
  display:flex;align-items:center;gap:0.85rem;padding:1.1rem 1.25rem;border-radius:0.5rem;
  border:1px solid var(--border);margin:0 0 1.75rem;background:var(--muted);
}
.banner .dot{width:0.65rem;height:0.65rem;border-radius:999px;flex-shrink:0;background:var(--ok)}
.banner.operational .dot{background:var(--ok);box-shadow:0 0 0 4px hsl(142 71% 45% / 0.18)}
.banner.degraded .dot,.banner.partial .dot{background:var(--warn);box-shadow:0 0 0 4px hsl(38 92% 50% / 0.18)}
.banner.major .dot{background:var(--bad);box-shadow:0 0 0 4px hsl(0 72% 51% / 0.18)}
.banner strong{font-size:1.05rem;letter-spacing:-0.02em}
.banner span{display:block;font-size:0.8125rem;color:var(--muted-foreground);margin-top:0.15rem}
.panel{border:1px solid var(--border);border-radius:0.5rem;overflow:hidden;margin:0 0 1.75rem}
.panel h2{margin:0;padding:0.85rem 1.15rem;font-size:0.75rem;font-weight:600;letter-spacing:0.06em;
  text-transform:uppercase;color:var(--muted-foreground);border-bottom:1px solid var(--border)}
.comps{list-style:none;margin:0;padding:0}
.comps li{display:flex;align-items:center;justify-content:space-between;gap:1rem;
  padding:0.9rem 1.15rem;border-bottom:1px solid var(--border)}
.comps li:last-child{border-bottom:0}
.pill{
  font-size:0.75rem;font-weight:600;letter-spacing:0.02em;
  padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--border);
}
.pill.up{color:var(--ok);border-color:hsl(142 71% 45% / 0.35)}
.pill.down{color:var(--bad);border-color:hsl(0 72% 51% / 0.4)}
.pill.degraded{color:var(--warn);border-color:hsl(38 92% 50% / 0.4)}
.pill.unknown{color:var(--muted-foreground)}
.inc{padding:1.1rem 1.15rem;border-bottom:1px solid var(--border)}
.inc:last-child{border-bottom:0}
.inc h3{margin:0 0 0.35rem;font-size:1rem;letter-spacing:-0.02em}
.inc .meta{font-size:0.75rem;color:var(--muted-foreground);margin:0 0 0.65rem}
.inc p{margin:0 0 0.5rem;font-size:0.9375rem;color:var(--muted-foreground)}
.inc p:last-child{margin-bottom:0}
.empty{padding:1.15rem;color:var(--muted-foreground);font-size:0.875rem}
.site-footer{margin-top:auto;border-top:1px solid var(--border);padding:1.5rem 0}
.site-footer p{margin:0;font-size:0.75rem;color:var(--muted-foreground)}
.site-footer a{font-size:0.75rem;color:var(--muted-foreground);text-decoration:none;min-height:2.75rem;
  display:inline-flex;align-items:center;padding:0 0.35rem}
.site-footer a:hover{color:var(--foreground)}
.site-footer a.primary{
  background:var(--primary);color:var(--primary-foreground);
  border-radius:0.375rem;padding:0 0.75rem;font-weight:600;
}
.disclaimer{font-size:0.75rem;color:var(--muted-foreground);margin:0}
@media (max-width:640px){.header-actions a.sm-hide{display:none}}
"""

_THEME_BOOT = """
<script>
(function(){
  var k='sinexis.theme', t='dark';
  try { var s=localStorage.getItem(k); if(s==='light'||s==='dark') t=s; } catch(e){}
  document.documentElement.classList.toggle('dark', t==='dark');
  document.documentElement.style.colorScheme=t;
})();
</script>
"""

_THEME_FOOT = """
<script>
(function(){
  var k='sinexis.theme';
  function cur(){
    try { var s=localStorage.getItem(k); if(s==='light'||s==='dark') return s; } catch(e){}
    return 'dark';
  }
  function apply(t){
    document.documentElement.classList.toggle('dark', t==='dark');
    document.documentElement.style.colorScheme=t;
    try { localStorage.setItem(k, t); } catch(e){}
    document.querySelectorAll('[data-theme-set]').forEach(function(b){
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-set')===t ? 'true' : 'false');
    });
  }
  document.querySelectorAll('[data-theme-set]').forEach(function(b){
    b.addEventListener('click', function(){ apply(b.getAttribute('data-theme-set')); });
  });
  apply(cur());
})();
</script>
"""

_STATE_LABEL = {"up": "Operational", "down": "Down", "degraded": "Degraded", "unknown": "Unknown"}
_OVERALL_COPY = {
    "operational": ("All systems operational", "Outside-in checks are succeeding."),
    "degraded": ("Degraded performance", "Some checks are slower or flaky."),
    "partial": ("Partial outage", "At least one component is down."),
    "major": ("Major outage", "A critical incident or widespread outage is in progress."),
}


def render_status_html(page: StatusPageResponse) -> str:
    overall = page.overall or "operational"
    headline, sub = _OVERALL_COPY.get(overall, _OVERALL_COPY["operational"])
    comps_inner = (
        "".join(
            (
                "<li>"
                f"<span>{_escape(c.display_name)}</span>"
                f"<span class='pill {_escape(c.state or 'unknown')}'>"
                f"{_escape(_STATE_LABEL.get(c.state or 'unknown', c.state or 'unknown'))}</span>"
                "</li>"
            )
            for c in page.components
        )
        or "<p class='empty'>No components published.</p>"
    )
    comps_block = f"<ul class='comps'>{comps_inner}</ul>" if page.components else comps_inner
    open_incs = [i for i in page.incidents if i.status != "resolved"]
    past_incs = [i for i in page.incidents if i.status == "resolved"]

    def _inc_html(inc: StatusIncidentResponse) -> str:
        updates = "".join(f"<p>{_escape(u.body)}</p>" for u in inc.updates)
        started = inc.started_at.strftime("%d %b %Y %H:%M UTC") if inc.started_at else ""
        return (
            "<article class='inc'>"
            f"<h3>{_escape(inc.title)}</h3>"
            f"<p class='meta'>{_escape(inc.status)} · {_escape(inc.impact)}"
            f"{' · ' + _escape(started) if started else ''}</p>"
            f"{updates}"
            "</article>"
        )

    open_block = "".join(_inc_html(i) for i in open_incs) or "<p class='empty'>No active incidents.</p>"
    past_block = "".join(_inc_html(i) for i in past_incs[:8])
    past_section = f"<section class='panel'><h2>Past incidents</h2>{past_block}</section>" if past_block else ""
    title = _escape(page.title)
    return f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#0a0a0a"/>
<title>{title} · Status</title>
<meta name="robots" content="noindex"/>
<style>{_STATUS_CSS}</style>
{_THEME_BOOT}
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/" aria-label="Sinexis home">
      {_CROSSHAIR_SVG}
      <span class="brand-text">SINE<span class="brand-accent">XIS</span></span>
    </a>
    <nav class="header-actions">
      <a class="ghost" href="/blog">Blog</a>
      <a class="ghost sm-hide" href="/login">Sign in</a>
      <a class="primary" href="/register">Get started</a>
      <span class="theme-switch" role="group" aria-label="Theme">
        <button type="button" data-theme-set="dark" aria-pressed="true">Dark</button>
        <button type="button" data-theme-set="light" aria-pressed="false">Light</button>
      </span>
    </nav>
  </div>
</header>
<main class="rail">
  <p class="eyebrow">Status</p>
  <h1>{title}</h1>
  <div class="banner {_escape(overall)}">
    <span class="dot" aria-hidden="true"></span>
    <div>
      <strong>{_escape(headline)}</strong>
      <span>{_escape(sub)}</span>
    </div>
  </div>
  <section class="panel">
    <h2>Components</h2>
    {comps_block}
  </section>
  <section class="panel">
    <h2>Active incidents</h2>
    {open_block}
  </section>
  {past_section}
  <p class="disclaimer">Best-effort outside-in checks. Not an SLA. Monitor URLs and IPs are never shown.</p>
</main>
<footer class="site-footer">
  <div class="site-footer-inner">
    <p>Sinexis · Scan · Guard · SIEM</p>
    <nav>
      <a href="/blog">Blog</a>
      <a href="/terms">Syarat</a>
      <a href="/privacy">Privasi</a>
      <a href="/login">Sign in</a>
      <a class="primary" href="/register">Get started</a>
    </nav>
  </div>
</footer>
{_THEME_FOOT}
</body>
</html>"""
