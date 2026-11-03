from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.invoice import SkuCatalog
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org

TIER_CODE = "pro_plus"
TIER_LABEL = "Pro+"


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
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_tier(db: AsyncSession, *, active: bool = True, rank: int = 5) -> SkuTier:
    tier = SkuTier(
        code=TIER_CODE,
        label=TIER_LABEL,
        rank=rank,
        active=active,
        requestable=True,
        is_default=False,
        limit_scan=5,
        limit_host=5,
        limit_uptime=75,
        limit_guard=5,
    )
    db.add(tier)
    await db.flush()
    for product in ("scan", "host", "uptime", "guard"):
        db.add(
            SkuCatalog(
                product=product,
                sku=TIER_CODE,
                list_idr=1_000_000,
                invoicable=True,
            )
        )
    await db.commit()
    return tier


def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "tier-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "tier-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Tier Org",
        slug=f"tier-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    for member, role in ((owner, "owner"), (admin, "admin")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=member.id,
                role=role,
            )
        )
    await db_session.commit()
    await db_session.refresh(org)
    yield {"admin": admin, "owner": owner, "org": org}
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_can_request_a_custom_tier(db_session: AsyncSession, ctx) -> None:
    await _make_tier(db_session)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": TIER_CODE, "cycle": "monthly"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    body = response.json()
    assert body["target_sku"] == TIER_CODE
    assert body["direction"] == "upgrade"


@pytest.mark.asyncio
async def test_admin_can_assign_a_custom_tier(db_session: AsyncSession, ctx) -> None:
    await _make_tier(db_session)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/orgs/{ctx['org'].id}",
                headers=_auth(ctx["admin"], ctx["org"].id),
                json={"sku": TIER_CODE},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["sku"] == TIER_CODE
    assert body["sku_label"] == TIER_LABEL
    assert body["sku_features"]["requestable"] is True


@pytest.mark.asyncio
async def test_retired_tier_is_still_rejected(db_session: AsyncSession, ctx) -> None:
    await _make_tier(db_session, active=False)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": TIER_CODE},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "not available" in response.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_tier_is_rejected_on_assign(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/orgs/{ctx['org'].id}",
                headers=_auth(ctx["admin"], ctx["org"].id),
                json={"sku": "does_not_exist"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_malformed_tier_code_is_rejected_by_schema(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "Pro Plus"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_org_list_filters_by_tier(db_session: AsyncSession, ctx) -> None:
    other = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"other-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku=TIER_CODE,
        created_by_user_id=ctx["owner"].id,
    )
    db_session.add(other)
    await db_session.commit()
    await _make_tier(db_session)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            filtered = await client.get(
                "/api/admin/orgs",
                headers=_auth(ctx["admin"], ctx["org"].id),
                params={"sku": TIER_CODE},
            )
            everything = await client.get(
                "/api/admin/orgs",
                headers=_auth(ctx["admin"], ctx["org"].id),
            )
    finally:
        app.dependency_overrides.clear()

    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert [item["slug"] for item in body["items"]] == [other.slug]
    assert everything.json()["total"] >= 2


@pytest.mark.asyncio
async def test_admin_org_list_unknown_tier_returns_empty(
    db_session: AsyncSession, ctx
) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/admin/orgs",
                headers=_auth(ctx["admin"], ctx["org"].id),
                params={"sku": "ghost_tier"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}
