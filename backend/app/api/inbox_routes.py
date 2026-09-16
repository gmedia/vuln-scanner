from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.email_send_log import EMAIL_SEND_STATUSES, INBOX_KINDS, EmailSendLog
from app.models.user import User
from app.schemas.inbox import InboxItem, InboxListResponse
from app.services.auth import get_current_user

router = APIRouter(tags=["inbox"])

inbox_limiter = RateLimiter(
    max_requests=settings.jwt_rate_limit,
    window_seconds=settings.jwt_rate_limit_window,
    prefix="ratelimit:inbox",
)


@router.get("/inbox", response_model=InboxListResponse)
async def list_inbox(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    kind: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InboxListResponse | Response:
    limit_response = await inbox_limiter(request)
    if limit_response:
        return limit_response
    filters = [
        EmailSendLog.user_id == current_user.id,
        EmailSendLog.kind.in_(INBOX_KINDS),
    ]
    if kind:
        if kind not in INBOX_KINDS:
            raise HTTPException(status_code=400, detail="Invalid kind")
        filters.append(EmailSendLog.kind == kind)
    if status_filter:
        if status_filter not in EMAIL_SEND_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        filters.append(EmailSendLog.status == status_filter)
    total = (await db.execute(select(func.count(EmailSendLog.id)).where(*filters))).scalar() or 0
    rows = (
        (
            await db.execute(
                select(EmailSendLog)
                .where(*filters)
                .order_by(EmailSendLog.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    return InboxListResponse(items=[InboxItem.model_validate(r) for r in rows], total=total)
