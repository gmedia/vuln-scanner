"""``price_breakdown`` vectors, including the promo discount."""

from __future__ import annotations

from app.services.invoice_math import price_breakdown


def test_discount_zero_preserves_existing_vectors() -> None:
    assert price_breakdown(300_000, annual=False, pkp=False) == {
        "amount": 300_000,
        "discount": 0,
        "dpp": 300_000,
        "ppn": 0,
        "pph23": 0,
        "total": 300_000,
    }
    assert price_breakdown(300_000, annual=True, pkp=False) == {
        "amount": 3_000_000,
        "discount": 0,
        "dpp": 3_000_000,
        "ppn": 0,
        "pph23": 0,
        "total": 3_000_000,
    }

def test_non_pkp_discount_has_zero_pph23() -> None:
    prices = price_breakdown(300_000, annual=False, pkp=False, discount_idr=30_000)
    assert prices["amount"] == 300_000
    assert prices["discount"] == 30_000
    assert prices["dpp"] == 270_000
    assert prices["ppn"] == 0
    assert prices["pph23"] == 0
    assert prices["total"] == 270_000

def test_pkp_discount_computes_tax_from_taxable_base() -> None:
    prices = price_breakdown(300_000, annual=False, pkp=True, discount_idr=30_000)
    assert prices["amount"] == 300_000
    assert prices["discount"] == 30_000
    assert prices["dpp"] == 247_500
    assert prices["ppn"] == 29_700
    assert prices["pph23"] == 5_400
    assert prices["total"] == 299_700

def test_total_invariant_and_discount_clamp() -> None:
    prices = price_breakdown(100_000, annual=False, pkp=True, discount_idr=250_000)
    assert prices["discount"] == 100_000
    assert prices["total"] == prices["amount"] - prices["discount"] + prices["ppn"]
    assert prices["total"] == prices["ppn"]
