from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.database import get_db
from app.main import app
from app.models.billing import Subscription
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.schemas.sku_tier import SkuTierUpdate
from app.services.auth import create_access_token, hash_password
from app.services.sku_tier import SkuTierService

NOW = datetime(2026, 1, 1, tzinfo=UTC)

async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}

def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

async def _add_tier(db: AsyncSession, code: str, *, rank: int, **limits: int) -> SkuTier:
    tier = SkuTier(
        code=code,
        label=code.replace("_", " ").title(),
        rank=rank,
        active=True,
        requestable=True,
        limit_scan=limits.get("limit_scan", 5),
        limit_host=limits.get("limit_host", 5),
        limit_uptime=limits.get("limit_uptime", 50),
        limit_guard=limits.get("limit_guard", 5),
    )
    db.add(tier)
    await db.commit()
    return tier

async def _add_org(db: AsyncSession, owner: User, sku: str, *, name: str = "Batch Org") -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        slug=f"batch-{uuid.uuid4().hex[:10]}",
        kind="company",
        sku=sku,
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.flush()
    db.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    await db.commit()
    return org

async def _add_invoice(db: AsyncSession, org: Organization, sku: str) -> OrgInvoice:
    invoice = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number=f"SX-BATCH-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku=sku,
        amount_idr=100_000,
        period_start=NOW,
        period_end=NOW,
        due_date=NOW,
    )
    db.add(invoice)
    await db.commit()
    return invoice

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
async def test_usage_counts_many_counts_every_referencing_table(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "usage-owner@example.com")
    org = await _add_org(db_session, owner, "pro")
    db_session.add(Subscription(id=uuid.uuid4(), organization_id=org.id, sku="pro", status="active"))
    await _add_invoice(db_session, org, "pro")
    db_session.add(
        SubscriptionRequest(
            id=uuid.uuid4(),
            organization_id=org.id,
            direction="upgrade",
            current_sku="basic",
            target_sku="pro",
            status="pending",
        )
    )
    await db_session.commit()

    usage = await SkuTierService(db_session).usage_counts_many(["basic", "pro", "enterprise"])

    assert usage["pro"].orgs == 1
    assert usage["pro"].subscriptions == 1
    assert usage["pro"].invoices == 1
    assert usage["pro"].requests == 1
    assert usage["basic"].requests == 1
    assert usage["basic"].orgs == 0
    assert usage["enterprise"].model_dump() == {
        "orgs": 0,
        "subscriptions": 0,
        "invoices": 0,
        "requests": 0,
        "promos": 0,
    }

@pytest.mark.asyncio
async def test_usage_counts_many_attributes_a_request_to_both_codes(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "both-owner@example.com")
    org = await _add_org(db_session, owner, "basic")
    db_session.add(
        SubscriptionRequest(
            id=uuid.uuid4(),
            organization_id=org.id,
            direction="upgrade",
            current_sku="basic",
            target_sku="pro",
            status="pending",
        )
    )
    await db_session.commit()

    usage = await SkuTierService(db_session).usage_counts_many(["basic", "pro"])

    assert usage["basic"].requests == 1
    assert usage["pro"].requests == 1

@pytest.mark.asyncio
async def test_usage_counts_many_empty_input_skips_the_database(
    db_session: AsyncSession, engine: AsyncEngine
) -> None:
    counter = _StatementCounter()
    event.listen(engine.sync_engine, "before_cursor_execute", counter)
    try:
        usage = await SkuTierService(db_session).usage_counts_many([])
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", counter)

    assert usage == {}
    assert counter.selects == 0

@pytest.mark.asyncio
async def test_admin_list_statement_count_is_constant(
    db_session: AsyncSession, engine: AsyncEngine
) -> None:
    admin = await _make_user(db_session, "batch-admin@example.com", is_admin=True)
    for index in range(8):
        await _add_tier(db_session, f"batch{index}", rank=10 + index)
    _bind(db_session)
    transport = ASGITransport(app=app)
    counter = _StatementCounter()
    event.listen(engine.sync_engine, "before_cursor_execute", counter)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/admin/sku-tiers", headers=_auth(admin))
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", counter)
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert len(response.json()) >= 8
    assert counter.selects <= 20, counter.statements

@pytest.mark.asyncio
async def test_catalog_presence_many_returns_only_codes_with_rows(
    db_session: AsyncSession,
) -> None:
    present = await SkuTierService(db_session).catalog_presence_many(
        ["basic", "pro", "multi", "enterprise"]
    )

    assert present == {"basic", "pro", "multi"}

@pytest.mark.asyncio
async def test_seats_come_from_the_tier_limit_only(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "seat-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "seat-owner@example.com")
    await _add_tier(db_session, "seatfollow", rank=25, limit_scan=7, limit_host=7, limit_uptime=70, limit_guard=7)
    for product in ("scan", "host", "uptime", "guard"):
        db_session.add(
            SkuCatalog(
                product=product,
                sku="seatfollow",
                list_idr=100_000,
                invoicable=True,
                updated_at=NOW,
            )
        )
    await db_session.commit()
    org = await _add_org(db_session, owner, "seatfollow", name="Seat Org")

    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.get(
                f"/api/orgs/{org.id}/subscription", headers=_auth(owner, org.id)
            )
            assert first.status_code == 200, first.text
            first_item = next(
                item
                for item in first.json()["catalog"]
                if item["service"] == "scan" and item["sku"] == "seatfollow"
            )
            assert first_item["seats"] == 7

            await SkuTierService(db_session).update(
                "seatfollow", SkuTierUpdate(limit_scan=11), admin
            )

            second = await client.get(
                f"/api/orgs/{org.id}/subscription", headers=_auth(owner, org.id)
            )
            assert second.status_code == 200, second.text
            second_item = next(
                item
                for item in second.json()["catalog"]
                if item["service"] == "scan" and item["sku"] == "seatfollow"
            )
            assert second_item["seats"] == 11

            admin_catalog = await client.get("/api/admin/sku-catalog", headers=_auth(admin))
            assert admin_catalog.status_code == 200, admin_catalog.text
            admin_item = next(
                item
                for item in admin_catalog.json()["items"]
                if item["product"] == "scan" and item["sku"] == "seatfollow"
            )
            assert admin_item["seats"] == 11
    finally:
        app.dependency_overrides.clear()
