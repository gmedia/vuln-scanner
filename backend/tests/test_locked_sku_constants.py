"""Locked commercial constants must not silently drift from the owner-locked docs.

Numbers locked 2026-10-12 in docs/commercial/pricing-architecture-v1.md (§2 caps, §4 list prices).
These are CODE constants (not a markdown parser): if someone changes a cap or price, this fails.
"""

from app.models.asset import ASSET_SKU_LIMITS
from app.models.guard import GUARD_SKU_LIMITS
from app.models.host_protect import HOST_SITE_SKU_LIMITS
from app.models.invoice import HOST_SKU_LIST_IDR, SCAN_SKU_LIST_IDR, SCAN_SKU_SEATS
from app.models.uptime import UPTIME_SKU_LIMITS


def test_scan_host_guard_caps_are_1_3_10() -> None:
    expected = {"basic": 1, "pro": 3, "multi": 10}
    assert expected == ASSET_SKU_LIMITS
    assert expected == HOST_SITE_SKU_LIMITS
    assert expected == SCAN_SKU_SEATS
    assert expected == GUARD_SKU_LIMITS


def test_uptime_caps_are_the_locked_exception_10_50_200() -> None:
    # Uptime is deliberately NOT 1/3/10: a monitor is a much cheaper unit.
    assert UPTIME_SKU_LIMITS == {"basic": 10, "pro": 50, "multi": 200}


def test_scan_list_prices_match_locked_doc() -> None:
    assert SCAN_SKU_LIST_IDR == {"basic": 300_000, "pro": 650_000, "multi": 2_000_000}


def test_host_list_prices_match_locked_doc() -> None:
    assert HOST_SKU_LIST_IDR == {"basic": 150_000, "pro": 350_000, "multi": 900_000}


def test_uptime_and_guard_list_prices_match_locked_doc() -> None:
    # Locked 2026-10-12 in docs/commercial/pricing-architecture-v1.md §4.
    from app.models.invoice import GUARD_SKU_LIST_IDR, UPTIME_SKU_LIST_IDR

    assert UPTIME_SKU_LIST_IDR == {"basic": 75_000, "pro": 200_000, "multi": 500_000}
    assert GUARD_SKU_LIST_IDR == {"basic": 100_000, "pro": 250_000, "multi": 600_000}


def test_hpp_keys_cover_all_four_services() -> None:
    from app.models.hpp import HPP_KEYS

    assert HPP_KEYS == (
        "ip",
        "domain",
        "apk",
        "ipa",
        "statushost",
        "hostscan",
        "uptimecheck",
        "guardagent",
    )
