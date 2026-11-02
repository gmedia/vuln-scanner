"""Service and read-only endpoint tests for ``sku_tiers`` (PR B1)."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.schemas.sku_tier import SkuTierFeatures, SkuTierWorkspaceLimits
from app.services.auth import create_access_token, hash_password
from app.services.organization import OrganizationService, ensure_personal_org
from app.services.sku_tier import SkuTierService
from app.services.subscription import SubscriptionService


def _tier(code: str, rank: int, **overrides: object) -> SkuTier:
    values: dict[str, object] = {
        "code": code,
        "label": code.replace("_", " ").title(),
        "rank": rank,
        "active": True,
        "requestable": True,
        "sales_led": False,
        "is_default": False,
        "bundle_idr": None,
        "limit_scan": 1,
        "limit_host": 1,
        "limit_uptime": 1,
        "limit_guard": 1,
        "allow_status_page": False,
        "allow_custom_host": False,
        "allow_waf_protect": False,
        "allow_siem": False,
        "billing_unrestricted": False,
        "workspace_editor_limit": None,
        "workspace_viewer_limit": None,
    }
    values.update(overrides)
    return SkuTier(**values)

async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=100,
    )
    db.add(user)
    await db.flush()
    return user

async def _make_org(db: AsyncSession, owner: User, *, sku: str = "basic") -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Tier Org",
        slug=f"tier-org-{uuid.uuid4().hex[:6]}",
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

def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}

def _bind_db(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

@pytest.mark.asyncio
async def test_service_list_get_and_inactive(db_session: AsyncSession) -> None:
    service = SkuTierService(db_session)
    assert [tier.code for tier in await service.list()] == ["basic", "pro", "multi", "enterprise"]

    pro = await db_session.get(SkuTier, "pro")
    assert pro is not None
    pro.active = False
    await db_session.commit()

    assert [tier.code for tier in await service.list()] == ["basic", "multi", "enterprise"]
    assert [tier.code for tier in await service.list(include_inactive=True)] == [
        "basic",
        "pro",
        "multi",
        "enterprise",
    ]
    assert (await service.get("pro")).active is False
    with pytest.raises(HTTPException) as inactive:
        await service.get_active("pro")
    assert inactive.value.status_code == 400

@pytest.mark.asyncio
async def test_service_unknown_tier_is_404(db_session: AsyncSession) -> None:
    service = SkuTierService(db_session)
    for getter in (service.get, service.get_active):
        with pytest.raises(HTTPException) as missing:
            await getter("does_not_exist")
        assert missing.value.status_code == 404

@pytest.mark.asyncio
async def test_service_limits_features_workspace_and_label(db_session: AsyncSession) -> None:
    service = SkuTierService(db_session)

    assert await service.limits("multi") == {"scan": 10, "host": 10, "uptime": 200, "guard": 10}
    assert await service.product_limit("pro", "host") == 3

    enterprise = await service.features("enterprise")
    assert enterprise.sales_led is True
    assert enterprise.allow_siem is True
    assert enterprise.billing_unrestricted is True
    assert enterprise.requestable is False

    assert await service.workspace_limits("basic") == (1, 1)
    assert await service.workspace_limits("pro") == (None, None)
    assert await service.label("pro") == "Pro"

@pytest.mark.asyncio
async def test_service_reads_mutated_tier_rows(db_session: AsyncSession) -> None:
    """Changing the row must change the service result (no Python constants)."""
    service = SkuTierService(db_session)
    tier = await db_session.get(SkuTier, "multi")
    assert tier is not None
    tier.limit_scan = 42
    tier.limit_host = 7
    tier.limit_uptime = 99
    tier.limit_guard = 5
    tier.workspace_editor_limit = 4
    tier.workspace_viewer_limit = 8
    tier.allow_waf_protect = False
    await db_session.commit()

    assert await service.limits("multi") == {"scan": 42, "host": 7, "uptime": 99, "guard": 5}
    assert await service.workspace_limits("multi") == (4, 8)
    assert (await service.features("multi")).allow_waf_protect is False

@pytest.mark.asyncio
async def test_service_default_and_missing_default(db_session: AsyncSession) -> None:
    service = SkuTierService(db_session)
    assert (await service.default()).code == "basic"

    basic = await db_session.get(SkuTier, "basic")
    assert basic is not None
    basic.is_default = False
    await db_session.commit()
    with pytest.raises(HTTPException) as missing:
        await service.default()
    assert missing.value.status_code == 500
    assert "default SKU tier" in missing.value.detail

@pytest.mark.asyncio
async def test_endpoint_active_only_and_current_inactive(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "tiers-owner@example.com")
    org = await _make_org(db_session, owner)
    pro = await db_session.get(SkuTier, "pro")
    assert pro is not None
    pro.active = False
    await db_session.commit()

    _bind_db(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            fresh = await client.get("/api/sku-tiers", headers=_auth(owner, org.id))
            assert fresh.status_code == 200, fresh.text
            codes = [item["code"] for item in fresh.json()]
            assert codes == ["basic", "multi", "enterprise"]
            basic = fresh.json()[0]
            assert basic["label"] == "Basic"
            assert basic["limits"] == {"scan": 1, "host": 1, "uptime": 10, "guard": 1}
            assert basic["features"]["allow_status_page"] is False
            assert basic["workspace_limits"] == {"editor": 1, "viewer": 1}

            org.sku = "pro"
            await db_session.commit()
            retained = await client.get("/api/sku-tiers", headers=_auth(owner, org.id))
            assert retained.status_code == 200, retained.text
            by_code = {item["code"]: item for item in retained.json()}
            assert by_code["pro"]["active"] is False
            assert by_code["pro"]["label"] == "Pro"
            assert set(by_code) == {"basic", "pro", "multi", "enterprise"}
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_org_summary_exposes_tier_metadata(db_session: AsyncSession) -> None:
    user = await _make_user(db_session, "summary-owner@example.com")
    await ensure_personal_org(db_session, user)
    await db_session.commit()

    items = await OrganizationService(db_session).list_my_orgs(user)
    assert len(items) == 1
    item = items[0]
    assert item["sku"] == "basic"
    assert item["sku_label"] == "Basic"
    features = item["sku_features"]
    workspace = item["workspace_seats_limits"]
    assert isinstance(features, SkuTierFeatures)
    assert features.allow_status_page is False
    assert isinstance(workspace, SkuTierWorkspaceLimits)
    assert workspace.editor == 1

    org_id = item["id"]
    assert isinstance(org_id, uuid.UUID)
    _bind_db(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            me = await client.get("/api/auth/me", headers=_auth(user, org_id))
            assert me.status_code == 200, me.text
            summary = me.json()["organizations"][0]
            assert summary["sku_label"] == "Basic"
            assert summary["sku_features"]["allow_status_page"] is False
            assert summary["workspace_seats_limits"] == {"editor": 1, "viewer": 1}
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_new_org_uses_default_tier(db_session: AsyncSession) -> None:
    basic = await db_session.get(SkuTier, "basic")
    pro = await db_session.get(SkuTier, "pro")
    assert basic is not None and pro is not None
    basic.is_default = False
    pro.is_default = True
    await db_session.commit()

    user = await _make_user(db_session, "default-tier@example.com")
    org = await ensure_personal_org(db_session, user)
    await db_session.commit()
    assert org.sku == "pro"

@pytest.mark.asyncio
async def test_workspace_seat_cap_reads_custom_tier(db_session: AsyncSession) -> None:
    db_session.add(_tier("tight", 10, workspace_editor_limit=1, workspace_viewer_limit=1))
    await db_session.flush()
    owner = await _make_user(db_session, "tight-owner@example.com")
    org = await _make_org(db_session, owner, sku="tight")
    service = OrganizationService(db_session)

    with pytest.raises(HTTPException) as blocked:
        await service.create_invite(org.id, owner, email="tight-admin@example.com", role="admin")
    assert blocked.value.status_code == 403
    assert "Tight workspace allows 1 editor and 1 viewer" in blocked.value.detail

    viewer = await _make_user(db_session, "tight-viewer@example.com")
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=viewer.id,
            role="viewer",
        )
    )
    await db_session.commit()
    with pytest.raises(HTTPException) as promotion:
        await service.change_role(org.id, owner, viewer.id, "member")
    assert promotion.value.status_code == 403

@pytest.mark.asyncio
async def test_workspace_seat_cap_unlimited_tier(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "pro-owner@example.com")
    org = await _make_org(db_session, owner, sku="pro")
    service = OrganizationService(db_session)

    for index, role in enumerate(("admin", "member", "viewer", "viewer", "admin")):
        invite, _ = await service.create_invite(
            org.id,
            owner,
            email=f"pro-unlimited-{index}@example.com",
            role=role,
        )
        assert invite.role == role

@pytest.mark.asyncio
async def test_create_request_requires_active_and_requestable_target(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "req-owner@example.com")
    org = await _make_org(db_session, owner)
    service = SubscriptionService(db_session)

    multi = await db_session.get(SkuTier, "multi")
    assert multi is not None
    multi.requestable = False
    await db_session.commit()
    with pytest.raises(HTTPException) as not_requestable:
        await service.create_request(org, owner, target_sku="multi", cycle="monthly", note="")
    assert not_requestable.value.status_code == 400
    assert "not available" in not_requestable.value.detail

    multi.requestable = True
    pro = await db_session.get(SkuTier, "pro")
    assert pro is not None
    pro.active = False
    await db_session.commit()
    with pytest.raises(HTTPException) as inactive:
        await service.create_request(org, owner, target_sku="pro", cycle="monthly", note="")
    assert inactive.value.status_code == 400
    assert "not available" in inactive.value.detail

@pytest.mark.asyncio
async def test_create_request_allows_grandfathered_inactive_current(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "grandfather-owner@example.com")
    org = await _make_org(db_session, owner, sku="pro")
    pro = await db_session.get(SkuTier, "pro")
    assert pro is not None
    pro.active = False
    await db_session.commit()

    item = await SubscriptionService(db_session).create_request(
        org,
        owner,
        target_sku="multi",
        cycle="monthly",
        note="grandfathered",
    )
    assert item.current_sku == "pro"
    assert item.target_sku == "multi"
    assert item.direction == "upgrade"

@pytest.mark.asyncio
async def test_downgrade_checks_target_workspace_limits(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "down-owner@example.com")
    org = await _make_org(db_session, owner, sku="multi")
    second = await _make_user(db_session, "down-admin@example.com")
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=second.id,
            role="admin",
        )
    )
    await db_session.commit()

    with pytest.raises(HTTPException) as blocked:
        await SubscriptionService(db_session).create_request(
            org,
            owner,
            target_sku="basic",
            cycle="monthly",
            note="",
        )
    assert blocked.value.status_code == 400
    assert "Basic workspace allows 1 editor and 1 viewer" in blocked.value.detail
