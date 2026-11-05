from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.blog_html import CANONICAL_HOST
from app.api.sitemap_common import lastmod_tag
from app.config import settings
from app.database import get_db
from app.models.blog import BlogPost
from app.services.blog import escape_text

html_router = APIRouter(tags=["sitemap-html"])

PRODUCT_SLUGS = ("scan", "guard", "host", "uptime", "ai-gateway")
STATIC_PATHS = ("/terms", "/privacy")


def _url(path: str, lastmod: datetime | None = None) -> str:
    return f"  <url><loc>{CANONICAL_HOST}{escape_text(path)}</loc>{lastmod_tag(lastmod)}</url>"


@html_router.get("/sitemap.xml")
async def sitemap(db: AsyncSession = Depends(get_db)) -> Response:
    """Sitewide sitemap: static pages, product pages, and published blog posts.

    Blog URLs are omitted when the blog is disabled. Product slugs mirror the
    published entries in the frontend registry; the CI sync check keeps them
    aligned.
    """
    urls = [_url("/"), _url("/products")]
    urls.extend(_url(f"/products/{slug}") for slug in PRODUCT_SLUGS)
    if settings.blog_enabled:
        now = datetime.now(UTC)
        result = await db.execute(
            select(BlogPost).where(
                BlogPost.status == "published",
                BlogPost.published_at.is_not(None),
                BlogPost.published_at <= now,
            )
        )
        posts = list(result.scalars().all())
        index_lastmod = max((p.updated_at for p in posts), default=None)
        urls.append(_url("/blog", index_lastmod))
        for post in posts:
            urls.append(_url(f"/blog/{post.slug}", post.updated_at or post.published_at))
    urls.extend(_url(path) for path in STATIC_PATHS)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>\n"
    )
    return Response(
        content=xml,
        # Serve an exact `text/xml` (Starlette would append `; charset=utf-8` if this
        # went through media_type); the XML prolog already declares UTF-8.
        headers={
            "Content-Type": "text/xml",
            "Cache-Control": "public, max-age=300",
        },
    )
