"""Promo discount arithmetic vectors."""

from __future__ import annotations

import pytest

from app.services.promo_math import discount_for


def test_percent_uses_half_up_rounding() -> None:
    # 333 * 1000bp = 33.3 -> 33; 335 * 1000bp = 33.5 -> 34
    assert (
        discount_for(
            333, kind="percent", percent_off_bp=1000, amount_idr=None, max_discount_idr=None
        )
        == 33
    )
    assert (
        discount_for(
            335, kind="percent", percent_off_bp=1000, amount_idr=None, max_discount_idr=None
        )
        == 34
    )

def test_one_basis_point() -> None:
    assert (
        discount_for(
            1_000_000,
            kind="percent",
            percent_off_bp=1,
            amount_idr=None,
            max_discount_idr=None,
        )
        == 100
    )

def test_full_percent_is_one_hundred_percent() -> None:
    assert (
        discount_for(
            300_000,
            kind="percent",
            percent_off_bp=10000,
            amount_idr=None,
            max_discount_idr=None,
        )
        == 300_000
    )

def test_fixed_amount() -> None:
    assert (
        discount_for(
            300_000, kind="fixed", percent_off_bp=None, amount_idr=75_000, max_discount_idr=None
        )
        == 75_000
    )

def test_cap_applies_after_percent() -> None:
    assert (
        discount_for(
            1_000_000,
            kind="percent",
            percent_off_bp=5000,
            amount_idr=None,
            max_discount_idr=100_000,
        )
        == 100_000
    )

def test_clamps_above_base_and_never_negative() -> None:
    assert (
        discount_for(
            100_000, kind="fixed", percent_off_bp=None, amount_idr=250_000, max_discount_idr=None
        )
        == 100_000
    )
    assert (
        discount_for(
            0, kind="percent", percent_off_bp=1000, amount_idr=None, max_discount_idr=None
        )
        == 0
    )

@pytest.mark.parametrize(
    ("kind", "percent", "amount"),
    [
        ("percent", None, 1000),
        ("percent", 1000, 1000),
        ("fixed", 1000, None),
        ("fixed", None, None),
        ("bogus", 1000, None),
    ],
)
def test_invalid_kind_shape_raises(
    kind: str, percent: int | None, amount: int | None
) -> None:
    with pytest.raises(ValueError):
        discount_for(
            100_000,
            kind=kind,
            percent_off_bp=percent,
            amount_idr=amount,
            max_discount_idr=None,
        )
