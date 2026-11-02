"""USD-per-1M price normalisation shared by the AI admin and catalog APIs.

The canonical price is USD per 1M tokens. ``price_idr_per_1k_*`` is a display
value derived from that canonical price at the request's effective FX rate; it is
never the source of truth. Legacy rows (and legacy-only admin payloads) are
converted with the same semantics as :func:`app.services.ai_wallet._legacy_usd`.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

ONE_THOUSAND = Decimal(1000)
USD_6DP = Decimal("0.000001")
FX_STALE_DAYS = 7


def legacy_idr_per_1k_to_usd_per_1m(legacy_idr_per_1k: int | None, fx_rate: Decimal) -> Decimal:
    """IDR-per-1K → USD-per-1M at the supplied rate, matching the Numeric(18,6) column."""
    usd = Decimal(legacy_idr_per_1k or 0) * ONE_THOUSAND / fx_rate
    return usd.quantize(USD_6DP, rounding=ROUND_HALF_UP)


def legacy_usd_per_1k_to_usd_per_1m(legacy_usd_per_1k: int | None) -> Decimal:
    """HPP USD-per-1K → USD-per-1M, matching the Numeric(18,6) column."""
    return (Decimal(legacy_usd_per_1k or 0) * ONE_THOUSAND).quantize(USD_6DP, rounding=ROUND_HALF_UP)


def usd_per_1m_to_idr_per_1k(usd_per_1m: Decimal, fx_rate: Decimal) -> int:
    """Derived display IDR-per-1K: ``round(usd * fx / 1000)`` with HALF_UP."""
    value = (usd_per_1m * fx_rate / ONE_THOUSAND).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(value)


def usd_per_1m_to_legacy_per_1k(usd_per_1m: Decimal) -> int:
    """Legacy integer HPP column written alongside the canonical USD price."""
    value = (usd_per_1m / ONE_THOUSAND).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(value)


def canonical_price_usd(stored_usd: Decimal | None, legacy_idr_per_1k: int, fx_rate: Decimal) -> Decimal:
    """Stored USD wins; NULL USD columns on pre-migration rows are derived from legacy IDR."""
    if stored_usd is not None:
        return stored_usd
    return legacy_idr_per_1k_to_usd_per_1m(legacy_idr_per_1k, fx_rate)


def canonical_hpp_usd(stored_usd: Decimal | None, legacy_usd_per_1k: int) -> Decimal:
    if stored_usd is not None:
        return stored_usd
    return legacy_usd_per_1k_to_usd_per_1m(legacy_usd_per_1k)


def fx_stale(effective_date: date | None, *, today: date | None = None) -> bool:
    """Env fallback (no stored row) or a snapshot older than 7 UTC days is stale."""
    if effective_date is None:
        return True
    reference = today if today is not None else datetime.now(UTC).date()
    return (reference - effective_date).days > FX_STALE_DAYS
