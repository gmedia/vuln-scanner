"""Invoice arithmetic with no web-framework imports.

Workers import these helpers from the beat tasks. ``app.services.invoice``
imports FastAPI, which the workers image does not install, so keeping the math
here lets both sides share one implementation without pulling a web stack into
the worker.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.models.invoice import ANNUAL_MONTHS_PAID


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def month_bounds_utc(when: datetime | None = None) -> tuple[datetime, datetime]:
    now = when.astimezone(UTC) if when else datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    last = monthrange(now.year, now.month)[1]
    end = datetime(now.year, now.month, last, 23, 59, 59, 999999, tzinfo=UTC)
    return start, end


def period_bounds_utc(
    when: datetime | None, cycle: str = "monthly"
) -> tuple[datetime, datetime]:
    """Billing period bounds for a cycle.

    ``monthly`` keeps the calendar-month behaviour. ``annual`` runs from the
    first day of the start month for 12 months (end is the last microsecond
    before the same day next year).
    """
    start, end = month_bounds_utc(when)
    if cycle == "monthly":
        return start, end
    if cycle != "annual":
        raise ValueError("cycle must be monthly or annual")
    next_year = start.year + 1
    end = datetime(next_year, start.month, 1, tzinfo=UTC) - timedelta(microseconds=1)
    return start, end


def price_breakdown(
    base_list_idr: int, *, annual: bool, pkp: bool
) -> dict[str, int]:
    """Invoice amounts for a catalog list price.

    Shared by the async create path and the sync beat task so the two can never
    disagree about annual pricing or tax.
    """
    base = int(base_list_idr) * (ANNUAL_MONTHS_PAID if annual else 1)
    if not pkp:
        return {"amount": base, "dpp": base, "ppn": 0, "pph23": 0, "total": base}
    dpp = int(
        (Decimal(base) * Decimal(11) / Decimal(12)).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    ppn = int(
        (Decimal(dpp) * Decimal("0.12")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    pph23 = int(
        (Decimal(base) * Decimal("0.02")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )
    return {"amount": base, "dpp": dpp, "ppn": ppn, "pph23": pph23, "total": base + ppn}
