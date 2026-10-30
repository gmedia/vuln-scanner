"""Daily USD/IDR FX-rate store and fetch service (admin display/entry only).

COGS and billing keep using ``settings.ai_usd_idr``; nothing here changes billed
or cost math. The admin model editor reads ``effective_rate`` to show prices in
USD per 1M tokens and ``refresh`` / ``set_manual`` write the snapshot rows.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ai_gateway import AiFxRate

FX_BASE = "USD"
FX_QUOTE = "IDR"


class FxFetchError(RuntimeError):
    """Upstream FX source unavailable or returned an unusable payload."""


def _fetch_error(exc: Exception) -> FxFetchError:
    """Build an error that names the failure kind without echoing the source URL."""
    return FxFetchError(f"FX source request failed: {type(exc).__name__}")


def _parse_positive(raw: object) -> Decimal:
    try:
        parsed = Decimal(str(raw))
    except (InvalidOperation, ValueError) as exc:
        raise FxFetchError("FX rate is not numeric") from exc
    if not parsed.is_finite() or parsed <= 0:
        raise FxFetchError("FX rate must be a positive finite number")
    return parsed


def _payload_date(payload: Mapping[str, Any]) -> date:
    raw = payload.get("date")
    if raw is None:
        return datetime.now(UTC).date()
    try:
        return date.fromisoformat(str(raw))
    except ValueError as exc:
        raise FxFetchError("FX payload date is not ISO-8601") from exc


def _json_object(response: httpx.Response) -> Mapping[str, Any]:
    try:
        payload: object = response.json()
    except ValueError as exc:
        raise _fetch_error(exc) from exc
    if not isinstance(payload, Mapping):
        raise FxFetchError("FX payload is not a JSON object")
    return payload


async def _async_get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    try:
        response = await client.get(url)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise _fetch_error(exc) from exc
    return response


def _sync_get(client: httpx.Client, url: str) -> httpx.Response:
    try:
        response = client.get(url)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise _fetch_error(exc) from exc
    return response


def parse_rate_payload(payload: Mapping[str, Any]) -> tuple[Decimal, date]:
    """Parse a frankfurter or open.er-api style payload into ``(rate, date)``."""
    rates = payload.get("rates")
    if not isinstance(rates, Mapping):
        raise FxFetchError("FX payload has no rates object")
    if FX_QUOTE not in rates:
        raise FxFetchError(f"FX payload has no {FX_QUOTE} rate")
    return _parse_positive(rates[FX_QUOTE]), _payload_date(payload)


async def fetch_rate(
    url: str | None = None,
    timeout: float | None = None,
    client: httpx.AsyncClient | None = None,
) -> tuple[Decimal, date]:
    """Fetch the current USD/IDR rate; ``client`` is reused and never closed here."""
    target = url or settings.ai_fx_source_url
    if client is not None:
        return parse_rate_payload(_json_object(await _async_get(client, target)))
    timeout_s = settings.ai_fx_timeout_seconds if timeout is None else timeout
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout_s) as own:
        return parse_rate_payload(_json_object(await _async_get(own, target)))


def fetch_rate_sync(url: str | None = None, timeout: float | None = None) -> tuple[Decimal, date]:
    """Blocking variant for the Celery task; same contract as :func:`fetch_rate`."""
    target = url or settings.ai_fx_source_url
    timeout_s = settings.ai_fx_timeout_seconds if timeout is None else timeout
    with httpx.Client(follow_redirects=True, timeout=timeout_s) as client:
        return parse_rate_payload(_json_object(_sync_get(client, target)))


def source_label(url: str | None = None) -> str:
    return urlparse(url or settings.ai_fx_source_url).hostname or "auto"


def _apply_values(
    row: AiFxRate,
    *,
    rate: Decimal,
    source: str,
    effective_date: date,
    user_id: uuid.UUID | None,
) -> None:
    row.base = FX_BASE
    row.quote = FX_QUOTE
    row.rate = rate
    row.source = source
    row.effective_date = effective_date
    row.fetched_at = datetime.now(UTC)
    row.created_by = user_id


async def upsert_rate(
    db: AsyncSession,
    *,
    rate: Decimal,
    source: str,
    effective_date: date,
    user_id: uuid.UUID | None = None,
) -> AiFxRate:
    """Insert or overwrite the (USD, IDR, effective_date) row — portable, no ON CONFLICT."""
    result = await db.execute(
        select(AiFxRate).where(
            AiFxRate.base == FX_BASE,
            AiFxRate.quote == FX_QUOTE,
            AiFxRate.effective_date == effective_date,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AiFxRate(rate=rate, source=source, effective_date=effective_date)
        db.add(row)
    _apply_values(row, rate=rate, source=source, effective_date=effective_date, user_id=user_id)
    await db.flush()
    await db.refresh(row)
    return row


def upsert_rate_sync(
    db: Session,
    *,
    rate: Decimal,
    source: str,
    effective_date: date,
    user_id: uuid.UUID | None = None,
) -> AiFxRate:
    """Sync-session variant of :func:`upsert_rate`."""
    row = db.execute(
        select(AiFxRate).where(
            AiFxRate.base == FX_BASE,
            AiFxRate.quote == FX_QUOTE,
            AiFxRate.effective_date == effective_date,
        )
    ).scalar_one_or_none()
    if row is None:
        row = AiFxRate(rate=rate, source=source, effective_date=effective_date)
        db.add(row)
    _apply_values(row, rate=rate, source=source, effective_date=effective_date, user_id=user_id)
    db.flush()
    db.refresh(row)
    return row


async def latest(db: AsyncSession) -> AiFxRate | None:
    result = await db.execute(
        select(AiFxRate).order_by(AiFxRate.effective_date.desc(), AiFxRate.fetched_at.desc()).limit(1)
    )
    return result.scalars().first()


async def effective_rate(db: AsyncSession) -> tuple[Decimal, str, AiFxRate | None]:
    """Newest stored rate, or the env fallback when the table is empty."""
    row = await latest(db)
    if row is None:
        return Decimal(settings.ai_usd_idr), "env", None
    return row.rate, row.source, row


async def refresh(db: AsyncSession, user_id: uuid.UUID | None = None) -> AiFxRate:
    rate, effective_date = await fetch_rate()
    return await upsert_rate(
        db,
        rate=rate,
        source=source_label(),
        effective_date=effective_date,
        user_id=user_id,
    )


async def set_manual(db: AsyncSession, *, rate: Decimal, user_id: uuid.UUID | None = None) -> AiFxRate:
    return await upsert_rate(
        db,
        rate=rate,
        source="manual",
        effective_date=datetime.now(UTC).date(),
        user_id=user_id,
    )


async def history(db: AsyncSession, limit: int = 30) -> list[AiFxRate]:
    result = await db.execute(
        select(AiFxRate).order_by(AiFxRate.effective_date.desc(), AiFxRate.fetched_at.desc()).limit(limit)
    )
    return list(result.scalars().all())
