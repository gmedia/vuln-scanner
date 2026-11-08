from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.asset import ScanAsset
from app.models.billing import Subscription
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.sku_tier_history import SkuTierHistory
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.invoice_math import as_utc, period_bounds_utc
from app.services.organization import ensure_personal_org


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
    admin = await _make_user(db_session, "sub-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "sub-owner@example.com")
    viewer = await _make_user(db_session, "sub-viewer@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Subscription Org",
        slug=f"sub-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    for user, role in ((owner, "owner"), (viewer, "viewer")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role=role,
            )
        )
    await db_session.commit()
    return {"admin": admin, "owner": owner, "viewer": viewer, "org": org}


@pytest.mark.asyncio
async def test_overview_returns_plan_usage_and_catalog(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert r.status_code == 200
            body = r.json()
            assert body["plan"]["sku"] == "basic"
            assert body["plan"]["status"] == "unbilled"
            assert body["plan"]["source"] == "default"
            assert body["usage"][0]["product"] == "scan"
            assert body["usage"][0]["limit"] == 1
            assert body["workspace_seats"]["editor_limit"] == 1
            assert len(body["catalog"]) == 12
            assert len(body["bundles"]) == 3
            assert body["annual"] == {"months_paid": 10, "months_served": 12}
            assert body["capabilities"]["can_manage"] is True
            assert body["capabilities"]["can_self_serve"] is False
            assert body["pending_request"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_plan_source_and_label_come_from_tier(db_session, ctx):
    basic = await db_session.get(SkuTier, "basic")
    pro = await db_session.get(SkuTier, "pro")
    assert basic is not None and pro is not None
    basic.is_default = False
    pro.is_default = True
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert response.status_code == 200, response.text
            plan = response.json()["plan"]
            # Basic is no longer the default tier, so the fallback source is ops.
            assert plan["source"] == "ops"
            assert plan["label"] == "Sinexis Secure — Basic"
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_viewer_cannot_request_plan_change(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["viewer"], ctx["org"].id),
                json={"target_sku": "pro", "cycle": "monthly"},
            )
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_can_request_upgrade_and_duplicate_is_rejected(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "pro", "cycle": "annual", "note": "Need 3 assets"},
            )
            assert first.status_code == 201
            body = first.json()
            assert body["direction"] == "upgrade"
            assert body["current_sku"] == "basic"
            assert body["target_sku"] == "pro"
            assert body["cycle"] == "annual"
            assert body["status"] == "pending"

            second = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "multi"},
            )
            assert second.status_code == 409

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert overview.json()["pending_request"]["target_sku"] == "pro"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_downgrade_blocked_when_usage_exceeds_target(db_session, ctx):
    ctx["org"].sku = "multi"
    for i in range(2):
        db_session.add(
            ScanAsset(
                id=uuid.uuid4(),
                organization_id=ctx["org"].id,
                name=f"asset-{i}",
                scan_type="domain",
                target=f"example{i}.test",
                created_by=ctx["owner"].id,
            )
        )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "basic"},
            )
            assert r.status_code == 400
            assert "Scan usage is 2" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_paid_scan_invoice_makes_plan_active(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert created.status_code == 201
            invoice_id = created.json()["id"]
            paid = await client.post(
                f"/api/admin/invoices/{invoice_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-SUB-1"},
            )
            assert paid.status_code == 200

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            body = overview.json()
            assert body["plan"]["status"] == "active"
            assert body["plan"]["source"] == "subscription"
            assert body["plan"]["amount_idr"] == 650_000
            assert body["plan"]["invoice_number"].startswith("SX-")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_can_cancel_pending_request(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "pro"},
            )
            request_id = created.json()["id"]
            canceled = await client.delete(
                f"/api/orgs/{ctx['org'].id}/subscription/requests/{request_id}",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert canceled.status_code == 204
            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert overview.json()["pending_request"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_lists_and_approves_request(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "multi", "note": "10 assets"},
            )
            request_id = created.json()["id"]

            listed = await client.get(
                "/api/admin/subscription-requests?status=pending",
                headers=_auth(ctx["admin"]),
            )
            assert listed.status_code == 200
            items = listed.json()["items"]
            assert any(item["id"] == request_id for item in items)
            assert items[0]["organization_name"] == "Subscription Org"

            approved = await client.post(
                f"/api/admin/subscription-requests/{request_id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": "Invoice issued"},
            )
            assert approved.status_code == 200
            assert approved.json()["status"] == "approved"
            assert approved.json()["resolution_note"] == "Invoice issued"

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert overview.json()["pending_request"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_non_admin_cannot_list_subscription_requests(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                "/api/admin/subscription-requests",
                headers=_auth(ctx["owner"]),
            )
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_enterprise_is_quote_only(db_session, ctx):
    ctx["org"].sku = "enterprise"
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert overview.json()["plan"]["status"] == "enterprise"
            assert overview.json()["plan"]["source"] == "custom"
            assert overview.json()["plan"]["label"] == "Sinexis Secure — Enterprise"
            # Enterprise keeps the effective 10/10/200/10 cap from the seed.
            assert overview.json()["usage"][0]["limit"] == 10

            r = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "enterprise"},
            )
            assert r.status_code == 400
            assert "not available" in r.json()["detail"]

            downgrade = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "multi"},
            )
            assert downgrade.status_code == 201
            assert downgrade.json()["current_sku"] == "enterprise"
            assert downgrade.json()["direction"] == "downgrade"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_subscription_row_overrides_invoice_status(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            invoice_id = created.json()["id"]
            paid = await client.post(
                f"/api/admin/invoices/{invoice_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-SUB-STATE-1"},
            )
            assert paid.status_code == 200

            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            sub.status = "past_due"
            sub.cancel_at_period_end = True
            await db_session.commit()

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            plan = overview.json()["plan"]
            assert plan["source"] == "subscription"
            assert plan["status"] == "pending_payment"
            assert plan["cancel_at_period_end"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_canceled_subscription_shows_expired(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            invoice_id = created.json()["id"]
            await client.post(
                f"/api/admin/invoices/{invoice_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-SUB-STATE-2"},
            )
            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            sub.status = "canceled"
            await db_session.commit()

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            plan = overview.json()["plan"]
            assert plan["source"] == "subscription"
            assert plan["status"] == "expired"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_subscription_period_wins_over_invoice_period(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            invoice_id = created.json()["id"]
            await client.post(
                f"/api/admin/invoices/{invoice_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-SUB-STATE-3"},
            )
            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            sub.cycle = "annual"
            sub.current_period_start = datetime(2026, 1, 1, tzinfo=UTC)
            sub.current_period_end = datetime(2026, 12, 31, 23, 59, 59, tzinfo=UTC)
            await db_session.commit()

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            plan = overview.json()["plan"]
            assert plan["cycle"] == "annual"
            assert plan["period_start"].startswith("2026-01-01")
            assert plan["period_end"].startswith("2026-12-31")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_active_subscription_past_period_is_grace_not_expired(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            await client.post(
                f"/api/admin/invoices/{created.json()['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-GRACE-1"},
            )
            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            # Period ended yesterday; the beat has not run yet, so the row is
            # still active and the customer is inside the grace window.
            sub.current_period_start = datetime(2026, 9, 1, tzinfo=UTC)
            sub.current_period_end = datetime(2026, 9, 30, tzinfo=UTC)
            await db_session.commit()

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            plan = overview.json()["plan"]
            assert plan["status"] == "grace"
            assert plan["billing_status"] == "active"
            assert plan["source"] == "subscription"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_past_due_after_period_end_is_expired(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            await client.post(
                f"/api/admin/invoices/{created.json()['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-GRACE-2"},
            )
            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            sub.status = "past_due"
            sub.current_period_start = datetime(2026, 9, 1, tzinfo=UTC)
            sub.current_period_end = datetime(2026, 9, 30, tzinfo=UTC)
            await db_session.commit()

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            plan = overview.json()["plan"]
            assert plan["status"] == "expired"
            assert plan["billing_status"] == "past_due"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_recent_attempts_only_visible_to_managers(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            await client.post(
                f"/api/admin/invoices/{created.json()['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-ATTEMPT-1"},
            )

            owner_view = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            attempts = owner_view.json()["recent_attempts"]
            assert len(attempts) == 1
            assert attempts[0]["provider_ref"] == "TF-ATTEMPT-1"
            assert attempts[0]["status"] == "succeeded"

            viewer_view = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["viewer"], ctx["org"].id),
            )
            assert viewer_view.json()["recent_attempts"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_can_schedule_cancellation_and_resume(db_session, ctx):
    db_session.add(
        Subscription(
            organization_id=ctx["org"].id,
            sku="pro",
            status="active",
            cycle="monthly",
            provider="manual",
            current_period_start=datetime(2026, 10, 1, tzinfo=UTC),
            current_period_end=datetime(2026, 10, 31, tzinfo=UTC),
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            canceled = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/cancel",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"note": "Budget review"},
            )
            assert canceled.status_code == 200, canceled.text
            assert canceled.json()["cancel_at_period_end"] is True
            assert canceled.json()["status"] == "active"

            stored = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            await db_session.refresh(stored)
            assert stored.cancel_note == "Budget review"

            resumed = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/resume",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert resumed.status_code == 200, resumed.text
            assert resumed.json()["cancel_at_period_end"] is False
            await db_session.refresh(stored)
            assert stored.cancel_note == ""
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_resume_without_a_scheduled_cancel_is_rejected(db_session, ctx):
    db_session.add(
        Subscription(
            organization_id=ctx["org"].id,
            sku="pro",
            status="active",
            cycle="monthly",
            provider="manual",
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/resume",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert response.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_cancel_the_subscription(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/cancel",
                headers=_auth(ctx["viewer"], ctx["org"].id),
                json={},
            )
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cancel_without_a_period_is_rejected(db_session, ctx):
    db_session.add(
        Subscription(
            organization_id=ctx["org"].id,
            sku="basic",
            status="incomplete",
            cycle="monthly",
            provider="manual",
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/cancel",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={},
            )
            assert response.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_overview_lists_active_tiers_and_the_current_tier(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert response.status_code == 200
            tiers = {tier["code"]: tier for tier in response.json()["tiers"]}
            assert set(tiers) == {"basic", "pro", "multi", "enterprise"}
            assert tiers["enterprise"]["sales_led"] is True
            assert tiers["basic"]["label"] == "Basic"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_overview_keeps_inactive_current_tier_in_catalog_and_bundles(db_session, ctx):
    org = await db_session.get(Organization, ctx["org"].id)
    multi = await db_session.get(SkuTier, "multi")
    assert org is not None and multi is not None
    org.sku = "multi"
    multi.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["plan"]["sku"] == "multi"
            tiers = {tier["code"]: tier for tier in body["tiers"]}
            assert tiers["multi"]["active"] is False
            assert len(body["catalog"]) == 12
            multi_items = [item for item in body["catalog"] if item["sku"] == "multi"]
            assert len(multi_items) == 4
            assert all(item["active"] is False and item["label"] == "Multi" for item in multi_items)
            multi_bundle = next(bundle for bundle in body["bundles"] if bundle["tier"] == "multi")
            assert multi_bundle["active"] is False
            assert multi_bundle["label"] == "Multi"
            assert multi_bundle["bundle_idr"] == 2_900_000
    finally:
        app.dependency_overrides.clear()


async def _pending_request(db: AsyncSession, org_id: uuid.UUID, owner_id: uuid.UUID) -> SubscriptionRequest:
    request = SubscriptionRequest(
        id=uuid.uuid4(),
        organization_id=org_id,
        direction="upgrade",
        current_sku="basic",
        target_sku="pro",
        status="pending",
        requested_by_user_id=owner_id,
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)
    return request


@pytest.mark.asyncio
async def test_admin_can_approve_a_pending_request(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": "approved by ops"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "approved"
    assert body["resolution_note"] == "approved by ops"

    # Approval records the decision; it must not grant paid entitlement.
    await db_session.refresh(ctx["org"])
    assert ctx["org"].sku == "basic"

    invoices = (
        await db_session.execute(
            select(OrgInvoice).where(
                OrgInvoice.subscription_request_id == request.id,
            )
        )
    ).scalars().all()
    assert len(invoices) == 1
    invoice = invoices[0]
    assert invoice.status == "draft"
    assert invoice.product == "scan"
    assert invoice.sku == "pro"
    assert invoice.organization_id == ctx["org"].id

    subscription = await db_session.scalar(
        select(Subscription).where(Subscription.organization_id == ctx["org"].id)
    )
    assert subscription is not None
    assert subscription.status == "incomplete"
    assert subscription.sku == "pro"

    history = (
        await db_session.execute(
            select(SkuTierHistory).where(
                SkuTierHistory.organization_id == ctx["org"].id,
                SkuTierHistory.action == "assigned",
            )
        )
    ).scalars().all()
    assert history == []


@pytest.mark.asyncio
async def test_approval_with_a_blank_note_persists_a_resolution_note(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert response.json()["resolution_note"] == "Approved; invoice draft created"
    stored = await db_session.get(SubscriptionRequest, request.id)
    assert stored is not None
    await db_session.refresh(stored)
    assert stored.resolution_note == "Approved; invoice draft created"


@pytest.mark.asyncio
async def test_approval_moves_the_draft_to_the_next_free_period(db_session, ctx):
    start, end = period_bounds_utc(None, "monthly")
    db_session.add(
        OrgInvoice(
            id=uuid.uuid4(),
            organization_id=ctx["org"].id,
            number=f"SX-EXIST-{uuid.uuid4().hex[:8]}",
            product="scan",
            sku="basic",
            amount_idr=300_000,
            period_start=start,
            period_end=end,
            due_date=end,
            status="sent",
            notes="",
        )
    )
    await db_session.commit()
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    # The current period is already billed, so approval must not 409: it drafts
    # the next period instead.
    assert response.status_code == 200, response.text
    invoice = await db_session.scalar(
        select(OrgInvoice).where(OrgInvoice.subscription_request_id == request.id)
    )
    assert invoice is not None
    assert invoice.status == "draft"
    assert as_utc(invoice.period_start) == end + timedelta(microseconds=1)
    await db_session.refresh(ctx["org"])
    assert ctx["org"].sku == "basic"


@pytest.mark.asyncio
async def test_paying_the_approval_invoice_applies_the_tier(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            approved = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
            assert approved.status_code == 200, approved.text
            invoice = await db_session.scalar(
                select(OrgInvoice).where(
                    OrgInvoice.subscription_request_id == request.id
                )
            )
            assert invoice is not None
            assert invoice.status == "draft"
            paid = await client.post(
                f"/api/admin/invoices/{invoice.id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-APPROVAL-PAY-1"},
            )
            assert paid.status_code == 200, paid.text
    finally:
        app.dependency_overrides.clear()

    await db_session.refresh(ctx["org"])
    assert ctx["org"].sku == "pro"

    subscription = await db_session.scalar(
        select(Subscription).where(Subscription.organization_id == ctx["org"].id)
    )
    assert subscription is not None
    assert subscription.status == "active"
    assert subscription.sku == "pro"

    history = (
        await db_session.execute(
            select(SkuTierHistory).where(
                SkuTierHistory.organization_id == ctx["org"].id,
                SkuTierHistory.action == "assigned",
            )
        )
    ).scalars().all()
    assert len(history) == 1
    assert history[0].sku_code == "pro"
    assert history[0].actor_user_id == ctx["admin"].id
    assert history[0].changes["tier"] == {"from": "basic", "to": "pro"}
    assert history[0].changes["source"]["to"] == "subscription_request"


@pytest.mark.asyncio
async def test_admin_can_reject_a_pending_request(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/reject",
                headers=_auth(ctx["admin"]),
                json={"note": "not now"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_resolving_an_already_resolved_request_conflicts(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
            second = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_non_admin_cannot_resolve_a_request(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_resolving_an_unknown_request_returns_404(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{uuid.uuid4()}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_approval_keeps_an_existing_subscription_sku(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    db_session.add(
        Subscription(
            id=uuid.uuid4(),
            organization_id=ctx["org"].id,
            sku="basic",
            status="active",
            cycle="annual",
            provider="manual",
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    subscription = await db_session.scalar(
        select(Subscription).where(Subscription.organization_id == ctx["org"].id)
    )
    assert subscription is not None
    assert subscription.sku == "basic"
    assert subscription.status == "active"


@pytest.mark.asyncio
async def test_approval_is_blocked_when_the_target_tier_was_retired(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    pro = await db_session.get(SkuTier, "pro")
    assert pro is not None
    pro.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "inactive" in response.json()["detail"]
    await db_session.refresh(ctx["org"])
    assert ctx["org"].sku == "basic"
    await db_session.refresh(request)
    assert request.status == "pending"


@pytest.mark.asyncio
async def test_rejection_never_changes_the_tier(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/reject",
                headers=_auth(ctx["admin"]),
                json={"note": "not now"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    await db_session.refresh(ctx["org"])
    assert ctx["org"].sku == "basic"
    rows = (
        await db_session.execute(
            select(SkuTierHistory).where(SkuTierHistory.organization_id == ctx["org"].id)
        )
    ).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_approval_of_an_already_matching_tier_records_no_assignment(db_session, ctx):
    request = await _pending_request(db_session, ctx["org"].id, ctx["owner"].id)
    org = await db_session.get(Organization, ctx["org"].id)
    assert org is not None
    org.sku = "pro"
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscription-requests/{request.id}/approve",
                headers=_auth(ctx["admin"]),
                json={"note": ""},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    rows = (
        await db_session.execute(
            select(SkuTierHistory).where(SkuTierHistory.organization_id == ctx["org"].id)
        )
    ).scalars().all()
    assert rows == []
