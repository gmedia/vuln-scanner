from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.services.status_page import StatusPageService, render_status_html

html_router = APIRouter(tags=["status-html"])

public_limiter = RateLimiter(max_requests=120, window_seconds=60, prefix="ratelimit:status-html")

PLATFORM_HOSTS = frozenset({"sinexis.app", "www.sinexis.app", "vs.appmedia.id", "localhost", "127.0.0.1", "testserver"})


@html_router.get("/status/{slug}", response_class=HTMLResponse)
async def status_by_slug(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    limited = await public_limiter(request)
    if limited is not None:
        return HTMLResponse("Too many requests", status_code=429)
    if not settings.status_page_enabled:
        return HTMLResponse("Not found", status_code=404)
    page = await StatusPageService(db).public_by_slug(slug)
    return HTMLResponse(render_status_html(page), headers={"Cache-Control": "public, max-age=30"})


@html_router.get("/status", response_class=HTMLResponse)
async def status_by_host(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    limited = await public_limiter(request)
    if limited is not None:
        return HTMLResponse("Too many requests", status_code=429)
    if not settings.status_page_enabled:
        return HTMLResponse("Not found", status_code=404)
    host = (request.headers.get("host") or "").split(":")[0].lower()
    if host in PLATFORM_HOSTS:
        return HTMLResponse("Not found", status_code=404)
    page = await StatusPageService(db).public_by_host(host)
    return HTMLResponse(render_status_html(page), headers={"Cache-Control": "public, max-age=30"})
