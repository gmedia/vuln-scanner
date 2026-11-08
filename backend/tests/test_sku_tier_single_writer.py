"""Single-writer guard and behaviour tests for ``sku_catalog`` prices (issue #1326).

HPP margin revenue is ``sku_catalog.list_idr × counts``, so a second writer of
``list_idr`` / ``invoicable`` silently corrupts reported margin. The guard test
fails when another module starts writing the row; the behaviour tests lock the
one allowed writer, ``SkuTierService.update_catalog_price``.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sku_tier_history import SkuTierHistory
from app.services.sku_tier import SkuTierService

_APP_ROOT = Path(__file__).resolve().parents[1] / "app"


async def _price_history(db: AsyncSession, sku: str) -> list[SkuTierHistory]:
    result = await db.execute(
        select(SkuTierHistory)
        .where(SkuTierHistory.sku_code == sku, SkuTierHistory.action == "price_updated")
        .order_by(SkuTierHistory.created_at.asc())
    )
    return list(result.scalars().all())


def test_sku_catalog_has_a_single_writer() -> None:
    skip = {
        # The one allowed writer.
        _APP_ROOT / "services" / "sku_tier.py",
        # ``class SkuCatalog(Base)`` is the table definition, not a row write
        # (the class declaration itself matches the ``SkuCatalog(`` pattern).
        _APP_ROOT / "models" / "invoice.py",
    }
    writes = (
        re.compile(r"\bSkuCatalog\("),
        # Only an attribute assignment mutates the column. Local bindings such
        # as ``list_idr = await db.scalar(...)`` (admin_promo_routes,
        # subscription_routes) and keyword arguments such as
        # ``list_idr=row.list_idr`` only read it, so they are not flagged.
        re.compile(r"\.list_idr\s*=(?!=)"),
    )
    offenders: list[str] = []
    for path in sorted(_APP_ROOT.rglob("*.py")):
        if path in skip:
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if any(pattern.search(line) for pattern in writes):
                offenders.append(f"{path.relative_to(_APP_ROOT)}:{lineno}: {line.strip()}")
    assert offenders == [], "sku_catalog prices must only be written by sku_tier.py:\n" + "\n".join(offenders)


@pytest.mark.asyncio
async def test_update_catalog_price_records_price_and_invoicable_changes(db_session: AsyncSession) -> None:
    actor_id = uuid.uuid4()

    row = await SkuTierService(db_session).update_catalog_price("scan", "pro", 700_000, False, actor_id)

    assert row.list_idr == 700_000
    assert row.invoicable is False
    assert row.updated_by == actor_id
    rows = await _price_history(db_session, "pro")
    assert len(rows) == 1
    assert rows[0].actor_user_id == actor_id
    assert rows[0].changes == {
        "price.scan.list_idr": {"from": 650_000, "to": 700_000},
        "price.scan.invoicable": {"from": True, "to": False},
    }


@pytest.mark.asyncio
async def test_update_catalog_price_writes_no_history_when_nothing_changes(db_session: AsyncSession) -> None:
    row = await SkuTierService(db_session).update_catalog_price("scan", "pro", 650_000, None, uuid.uuid4())

    assert row.list_idr == 650_000
    assert row.invoicable is True
    assert await _price_history(db_session, "pro") == []


@pytest.mark.asyncio
async def test_update_catalog_price_missing_row_is_404(db_session: AsyncSession) -> None:
    with pytest.raises(HTTPException) as missing:
        await SkuTierService(db_session).update_catalog_price("scan", "nope", 100_000, None, None)

    assert missing.value.status_code == 404
    assert missing.value.detail == "Catalog row not found"
