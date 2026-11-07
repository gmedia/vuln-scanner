"""Admin AI top-up pack catalog (S1).

Deliberately **not** gated on ``AI_GATEWAY_ENABLED``: ops must be able to prepare
the catalog (and later resolve an already-paid verification queue) while the
customer-facing gateway is off. Access is platform-admin only.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.ai_topup import AiTopupPackCreate, AiTopupPackList, AiTopupPackOut, AiTopupPackUpdate
from app.services import ai_topup as service
from app.services.auth import get_current_admin

router = APIRouter(prefix="/admin/ai/topup", tags=["admin-ai-topup"])


@router.get("/packs", response_model=AiTopupPackList)
async def list_packs(
    active_only: bool = Query(default=False),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackList:
    rows = await service.list_packs(db, active_only=active_only)
    return AiTopupPackList(items=[AiTopupPackOut.model_validate(row) for row in rows], total=len(rows))


@router.post("/packs", response_model=AiTopupPackOut, status_code=status.HTTP_201_CREATED)
async def create_pack(
    body: AiTopupPackCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackOut:
    row = await service.create_pack(
        db,
        code=body.code,
        label=body.label,
        amount_idr=body.amount_idr,
        bonus_idr=body.bonus_idr,
        active=body.active,
        sort_order=body.sort_order,
    )
    return AiTopupPackOut.model_validate(row)


@router.patch("/packs/{pack_id}", response_model=AiTopupPackOut)
async def update_pack(
    pack_id: uuid.UUID,
    body: AiTopupPackUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackOut:
    row = await service.update_pack(
        db,
        pack_id,
        code=body.code,
        label=body.label,
        amount_idr=body.amount_idr,
        bonus_idr=body.bonus_idr,
        active=body.active,
        sort_order=body.sort_order,
    )
    return AiTopupPackOut.model_validate(row)
