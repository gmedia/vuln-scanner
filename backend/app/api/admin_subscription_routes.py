from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionRequestItem,
    SubscriptionRequestListResponse,
    SubscriptionRequestResolve,
)
from app.services.auth import get_current_admin
from app.services.subscription import SubscriptionService

router = APIRouter(prefix="/admin", tags=["admin-subscription"])
admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin_subscription",
)


@router.get("/subscription-requests", response_model=SubscriptionRequestListResponse)
async def list_subscription_requests(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> SubscriptionRequestListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    items, total = await SubscriptionService(db).list_admin(
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    return SubscriptionRequestListResponse(items=items, total=total)


@router.post("/subscription-requests/{request_id}/approve", response_model=SubscriptionRequestItem)
async def approve_subscription_request(
    request_id: UUID,
    body: SubscriptionRequestResolve,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRequestItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    return await SubscriptionService(db).resolve(
        request_id,
        current_admin,
        new_status="approved",
        note=body.note,
    )


@router.post("/subscription-requests/{request_id}/reject", response_model=SubscriptionRequestItem)
async def reject_subscription_request(
    request_id: UUID,
    body: SubscriptionRequestResolve,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRequestItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    return await SubscriptionService(db).resolve(
        request_id,
        current_admin,
        new_status="rejected",
        note=body.note,
    )
