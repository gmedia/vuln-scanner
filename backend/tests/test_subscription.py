from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.asset import ScanAsset
from app.models.billing import Subscription
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
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
            assert overview.json()["usage"][0]["limit"] is None

            r = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "enterprise"},
            )
            assert r.status_code == 422

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
