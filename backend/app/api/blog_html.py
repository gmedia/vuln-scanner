from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.blog import BlogPost
from app.services.blog import escape_text, is_publicly_visible

html_router = APIRouter(tags=["blog-html"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:blog-html",
)

CANONICAL_HOST = "https://sinexis.app"


def _shell(title: str, canonical: str, inner: str, locale: str = "id") -> str:
    return f"""<!DOCTYPE html>
<html lang="{escape_text(locale)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{escape_text(title)}</title>
<link rel="canonical" href="{escape_text(canonical)}"/>
<meta name="robots" content="index,follow"/>
<style>
body{{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#111}}
a{{color:#0a7}} nav{{margin-bottom:1.5rem}} article h1{{font-size:1.75rem}}
.excerpt{{color:#444}} time{{color:#666;font-size:.875rem}}
</style>
</head>
<body>
<nav><a href="/">Sinexis</a> · <a href="/blog">Blog</a></nav>
{inner}
</body>
</html>
"""


@html_router.get("/blog", response_class=HTMLResponse)
@html_router.get("/blog/", response_class=HTMLResponse)
async def blog_index_html(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    now = datetime.now(UTC)
    result = await db.execute(
        select(BlogPost)
        .where(
            BlogPost.status == "published",
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= now,
        )
        .order_by(BlogPost.published_at.desc())
        .limit(50)
    )
    posts = list(result.scalars().all())
    if not posts:
        inner = "<p>Belum ada artikel</p>"
    else:
        items = []
        for p in posts:
            pub = p.published_at.isoformat() if p.published_at else ""
            items.append(
                f'<li><a href="/blog/{escape_text(p.slug)}">{escape_text(p.title)}</a>'
                f"<p class='excerpt'>{escape_text(p.excerpt)}</p>"
                f"<time datetime='{escape_text(pub)}'>{escape_text(pub)}</time></li>"
            )
        inner = "<h1>Blog</h1><ul>" + "".join(items) + "</ul>"
    html = _shell("Blog — Sinexis", f"{CANONICAL_HOST}/blog", inner)
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300",
            "X-Robots-Tag": "index, follow",
        },
    )


@html_router.get("/blog/sitemap.xml")
async def blog_sitemap(db: AsyncSession = Depends(get_db)) -> Response:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    now = datetime.now(UTC)
    result = await db.execute(
        select(BlogPost).where(
            BlogPost.status == "published",
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= now,
        )
    )
    posts = list(result.scalars().all())
    urls = [f"  <url><loc>{CANONICAL_HOST}/blog</loc></url>"]
    for p in posts:
        urls.append(f"  <url><loc>{CANONICAL_HOST}/blog/{escape_text(p.slug)}</loc></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n</urlset>\n"
    cache = {"Cache-Control": "public, max-age=60, s-maxage=300"}
    return Response(content=xml, media_type="application/xml", headers=cache)


@html_router.get("/blog/{slug}", response_class=HTMLResponse)
async def blog_article_html(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    if slug == "sitemap.xml":
        raise HTTPException(status_code=404, detail="Not found")
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    result = await db.execute(select(BlogPost).where(BlogPost.slug == slug))
    post = result.scalar_one_or_none()
    if post is None or not is_publicly_visible(post.status, post.published_at):
        raise HTTPException(status_code=404, detail="Not found")
    pub = post.published_at.isoformat() if post.published_at else ""
    inner = (
        f"<article data-testid='blog-article-title'>"
        f"<h1>{escape_text(post.title)}</h1>"
        f"<time datetime='{escape_text(pub)}'>{escape_text(pub)}</time>"
        f"<p class='excerpt'>{escape_text(post.excerpt)}</p>"
        f"<div class='body'>{post.body_html}</div>"
        f"</article>"
    )
    html = _shell(f"{post.title} — Sinexis", f"{CANONICAL_HOST}/blog/{post.slug}", inner, post.locale)
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300",
            "X-Robots-Tag": "index, follow",
        },
    )
