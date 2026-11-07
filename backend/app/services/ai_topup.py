"""AI top-up catalog (S1).

Only the pack catalog lives here in S1. Orders, proof upload, checkout and the
webhook settlement branch belong to later slices.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import AiTopupPack

MAX_CODE = 32
MAX_LABEL = 64


def _validate(*, code: str, label: str, amount_idr: int, bonus_idr: int) -> None:
    if not code.strip():
        raise HTTPException(status_code=422, detail="code must not be empty")
    if len(code) > MAX_CODE:
        raise HTTPException(status_code=422, detail="code is too long")
    if not label.strip():
        raise HTTPException(status_code=422, detail="label must not be empty")
    if len(label) > MAX_LABEL:
        raise HTTPException(status_code=422, detail="label is too long")
    if amount_idr < 1:
        raise HTTPException(status_code=422, detail="amount_idr must be positive")
    if bonus_idr < 0:
        raise HTTPException(status_code=422, detail="bonus_idr must be non-negative")


async def _code_taken(db: AsyncSession, code: str, *, exclude_id: UUID | None = None) -> bool:
    stmt = select(AiTopupPack.id).where(AiTopupPack.code == code)
    if exclude_id is not None:
        stmt = stmt.where(AiTopupPack.id != exclude_id)
    return (await db.execute(stmt)).first() is not None


async def list_packs(db: AsyncSession, active_only: bool = False) -> list[AiTopupPack]:
    stmt = select(AiTopupPack).order_by(AiTopupPack.sort_order, AiTopupPack.code)
    if active_only:
        stmt = stmt.where(AiTopupPack.active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def get_pack(db: AsyncSession, pack_id: UUID) -> AiTopupPack:
    row = await db.get(AiTopupPack, pack_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Top-up pack not found")
    return row


async def create_pack(
    db: AsyncSession,
    *,
    code: str,
    label: str,
    amount_idr: int,
    bonus_idr: int = 0,
    active: bool = True,
    sort_order: int = 0,
    commit: bool = True,
) -> AiTopupPack:
    _validate(code=code, label=label, amount_idr=amount_idr, bonus_idr=bonus_idr)
    if await _code_taken(db, code):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists")
    row = AiTopupPack(
        code=code,
        label=label,
        amount_idr=amount_idr,
        bonus_idr=bonus_idr,
        active=active,
        sort_order=int(sort_order),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists") from exc
    if commit:
        await db.commit()
        await db.refresh(row)
    return row


async def update_pack(
    db: AsyncSession,
    pack_id: UUID,
    *,
    code: str | None = None,
    label: str | None = None,
    amount_idr: int | None = None,
    bonus_idr: int | None = None,
    active: bool | None = None,
    sort_order: int | None = None,
    commit: bool = True,
) -> AiTopupPack:
    row = await get_pack(db, pack_id)
    new_code = code if code is not None else row.code
    new_label = label if label is not None else row.label
    new_amount = amount_idr if amount_idr is not None else row.amount_idr
    new_bonus = bonus_idr if bonus_idr is not None else row.bonus_idr
    _validate(code=new_code, label=new_label, amount_idr=new_amount, bonus_idr=new_bonus)
    if new_code != row.code and await _code_taken(db, new_code, exclude_id=row.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists")
    row.code = new_code
    row.label = new_label
    row.amount_idr = new_amount
    row.bonus_idr = new_bonus
    if active is not None:
        row.active = active
    if sort_order is not None:
        row.sort_order = int(sort_order)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists") from exc
    if commit:
        await db.commit()
        await db.refresh(row)
    return row
