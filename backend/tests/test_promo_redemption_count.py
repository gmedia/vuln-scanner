"""Admin promo list/detail expose applied redemption usage.

``promo_redemptions.status`` is ``applied|released``; only applied rows consume
quota, so a voided invoice must show up as zero used. The list path must stay a
constant number of queries instead of one count per row.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization
from app.models.user import User
from app.schemas.promo import PromoCodeCreate
from app.services.auth import create_access_token, hash_password
from app.services.invoice import InvoiceService
from app.services.promo import PromoService


def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}

async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=True,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def _make_org(db: AsyncSession, owner: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=f"Count Org {uuid.uuid4().hex[:6]}",
        slug=f"count-org-{uuid.uuid4().hex[:8]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org

def _body(code: str, **overrides: Any) -> PromoCodeCreate:
    values: dict[str, Any] = {
        "code": code,
        "description": "Count test",
        "kind": "percent",
        "percent_off_bp": 1000,
        "amount_idr": None,
        "min_amount_idr": 0,
        "max_discount_idr": None,
        "applies_to_sku": None,
        "applies_to_product": None,
        "starts_at": None,
        "ends_at": None,
        "max_redemptions": None,
        "max_redemptions_per_org": 1,
    }
    values.update(overrides)
    return PromoCodeCreate(**values)

class _StatementCounter:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __call__(
        self,
        conn: object,
        cursor: object,
        statement: str,
        parameters: object,
        context: object,
        executemany: bool,
    ) -> None:
        self.statements.append(statement)

    @property
    def selects(self) -> int:
        return sum(1 for stmt in self.statements if stmt.lstrip().upper().startswith("SELECT"))

@pytest.mark.asyncio
async def test_list_and_get_return_applied_redemption_counts(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-count@example.com")
    orgs = [await _make_org(db_session, admin) for _ in range(3)]
    service = PromoService(db_session)
    await service.create(_body("UNUSED2026"), admin)
    used = await service.create(
        _body("USED2026", max_redemptions=5, max_redemptions_per_org=5), admin
    )
    released = await service.create(_body("RELEASED2026"), admin)

    invoices = InvoiceService(db_session)
    for org in orgs[:2]:
        await invoices.create_invoice(
            organization_id=org.id,
            sku="basic",
            actor=admin,
            promo_code=used.code,
        )
    voided = await invoices.create_invoice(
        organization_id=orgs[2].id,
        sku="basic",
        actor=admin,
        promo_code=released.code,
    )
    await invoices.void(voided.id)

    _bind(db_session)
    transport = ASGITransport(app=app)
    headers = _auth(admin)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            listing = await client.get("/api/admin/promo-codes", headers=headers)
            assert listing.status_code == 200, listing.text
            by_code = {item["code"]: item for item in listing.json()["items"]}
            assert by_code["UNUSED2026"]["redemption_count"] == 0
            assert by_code["USED2026"]["redemption_count"] == 2
            assert by_code["RELEASED2026"]["redemption_count"] == 0

            used_detail = await client.get(
                f"/api/admin/promo-codes/{used.id}", headers=headers
            )
            assert used_detail.status_code == 200, used_detail.text
            assert used_detail.json()["redemption_count"] == 2

            released_detail = await client.get(
                f"/api/admin/promo-codes/{released.id}", headers=headers
            )
            assert released_detail.status_code == 200, released_detail.text
            assert released_detail.json()["redemption_count"] == 0
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_list_uses_one_grouped_count_query(
    db_session: AsyncSession, engine: AsyncEngine
) -> None:
    admin = await _make_user(db_session, "promo-count-query@example.com")
    service = PromoService(db_session)
    for index in range(6):
        await service.create(_body(f"BATCH{index}PROMO"), admin)

    counter = _StatementCounter()
    event.listen(engine.sync_engine, "before_cursor_execute", counter)
    try:
        rows, total = await service.list(page=1, page_size=20)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", counter)

    assert total == 6
    assert len(rows) == 6
    assert all(count == 0 for _, count in rows)
    assert counter.selects <= 4, counter.statements
    assert any("GROUP BY" in stmt.upper() for stmt in counter.statements)
