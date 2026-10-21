"""Read-only billing gate.

A lapsed workspace keeps read access, exports, and billing; only writes that
create cost or commitment are blocked.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.billing import Subscription
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.billing_access import (
    REASON_CANCELED,
    REASON_OVERDUE,
    billing_write_block,
    read_only_message,
)
from app.services.organization import ensure_personal_org


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=False,
        credits=100,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User, org_id: uuid.UUID) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=False,
        org_id=str(org_id),
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    owner = await _make_user(db_session, "gate-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Gate Org",
        slug=f"gate-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="pro",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    await db_session.commit()
    return {"owner": owner, "org": org}


async def _set_status(db: AsyncSession, org: Organization, status: str, sku: str = "pro") -> None:
    db.add(
        Subscription(
            organization_id=org.id,
            sku=sku,
            status=status,
            cycle="monthly",
            provider="manual",
        )
    )
    org.sku = sku
    await db.commit()


@pytest.mark.asyncio
async def test_past_due_blocks_asset_creation(db_session, ctx):
    await _set_status(db_session, ctx["org"], "past_due")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/assets",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"name": "new-asset", "scan_type": "domain", "target": "example.test"},
            )
            assert response.status_code == 403
            assert "read-only" in response.json()["detail"]
            assert "overdue" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_past_due_keeps_reads_available(db_session, ctx):
    await _set_status(db_session, ctx["org"], "past_due")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            listed = await client.get(
                "/api/assets",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert listed.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_past_due_blocks_scan_submission(db_session, ctx, monkeypatch):
    monkeypatch.setattr(
        "app.services.scanner.celery_app.send_task",
        MagicMock(return_value=MagicMock(id="mock")),
    )
    await _set_status(db_session, ctx["org"], "past_due")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/scan/ip",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target": "10.0.0.1"},
            )
            assert response.status_code == 403
            assert "read-only" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_active_subscription_allows_writes(db_session, ctx, monkeypatch):
    monkeypatch.setattr(
        "app.services.scanner.celery_app.send_task",
        MagicMock(return_value=MagicMock(id="mock")),
    )
    await _set_status(db_session, ctx["org"], "active")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/scan/ip",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target": "10.0.0.2"},
            )
            assert response.status_code == 202, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_missing_subscription_row_does_not_lock_the_org(db_session, ctx):
    # No row at all: a missing lifecycle record must never block a workspace.
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/assets",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"name": "ok-asset", "scan_type": "domain", "target": "ok.test"},
            )
            assert response.status_code == 201, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_enterprise_is_never_read_only(db_session, ctx):
    await _set_status(db_session, ctx["org"], "past_due", sku="enterprise")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/assets",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"name": "ent-asset", "scan_type": "domain", "target": "ent.test"},
            )
            assert response.status_code == 201, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_canceled_reports_a_different_reason(db_session, ctx):
    await _set_status(db_session, ctx["org"], "canceled")
    reason = await billing_write_block(db_session, ctx["org"].id)
    assert reason == REASON_CANCELED
    assert "ended" in read_only_message(reason)


@pytest.mark.asyncio
async def test_incomplete_subscription_is_not_blocked(db_session, ctx):
    await _set_status(db_session, ctx["org"], "incomplete")
    assert await billing_write_block(db_session, ctx["org"].id) is None


@pytest.mark.asyncio
async def test_billing_actions_stay_available_while_read_only(db_session, ctx):
    await _set_status(db_session, ctx["org"], "past_due")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Requesting a plan change is how a customer recovers; it must not be gated.
            response = await client.post(
                f"/api/orgs/{ctx['org'].id}/subscription/requests",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"target_sku": "multi"},
            )
            assert response.status_code == 201, response.text

            overview = await client.get(
                f"/api/orgs/{ctx['org'].id}/subscription",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert overview.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_overdue_reason_message_is_actionable(db_session, ctx):
    await _set_status(db_session, ctx["org"], "past_due")
    reason = await billing_write_block(db_session, ctx["org"].id)
    assert reason == REASON_OVERDUE
    message = read_only_message(reason)
    assert "Settle the invoice" in message


@pytest_asyncio.fixture
async def two_orgs(db_session: AsyncSession):
    """Owner belongs to a healthy org (JWT active) and a lapsed org (path)."""
    owner = await _make_user(db_session, "scope-owner@example.com")
    member = await _make_user(db_session, "scope-member@example.com")
    healthy = Organization(
        id=uuid.uuid4(),
        name="Healthy Org",
        slug=f"healthy-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="pro",
        created_by_user_id=owner.id,
    )
    lapsed = Organization(
        id=uuid.uuid4(),
        name="Lapsed Org",
        slug=f"lapsed-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="pro",
        created_by_user_id=owner.id,
    )
    db_session.add_all([healthy, lapsed])
    await db_session.flush()
    for org, role in ((healthy, "owner"), (lapsed, "owner")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=owner.id,
                role=role,
            )
        )
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=lapsed.id,
            user_id=member.id,
            role="member",
        )
    )
    await db_session.commit()

    db_session.add(
        Subscription(
            organization_id=healthy.id,
            sku="pro",
            status="active",
            cycle="monthly",
            provider="manual",
        )
    )
    db_session.add(
        Subscription(
            organization_id=lapsed.id,
            sku="pro",
            status="past_due",
            cycle="monthly",
            provider="manual",
        )
    )
    await db_session.commit()
    return {"owner": owner, "member": member, "healthy": healthy, "lapsed": lapsed}


@pytest.mark.asyncio
async def test_path_org_is_judged_not_the_jwt_active_org(db_session, two_orgs):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # JWT is scoped to the healthy org, but the path writes to the lapsed one.
            response = await client.patch(
                f"/api/orgs/{two_orgs['lapsed'].id}",
                headers=_auth(two_orgs["owner"], two_orgs["healthy"].id),
                json={"name": "Renamed while lapsed"},
            )
            assert response.status_code == 403, response.text
            assert "read-only" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_healthy_path_org_still_allows_writes(db_session, two_orgs):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                f"/api/orgs/{two_orgs['healthy'].id}",
                headers=_auth(two_orgs["owner"], two_orgs["lapsed"].id),
                json={"name": "Renamed healthy"},
            )
            assert response.status_code == 200, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_member_can_leave_a_lapsed_workspace(db_session, two_orgs):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                f"/api/orgs/{two_orgs['lapsed'].id}/members/{two_orgs['member'].id}",
                headers=_auth(two_orgs["member"], two_orgs["lapsed"].id),
            )
            assert response.status_code == 204, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_cannot_remove_another_member_while_lapsed(db_session, two_orgs):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete(
                f"/api/orgs/{two_orgs['lapsed'].id}/members/{two_orgs['member'].id}",
                headers=_auth(two_orgs["owner"], two_orgs["lapsed"].id),
            )
            assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invite_is_blocked_on_the_path_org(db_session, two_orgs):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{two_orgs['lapsed'].id}/invites",
                headers=_auth(two_orgs["owner"], two_orgs["healthy"].id),
                json={"email": "new@example.com", "role": "member"},
            )
            assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.clear()
