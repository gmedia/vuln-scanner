from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.ai_gateway import AiFxManualIn, AiFxRateOut, AiFxStatusOut
from app.services import ai_fx
from app.services.auth import get_current_admin

router = APIRouter(prefix="/admin/ai/fx", tags=["admin-ai-fx"])

fx_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin-ai-fx",
)


async def _limit(request: Request) -> Response | None:
    return await fx_limiter(request)


async def _disabled() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("", response_model=AiFxStatusOut)
async def get_fx_status(
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiFxStatusOut | Response:
    await _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    rate, source, row = await ai_fx.effective_rate(db)
    rows = await ai_fx.history(db, 30)
    return AiFxStatusOut(
        rate=float(rate),
        source=source,
        effective_date=row.effective_date if row is not None else None,
        fetched_at=row.fetched_at if row is not None else None,
        using_env_fallback=row is None,
        env_rate=settings.ai_usd_idr,
        auto_fetch_enabled=settings.ai_fx_auto_fetch,
        history=[AiFxRateOut.model_validate(item) for item in rows],
    )


@router.post("/refresh", response_model=AiFxRateOut)
async def refresh_fx_rate(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiFxRateOut | Response:
    await _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    try:
        row = await ai_fx.refresh(db, user_id=admin.id)
    except ai_fx.FxFetchError as exc:
        raise HTTPException(status_code=502, detail="FX source unavailable") from exc
    await db.commit()
    await db.refresh(row)
    return AiFxRateOut.model_validate(row)


@router.put("/manual", response_model=AiFxRateOut)
async def set_manual_fx_rate(
    request: Request,
    body: AiFxManualIn,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiFxRateOut | Response:
    await _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    row = await ai_fx.set_manual(db, rate=Decimal(str(body.rate)), user_id=admin.id)
    await db.commit()
    await db.refresh(row)
    return AiFxRateOut.model_validate(row)
