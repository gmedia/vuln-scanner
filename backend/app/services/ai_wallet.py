from __future__ import annotations

import math
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import AiModel, AiReservation, AiUsageEvent, AiWallet
from app.models.organization import Organization


def billed_idr(*, prompt_tokens: int, completion_tokens: int, model: AiModel) -> int:
    inn = math.ceil(max(prompt_tokens, 0) * model.price_idr_per_1k_in / 1000)
    out = math.ceil(max(completion_tokens, 0) * model.price_idr_per_1k_out / 1000)
    return inn + out


def cogs_idr(*, prompt_tokens: int, completion_tokens: int, model: AiModel, usd_idr: int) -> int:
    inn = math.ceil(max(prompt_tokens, 0) * model.hpp_usd_per_1k_in * usd_idr / 1000)
    out = math.ceil(max(completion_tokens, 0) * model.hpp_usd_per_1k_out * usd_idr / 1000)
    return inn + out


def hold_idr(*, max_tokens: int, model: AiModel) -> int:
    cap = min(max(max_tokens, 1), model.max_tokens_cap)
    return math.ceil(cap * model.price_idr_per_1k_out / 1000) + model.price_idr_per_1k_in


async def get_or_create_wallet(db: AsyncSession, organization_id: UUID) -> AiWallet:
    row = (
        await db.execute(select(AiWallet).where(AiWallet.organization_id == organization_id))
    ).scalar_one_or_none()
    if row is not None:
        return row
    org = await db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    row = AiWallet(organization_id=organization_id, balance_idr=0)
    db.add(row)
    await db.flush()
    return row


async def topup(db: AsyncSession, organization_id: UUID, amount_idr: int) -> AiWallet:
    if amount_idr < 1:
        raise HTTPException(status_code=422, detail="amount_idr must be positive")
    wallet = await get_or_create_wallet(db, organization_id)
    await db.execute(
        update(AiWallet)
        .where(AiWallet.id == wallet.id)
        .values(balance_idr=AiWallet.balance_idr + amount_idr)
    )
    await db.commit()
    await db.refresh(wallet)
    return wallet


async def reserve(
    db: AsyncSession,
    *,
    organization_id: UUID,
    hold: int,
    key_id: UUID | None = None,
) -> AiReservation:
    if hold < 1:
        raise HTTPException(status_code=422, detail="hold must be positive")
    await get_or_create_wallet(db, organization_id)
    result = await db.execute(
        update(AiWallet)
        .where(AiWallet.organization_id == organization_id, AiWallet.balance_idr >= hold)
        .values(balance_idr=AiWallet.balance_idr - hold)
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient AI wallet balance")
    reservation = AiReservation(
        id=uuid.uuid4(),
        organization_id=organization_id,
        key_id=key_id,
        hold_idr=hold,
        status="open",
    )
    db.add(reservation)
    await db.flush()
    return reservation


async def settle(
    db: AsyncSession,
    *,
    reservation: AiReservation,
    billed: int,
) -> AiReservation:
    if reservation.status != "open":
        raise HTTPException(status_code=409, detail="Reservation is not open")
    billed = max(0, min(billed, reservation.hold_idr))
    refund = reservation.hold_idr - billed
    if refund:
        await db.execute(
            update(AiWallet)
            .where(AiWallet.organization_id == reservation.organization_id)
            .values(balance_idr=AiWallet.balance_idr + refund)
        )
    reservation.status = "settled"
    await db.flush()
    return reservation


async def release(db: AsyncSession, reservation: AiReservation) -> AiReservation:
    if reservation.status != "open":
        raise HTTPException(status_code=409, detail="Reservation is not open")
    await db.execute(
        update(AiWallet)
        .where(AiWallet.organization_id == reservation.organization_id)
        .values(balance_idr=AiWallet.balance_idr + reservation.hold_idr)
    )
    reservation.status = "released"
    await db.flush()
    return reservation


async def record_usage(
    db: AsyncSession,
    *,
    organization_id: UUID | None,
    user_id: UUID | None,
    key_id: UUID | None,
    source: str,
    model: AiModel,
    prompt_tokens: int,
    completion_tokens: int,
    billed: int,
    cogs: int,
    reservation_id: UUID | None,
    latency_ms: int | None = None,
    http_status: int | None = None,
    finish_reason: str | None = None,
    provider_request_id: str | None = None,
) -> AiUsageEvent:
    event = AiUsageEvent(
        organization_id=organization_id,
        user_id=user_id,
        key_id=key_id,
        source=source,
        model_public_id=model.public_id,
        provider_id=model.provider_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        billed_idr=billed,
        cogs_idr=cogs,
        latency_ms=latency_ms,
        http_status=http_status,
        finish_reason=finish_reason,
        provider_request_id=provider_request_id,
        reservation_id=reservation_id,
    )
    db.add(event)
    await db.flush()
    return event
