"""AI wallet: USD price snapshots, IDR settlement, and the IDR ledger.

Prices are canonical USD per 1M tokens. A :class:`PriceSnapshot` is resolved once
per request and stored on the reservation; settlement never re-reads the model or
the FX table, so a mid-request price edit cannot change the charge.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import AiModel, AiReservation, AiUsageEvent, AiWallet, AiWalletLedger
from app.models.organization import Organization
from app.services import ai_fx

ONE_MILLION = Decimal(1_000_000)
USD_12DP = Decimal("0.000000000001")
USD_6DP = Decimal("0.000001")


@dataclass(frozen=True, slots=True)
class PriceSnapshot:
    """Prices in USD per 1M tokens plus the IDR rate locked at reserve time."""

    price_usd_per_1m_in: Decimal
    price_usd_per_1m_out: Decimal
    hpp_usd_per_1m_in: Decimal
    hpp_usd_per_1m_out: Decimal
    fx_rate: Decimal
    fx_source: str
    fx_effective_date: date | None


def _legacy_usd(legacy_idr_per_1k: int | None, fx_rate: Decimal) -> Decimal:
    """IDR-per-1K → USD-per-1M at the supplied rate, matching the Numeric(18,6) column."""
    usd = Decimal(legacy_idr_per_1k or 0) * 1000 / fx_rate
    return usd.quantize(USD_6DP, rounding=ROUND_HALF_UP)


def _legacy_hpp(legacy_usd_per_1k: int | None) -> Decimal:
    return (Decimal(legacy_usd_per_1k or 0) * 1000).quantize(USD_6DP, rounding=ROUND_HALF_UP)


async def resolve_snapshot(db: AsyncSession, model: AiModel) -> PriceSnapshot:
    """Resolve the rate and USD prices once, deriving NULL USD columns from legacy IDR."""
    fx_rate, fx_source, fx_row = await ai_fx.effective_rate(db)
    price_in = model.price_usd_per_1m_in
    price_out = model.price_usd_per_1m_out
    hpp_in = model.hpp_usd_per_1m_in
    hpp_out = model.hpp_usd_per_1m_out
    if price_in is None:
        price_in = _legacy_usd(model.price_idr_per_1k_in, fx_rate)
    if price_out is None:
        price_out = _legacy_usd(model.price_idr_per_1k_out, fx_rate)
    if hpp_in is None:
        hpp_in = _legacy_hpp(model.hpp_usd_per_1k_in)
    if hpp_out is None:
        hpp_out = _legacy_hpp(model.hpp_usd_per_1k_out)
    return PriceSnapshot(
        price_usd_per_1m_in=price_in,
        price_usd_per_1m_out=price_out,
        hpp_usd_per_1m_in=hpp_in,
        hpp_usd_per_1m_out=hpp_out,
        fx_rate=fx_rate,
        fx_source=fx_source,
        fx_effective_date=fx_row.effective_date if fx_row is not None else None,
    )


def snapshot_from_reservation(reservation: AiReservation) -> PriceSnapshot | None:
    """The reservation's locked snapshot, or ``None`` for rows created by the prior release."""
    price_in = reservation.price_usd_per_1m_in
    price_out = reservation.price_usd_per_1m_out
    hpp_in = reservation.hpp_usd_per_1m_in
    hpp_out = reservation.hpp_usd_per_1m_out
    fx_rate = reservation.fx_rate
    if price_in is None or price_out is None or hpp_in is None or hpp_out is None or fx_rate is None:
        return None
    return PriceSnapshot(
        price_usd_per_1m_in=price_in,
        price_usd_per_1m_out=price_out,
        hpp_usd_per_1m_in=hpp_in,
        hpp_usd_per_1m_out=hpp_out,
        fx_rate=fx_rate,
        fx_source=reservation.fx_source or "legacy_env",
        fx_effective_date=reservation.fx_effective_date,
    )


def _usd(*, prompt_tokens: int, completion_tokens: int, price_in: Decimal, price_out: Decimal) -> Decimal:
    tokens_in = Decimal(max(prompt_tokens, 0))
    tokens_out = Decimal(max(completion_tokens, 0))
    return (tokens_in * price_in + tokens_out * price_out) / ONE_MILLION


def _ceil_idr(usd: Decimal, fx_rate: Decimal) -> int:
    return int((usd * fx_rate).to_integral_value(rounding=ROUND_CEILING))


def billed_usd(*, prompt_tokens: int, completion_tokens: int, snapshot: PriceSnapshot) -> Decimal:
    usd = _usd(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        price_in=snapshot.price_usd_per_1m_in,
        price_out=snapshot.price_usd_per_1m_out,
    )
    return usd.quantize(USD_12DP, rounding=ROUND_HALF_UP)


def cogs_usd(*, prompt_tokens: int, completion_tokens: int, snapshot: PriceSnapshot) -> Decimal:
    usd = _usd(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        price_in=snapshot.hpp_usd_per_1m_in,
        price_out=snapshot.hpp_usd_per_1m_out,
    )
    return usd.quantize(USD_12DP, rounding=ROUND_HALF_UP)


def billed_idr(*, prompt_tokens: int, completion_tokens: int, snapshot: PriceSnapshot) -> int:
    if max(prompt_tokens, 0) + max(completion_tokens, 0) == 0:
        return 0
    usd = _usd(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        price_in=snapshot.price_usd_per_1m_in,
        price_out=snapshot.price_usd_per_1m_out,
    )
    return _ceil_idr(usd, snapshot.fx_rate)


def cogs_idr(*, prompt_tokens: int, completion_tokens: int, snapshot: PriceSnapshot) -> int:
    if max(prompt_tokens, 0) + max(completion_tokens, 0) == 0:
        return 0
    usd = _usd(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        price_in=snapshot.hpp_usd_per_1m_in,
        price_out=snapshot.hpp_usd_per_1m_out,
    )
    return _ceil_idr(usd, snapshot.fx_rate)


def hold_idr(*, max_tokens: int, snapshot: PriceSnapshot, prompt_tokens: int = 1) -> int:
    return billed_idr(
        prompt_tokens=max(prompt_tokens, 1),
        completion_tokens=max(max_tokens, 1),
        snapshot=snapshot,
    )


def affordable_max_tokens(
    *, balance_idr: int, snapshot: PriceSnapshot, max_tokens_cap: int, prompt_tokens: int = 1
) -> int:
    if balance_idr < 1 or max_tokens_cap < 1:
        return 0
    lo, hi, best = 1, max_tokens_cap, 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if hold_idr(max_tokens=mid, snapshot=snapshot, prompt_tokens=prompt_tokens) <= balance_idr:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def affordable_prompt_tokens(*, balance_idr: int, snapshot: PriceSnapshot, prompt_tokens: int) -> int:
    want = max(prompt_tokens, 1)
    if billed_idr(prompt_tokens=1, completion_tokens=1, snapshot=snapshot) > balance_idr:
        return 0
    if hold_idr(max_tokens=1, snapshot=snapshot, prompt_tokens=want) <= balance_idr:
        return want
    lo, hi, best = 1, want, 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if hold_idr(max_tokens=1, snapshot=snapshot, prompt_tokens=mid) <= balance_idr:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return best


async def get_wallet(db: AsyncSession, organization_id: UUID) -> AiWallet | None:
    return (await db.execute(select(AiWallet).where(AiWallet.organization_id == organization_id))).scalar_one_or_none()


async def get_or_create_wallet(db: AsyncSession, organization_id: UUID) -> AiWallet:
    row = await get_wallet(db, organization_id)
    if row is not None:
        return row
    org = await db.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    row = AiWallet(organization_id=organization_id, balance_idr=0)
    db.add(row)
    await db.flush()
    return row


async def _balance_idr(db: AsyncSession, organization_id: UUID) -> int:
    value = (
        await db.execute(select(AiWallet.balance_idr).where(AiWallet.organization_id == organization_id))
    ).scalar_one()
    return int(value)


async def _ledger(
    db: AsyncSession,
    *,
    organization_id: UUID,
    kind: str,
    delta_idr: int,
    balance_after_idr: int,
    reservation_id: UUID | None = None,
    usage_event_id: UUID | None = None,
    actor_user_id: UUID | None = None,
) -> None:
    db.add(
        AiWalletLedger(
            organization_id=organization_id,
            kind=kind,
            delta_idr=delta_idr,
            balance_after_idr=balance_after_idr,
            reservation_id=reservation_id,
            usage_event_id=usage_event_id,
            actor_user_id=actor_user_id,
        )
    )
    await db.flush()


async def topup(db: AsyncSession, organization_id: UUID, amount_idr: int) -> AiWallet:
    if amount_idr < 1:
        raise HTTPException(status_code=422, detail="amount_idr must be positive")
    wallet = await get_or_create_wallet(db, organization_id)
    await db.execute(
        update(AiWallet)
        .where(AiWallet.organization_id == organization_id)
        .values(balance_idr=AiWallet.balance_idr + amount_idr)
    )
    balance = await _balance_idr(db, organization_id)
    await _ledger(
        db,
        organization_id=organization_id,
        kind="topup",
        delta_idr=amount_idr,
        balance_after_idr=balance,
    )
    await db.commit()
    await db.refresh(wallet)
    return wallet


async def reserve(
    db: AsyncSession,
    *,
    organization_id: UUID,
    hold: int,
    snapshot: PriceSnapshot,
    key_id: UUID | None = None,
    model_public_id: str | None = None,
    prompt_tokens_est: int | None = None,
    completion_tokens_max: int | None = None,
    actor_user_id: UUID | None = None,
) -> AiReservation:
    if hold < 1:
        raise HTTPException(status_code=422, detail="hold must be positive")
    await get_or_create_wallet(db, organization_id)
    result = await db.execute(
        update(AiWallet)
        .where(AiWallet.organization_id == organization_id, AiWallet.balance_idr >= hold)
        .values(balance_idr=AiWallet.balance_idr - hold)
    )
    if int(getattr(result, "rowcount", 0) or 0) != 1:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient AI wallet balance")
    balance = await _balance_idr(db, organization_id)
    reservation = AiReservation(
        id=uuid.uuid4(),
        organization_id=organization_id,
        key_id=key_id,
        model_public_id=model_public_id,
        hold_idr=hold,
        status="open",
        price_usd_per_1m_in=snapshot.price_usd_per_1m_in,
        price_usd_per_1m_out=snapshot.price_usd_per_1m_out,
        hpp_usd_per_1m_in=snapshot.hpp_usd_per_1m_in,
        hpp_usd_per_1m_out=snapshot.hpp_usd_per_1m_out,
        fx_rate=snapshot.fx_rate,
        fx_source=snapshot.fx_source,
        fx_effective_date=snapshot.fx_effective_date,
        prompt_tokens_est=prompt_tokens_est,
        completion_tokens_max=completion_tokens_max,
    )
    db.add(reservation)
    await db.flush()
    await _ledger(
        db,
        organization_id=organization_id,
        kind="reserve",
        delta_idr=-hold,
        balance_after_idr=balance,
        reservation_id=reservation.id,
        actor_user_id=actor_user_id,
    )
    return reservation


async def _close_reservation(db: AsyncSession, reservation: AiReservation, new_status: str) -> None:
    result = await db.execute(
        update(AiReservation)
        .where(AiReservation.id == reservation.id, AiReservation.status == "open")
        .values(status=new_status)
    )
    if int(getattr(result, "rowcount", 0) or 0) != 1:
        raise HTTPException(status_code=409, detail="Reservation is not open")
    reservation.status = new_status


async def _debit_up_to(db: AsyncSession, organization_id: UUID, amount: int) -> int:
    """Debit at most ``amount`` without ever going negative; returns the amount debited."""
    remaining = amount
    debited = 0
    for _ in range(2):
        balance = await _balance_idr(db, organization_id)
        take = min(balance, remaining)
        if take <= 0:
            return debited
        result = await db.execute(
            update(AiWallet)
            .where(AiWallet.organization_id == organization_id, AiWallet.balance_idr >= take)
            .values(balance_idr=AiWallet.balance_idr - take)
        )
        if int(getattr(result, "rowcount", 0) or 0) == 1:
            debited += take
            remaining -= take
            if remaining <= 0:
                return debited
    return debited


async def settle(
    db: AsyncSession,
    *,
    reservation: AiReservation,
    billed: int,
    usage_event: AiUsageEvent | None = None,
) -> AiReservation:
    billed = max(0, billed)
    await _close_reservation(db, reservation, "settled")
    delta = billed - reservation.hold_idr
    shortfall = 0
    if usage_event is not None:
        await db.flush()
    usage_event_id = usage_event.id if usage_event is not None else None
    if delta < 0:
        refund = -delta
        await db.execute(
            update(AiWallet)
            .where(AiWallet.organization_id == reservation.organization_id)
            .values(balance_idr=AiWallet.balance_idr + refund)
        )
        balance = await _balance_idr(db, reservation.organization_id)
        await _ledger(
            db,
            organization_id=reservation.organization_id,
            kind="settle_adjust",
            delta_idr=refund,
            balance_after_idr=balance,
            reservation_id=reservation.id,
            usage_event_id=usage_event_id,
        )
    elif delta > 0:
        debited = await _debit_up_to(db, reservation.organization_id, delta)
        shortfall = delta - debited
        if debited > 0:
            balance = await _balance_idr(db, reservation.organization_id)
            await _ledger(
                db,
                organization_id=reservation.organization_id,
                kind="settle_adjust",
                delta_idr=-debited,
                balance_after_idr=balance,
                reservation_id=reservation.id,
                usage_event_id=usage_event_id,
            )
    if usage_event is not None:
        usage_event.shortfall_idr = shortfall
    await db.flush()
    return reservation


async def release(db: AsyncSession, reservation: AiReservation) -> AiReservation:
    await _close_reservation(db, reservation, "released")
    await db.execute(
        update(AiWallet)
        .where(AiWallet.organization_id == reservation.organization_id)
        .values(balance_idr=AiWallet.balance_idr + reservation.hold_idr)
    )
    balance = await _balance_idr(db, reservation.organization_id)
    await _ledger(
        db,
        organization_id=reservation.organization_id,
        kind="release",
        delta_idr=reservation.hold_idr,
        balance_after_idr=balance,
        reservation_id=reservation.id,
    )
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
    billed_usd: Decimal | None = None,
    cogs_usd: Decimal | None = None,
    snapshot: PriceSnapshot | None = None,
    shortfall_idr: int = 0,
    usage_missing: bool = False,
    billed_estimated: bool = False,
    cached_tokens: int = 0,
    ttft_ms: int | None = None,
    latency_ms: int | None = None,
    http_status: int | None = None,
    finish_reason: str | None = None,
    provider_request_id: str | None = None,
    request_payload: dict[str, Any] | None = None,
    response_payload: dict[str, Any] | None = None,
    provider_id: UUID | None = None,
) -> AiUsageEvent:
    event = AiUsageEvent(
        organization_id=organization_id,
        user_id=user_id,
        key_id=key_id,
        source=source,
        model_public_id=model.public_id,
        provider_id=provider_id if provider_id is not None else model.provider_id,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        billed_idr=billed,
        cogs_idr=cogs,
        billed_usd=billed_usd,
        cogs_usd=cogs_usd,
        fx_rate=snapshot.fx_rate if snapshot is not None else None,
        fx_source=snapshot.fx_source if snapshot is not None else None,
        fx_effective_date=snapshot.fx_effective_date if snapshot is not None else None,
        price_usd_per_1m_in=snapshot.price_usd_per_1m_in if snapshot is not None else None,
        price_usd_per_1m_out=snapshot.price_usd_per_1m_out if snapshot is not None else None,
        hpp_usd_per_1m_in=snapshot.hpp_usd_per_1m_in if snapshot is not None else None,
        hpp_usd_per_1m_out=snapshot.hpp_usd_per_1m_out if snapshot is not None else None,
        shortfall_idr=shortfall_idr,
        usage_missing=usage_missing,
        billed_estimated=billed_estimated,
        cached_tokens=max(cached_tokens, 0),
        ttft_ms=ttft_ms,
        latency_ms=latency_ms,
        http_status=http_status,
        finish_reason=finish_reason,
        provider_request_id=provider_request_id,
        reservation_id=reservation_id,
        request_payload=request_payload,
        response_payload=response_payload,
    )
    db.add(event)
    await db.flush()
    return event
