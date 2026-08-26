from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.blog import BLOG_LOCALES, BlogPost
from app.schemas.blog import BlogPostPublicDetail, BlogPostPublicList, BlogPostPublicListItem
from app.services.blog import is_publicly_visible

router = APIRouter(tags=["blog"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:blog-public",
)

CACHE_PUBLIC = "public, max-age=60, s-maxage=300"


def _disabled() -> None:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")


def _public_filter() -> tuple[ColumnElement[bool], ColumnElement[bool], ColumnElement[bool]]:
    now = datetime.now(UTC)
    return (
        BlogPost.status == "published",
        BlogPost.published_at.is_not(None),
        BlogPost.published_at <= now,
    )


def _etag_for(payload: str) -> str:
    return sha256(payload.encode("utf-8")).hexdigest()[:32]


def _cache_headers(response: Response, etag: str) -> None:
    response.headers["Cache-Control"] = CACHE_PUBLIC
    response.headers["ETag"] = f'"{etag}"'


@router.get("/blog/posts", response_model=BlogPostPublicList)
async def list_public_posts(
    request: Request,
    response: Response,
    locale: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> BlogPostPublicList | Response:
    _disabled()
    limited = await public_limiter(request)
    if limited:
        return limited
    filters = list(_public_filter())
    if locale:
        if locale not in BLOG_LOCALES:
            raise HTTPException(status_code=422, detail="Invalid locale")
        filters.append(BlogPost.locale == locale)
    count_q = select(func.count(BlogPost.id)).where(*filters)
    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(
        select(BlogPost)
        .where(*filters)
        .order_by(BlogPost.published_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    posts = list(result.scalars().all())
    body = BlogPostPublicList(
        items=[
            BlogPostPublicListItem(
                slug=p.slug,
                title=p.title,
                excerpt=p.excerpt,
                locale=p.locale,
                published_at=p.published_at,  # type: ignore[arg-type]
            )
            for p in posts
        ],
        total=total,
    )
    _cache_headers(response, _etag_for(body.model_dump_json()))
    return body


@router.get("/blog/posts/{slug}", response_model=BlogPostPublicDetail)
async def get_public_post(
    request: Request,
    slug: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> BlogPostPublicDetail | Response:
    _disabled()
    limited = await public_limiter(request)
    if limited:
        return limited
    result = await db.execute(select(BlogPost).where(BlogPost.slug == slug))
    post = result.scalar_one_or_none()
    if post is None or not is_publicly_visible(post.status, post.published_at):
        raise HTTPException(status_code=404, detail="Not found")
    body = BlogPostPublicDetail(
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        body_html=post.body_html,
        locale=post.locale,
        published_at=post.published_at,  # type: ignore[arg-type]
    )
    _cache_headers(response, _etag_for(body.model_dump_json()))
    return body
