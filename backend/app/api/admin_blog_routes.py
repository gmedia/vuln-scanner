from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.blog import BLOG_LOCALES, BLOG_STATUSES, BlogPost
from app.models.user import User
from app.schemas.blog import (
    BlogPostAdminList,
    BlogPostAdminOut,
    BlogPostCreate,
    BlogPostUpdate,
    BlogUnpublishRequest,
)
from app.services.auth import get_current_admin
from app.services.blog import BlogValidationError, render_body_html, validate_slug

router = APIRouter(prefix="/admin/blog", tags=["admin-blog"])

admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin",
)


async def _limit(request: Request) -> Response | None:
    return await admin_limiter(request)


def _disabled() -> None:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/posts", response_model=BlogPostAdminList)
async def list_admin_posts(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminList | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    total = (await db.execute(select(func.count(BlogPost.id)))).scalar() or 0
    result = await db.execute(
        select(BlogPost).order_by(BlogPost.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = list(result.scalars().all())
    return BlogPostAdminList(items=[BlogPostAdminOut.model_validate(p) for p in items], total=total)


@router.post("/posts", response_model=BlogPostAdminOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    request: Request,
    body: BlogPostCreate,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    if body.locale not in BLOG_LOCALES:
        raise HTTPException(status_code=422, detail="Invalid locale")
    try:
        slug = validate_slug(body.slug)
        html_body = render_body_html(body.body_md)
    except BlogValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    existing = await db.execute(select(BlogPost).where(BlogPost.slug == slug))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Slug already exists")
    now = datetime.now(UTC)
    post = BlogPost(
        slug=slug,
        title=body.title.strip(),
        excerpt=body.excerpt.strip(),
        body_md=body.body_md,
        body_html=html_body,
        locale=body.locale,
        status="draft",
        author_user_id=current_admin.id,
        created_at=now,
        updated_at=now,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)


@router.get("/posts/{post_id}", response_model=BlogPostAdminOut)
async def get_admin_post(
    request: Request,
    post_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Not found")
    return BlogPostAdminOut.model_validate(post)


@router.patch("/posts/{post_id}", response_model=BlogPostAdminOut)
async def update_post(
    request: Request,
    post_id: uuid.UUID,
    body: BlogPostUpdate,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Not found")
    if body.slug is not None:
        if post.published_at is not None:
            raise HTTPException(status_code=422, detail="Slug is immutable after first publish")
        try:
            new_slug = validate_slug(body.slug)
        except BlogValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        clash = await db.execute(select(BlogPost).where(BlogPost.slug == new_slug, BlogPost.id != post.id))
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Slug already exists")
        post.slug = new_slug
    if body.title is not None:
        post.title = body.title.strip()
    if body.excerpt is not None:
        post.excerpt = body.excerpt.strip()
    if body.locale is not None:
        if body.locale not in BLOG_LOCALES:
            raise HTTPException(status_code=422, detail="Invalid locale")
        post.locale = body.locale
    if body.body_md is not None:
        try:
            post.body_html = render_body_html(body.body_md)
        except BlogValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        post.body_md = body.body_md
    post.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)


@router.post("/posts/{post_id}/publish", response_model=BlogPostAdminOut)
async def publish_post(
    request: Request,
    post_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        post.body_html = render_body_html(post.body_md)
    except BlogValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    now = datetime.now(UTC)
    post.status = "published"
    if post.published_at is None:
        post.published_at = now
    post.updated_at = now
    await db.commit()
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)


@router.post("/posts/{post_id}/unpublish", response_model=BlogPostAdminOut)
async def unpublish_post(
    request: Request,
    post_id: uuid.UUID,
    body: BlogUnpublishRequest | None = None,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> BlogPostAdminOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    post = await db.get(BlogPost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail="Not found")
    target = (body.status if body else "draft") or "draft"
    if target not in ("draft", "archived"):
        raise HTTPException(status_code=422, detail="Unpublish status must be draft or archived")
    if target not in BLOG_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")
    post.status = target
    post.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(post)
    return BlogPostAdminOut.model_validate(post)
