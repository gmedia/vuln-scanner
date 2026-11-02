from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import event, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.invoice import SkuCatalog
from app.models.organization import Organization
from app.models.sku_tier import SkuTier

EXPECTED_TIERS: dict[str, dict[str, object]] = {
    "basic": {
        "label": "Basic",
        "rank": 1,
        "active": True,
        "requestable": True,
        "sales_led": False,
        "is_default": True,
        "bundle_idr": 450_000,
        "limit_scan": 1,
        "limit_host": 1,
        "limit_uptime": 10,
        "limit_guard": 1,
        "allow_status_page": False,
        "allow_custom_host": False,
        "allow_waf_protect": False,
        "allow_siem": False,
        "billing_unrestricted": False,
        "workspace_editor_limit": 1,
        "workspace_viewer_limit": 1,
    },
    "pro": {
        "label": "Pro",
        "rank": 2,
        "active": True,
        "requestable": True,
        "sales_led": False,
        "is_default": False,
        "bundle_idr": 1_000_000,
        "limit_scan": 3,
        "limit_host": 3,
        "limit_uptime": 50,
        "limit_guard": 3,
        "allow_status_page": True,
        "allow_custom_host": False,
        "allow_waf_protect": True,
        "allow_siem": False,
        "billing_unrestricted": False,
        "workspace_editor_limit": None,
        "workspace_viewer_limit": None,
    },
    "multi": {
        "label": "Multi",
        "rank": 3,
        "active": True,
        "requestable": True,
        "sales_led": False,
        "is_default": False,
        "bundle_idr": 2_900_000,
        "limit_scan": 10,
        "limit_host": 10,
        "limit_uptime": 200,
        "limit_guard": 10,
        "allow_status_page": True,
        "allow_custom_host": True,
        "allow_waf_protect": True,
        "allow_siem": False,
        "billing_unrestricted": False,
        "workspace_editor_limit": None,
        "workspace_viewer_limit": None,
    },
    "enterprise": {
        "label": "Enterprise",
        "rank": 4,
        "active": True,
        "requestable": False,
        "sales_led": True,
        "is_default": False,
        "bundle_idr": None,
        "limit_scan": 10,
        "limit_host": 10,
        "limit_uptime": 200,
        "limit_guard": 10,
        "allow_status_page": True,
        "allow_custom_host": True,
        "allow_waf_protect": True,
        "allow_siem": True,
        "billing_unrestricted": True,
        "workspace_editor_limit": None,
        "workspace_viewer_limit": None,
    },
}


@pytest_asyncio.fixture
async def engine():
    """SQLite enforces no FK unless asked, so turn it on for this module."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    @event.listens_for(test_engine.sync_engine, "connect")
    def _enable_sqlite_fks(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    yield test_engine
    await test_engine.dispose()


def _new_tier(**overrides: object) -> SkuTier:
    values: dict[str, object] = {
        "code": "pro_plus",
        "label": "Pro+",
        "rank": 5,
        "active": True,
        "requestable": True,
        "sales_led": False,
        "is_default": False,
        "bundle_idr": None,
        "limit_scan": 5,
        "limit_host": 5,
        "limit_uptime": 100,
        "limit_guard": 5,
        "allow_status_page": True,
        "allow_custom_host": False,
        "allow_waf_protect": True,
        "allow_siem": False,
        "billing_unrestricted": False,
        "workspace_editor_limit": None,
        "workspace_viewer_limit": None,
    }
    values.update(overrides)
    return SkuTier(**values)


def _new_org(sku: str) -> Organization:
    return Organization(
        id=uuid.uuid4(),
        name="tier-test",
        slug=f"tier-test-{uuid.uuid4().hex[:8]}",
        kind="personal",
        sku=sku,
    )


@pytest.mark.asyncio
async def test_seed_matches_owner_locked_values(db_session) -> None:
    rows = (await db_session.execute(select(SkuTier).order_by(SkuTier.rank))).scalars().all()

    assert [row.code for row in rows] == list(EXPECTED_TIERS)
    for row in rows:
        for field, expected in EXPECTED_TIERS[row.code].items():
            assert getattr(row, field) == expected, f"{row.code}.{field}"


@pytest.mark.asyncio
async def test_only_one_default_tier_allowed(db_session) -> None:
    count = await db_session.scalar(select(func.count()).select_from(SkuTier).where(SkuTier.is_default))
    assert count == 1

    db_session.add(_new_tier(is_default=True))
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unknown_tier_code_is_rejected_by_fk(db_session) -> None:
    db_session.add(_new_org("ghost_tier"))
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_restrict_blocks_deleting_a_used_tier(db_session) -> None:
    db_session.add(_new_org("basic"))
    await db_session.flush()

    tier = await db_session.get(SkuTier, "basic")
    assert tier is not None
    await db_session.delete(tier)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_cascade_deletes_catalog_rows(db_session) -> None:
    before = await db_session.scalar(select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "pro"))
    assert before == 4

    tier = await db_session.get(SkuTier, "pro")
    assert tier is not None
    await db_session.delete(tier)
    await db_session.flush()

    after = await db_session.scalar(select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "pro"))
    assert after == 0
