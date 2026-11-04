"""Promo discount arithmetic with no web-framework or ORM imports.

Kept beside ``invoice_math`` so the API, the service layer and future workers
share one implementation. All amounts are whole IDR; percent values are basis
points (1/100 of a percent), so 10% is ``1000`` and 100% is ``10000``.
"""

from __future__ import annotations


def discount_for(
    base_idr: int,
    *,
    kind: str,
    percent_off_bp: int | None,
    amount_idr: int | None,
    max_discount_idr: int | None,
) -> int:
    """Discount in IDR for a pre-discount base.

    Percent uses half-up integer rounding: ``(base * bp + 5000) // 10000``.
    A fixed amount is taken as-is. Either form is capped by
    ``max_discount_idr`` and clamped to ``[0, base]``; a discount never makes
    the invoice negative.
    """
    base = max(0, int(base_idr))
    if kind == "percent":
        if percent_off_bp is None or amount_idr is not None:
            raise ValueError("percent promos require percent_off_bp and no amount_idr")
        discount = (base * int(percent_off_bp) + 5000) // 10000
    elif kind == "fixed":
        if amount_idr is None or percent_off_bp is not None:
            raise ValueError("fixed promos require amount_idr and no percent_off_bp")
        discount = int(amount_idr)
    else:
        raise ValueError(f"unknown promo kind: {kind!r}")

    if max_discount_idr is not None:
        discount = min(discount, int(max_discount_idr))
    return max(0, min(discount, base))

__all__ = ["discount_for"]
