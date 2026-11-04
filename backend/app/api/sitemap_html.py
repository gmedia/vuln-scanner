from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.blog_html import CANONICAL_HOST
from app.config import settings
from app.database import get_db
from app.models.blog import BlogPost
from app.services.blog import escape_text

html_router = APIRouter(tags=["sitemap-html"])

STATIC_PATHS = ("/", "/terms", "/privacy")


def _url(path: str) -> str:
    return f"  <url><loc>{CANONICAL_HOST}{escape_text(path)}</loc></url>"


@html_router.get("/sitemap.xml")
async def sitemap(db: AsyncSession = Depends(get_db)) -> Response:
    """Sitewide sitemap: static public pages plus published blog posts.

    Blog URLs are omitted when the blog is disabled. Product URLs arrive in S1,
    once those pages actually exist.
    """
    urls = [_url("/")]
    if settings.blog_enabled:
        urls.append(_url("/blog"))
        now = datetime.now(UTC)
        result = await db.execute(
            select(BlogPost).where(
                BlogPost.status == "published",
                BlogPost.published_at.is_not(None),
                BlogPost.published_at <= now,
            )
        )
        for post in result.scalars().all():
            urls.append(_url(f"/blog/{post.slug}"))
    urls.extend(_url(path) for path in STATIC_PATHS[1:])

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=300"},
    )
