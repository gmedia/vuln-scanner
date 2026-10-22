from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.billing import BillingRecipient, OrgBillingProfile
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


def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    owner = await _make_user(db_session, "profile-owner@example.com")
    viewer = await _make_user(db_session, "profile-viewer@example.com")
    admin = await _make_user(db_session, "profile-admin@example.com", is_admin=True)
    org = Organization(
        id=uuid.uuid4(),
        name="Profile Org",
        slug=f"profile-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="pro",
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
    return {"owner": owner, "viewer": viewer, "admin": admin, "org": org}


@pytest.mark.asyncio
async def test_profile_defaults_when_absent(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/orgs/{ctx['org'].id}/billing-profile",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["payment_terms_days"] == 0
            assert body["country"] == "ID"
            assert body["recipients"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_profile_upsert_persists_tax_and_terms(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                f"/api/orgs/{ctx['org'].id}/billing-profile",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={
                    "legal_name": "PT Contoh Jaya",
                    "tax_id": "0123456789012345",
                    "nitku": "0123456789012345000000",
                    "address_line1": "Jl. Contoh 1",
                    "city": "Jakarta",
                    "province": "DKI Jakarta",
                    "postal_code": "10110",
                    "billing_email": "Finance@Example.com",
                    "po_required": True,
                    "po_number": "PO-2026-001",
                    "payment_terms_days": 30,
                    "pkp_status": "pkp",
                },
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["legal_name"] == "PT Contoh Jaya"
            assert body["billing_email"] == "finance@example.com"
            assert body["payment_terms_days"] == 30
            assert body["pkp_status"] == "pkp"

            stored = await db_session.get(OrgBillingProfile, ctx["org"].id)
            assert stored is not None
            assert stored.tax_id == "0123456789012345"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_profile_rejects_malformed_npwp(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                f"/api/orgs/{ctx['org'].id}/billing-profile",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"tax_id": "123"},
            )
            assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_payment_terms_drive_the_invoice_due_date(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.put(
                f"/api/orgs/{ctx['org'].id}/billing-profile",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"payment_terms_days": 30},
            )
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                },
            )
            assert created.status_code == 201, created.text
            assert created.json()["due_date"].startswith("2026-10-01")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_first_billing_recipient_becomes_primary(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                f"/api/orgs/{ctx['org'].id}/billing-recipients",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"email": "ap@example.com"},
            )
            assert first.status_code == 201, first.text
            assert first.json()["is_primary"] is True

            second = await client.post(
                f"/api/orgs/{ctx['org'].id}/billing-recipients",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"email": "controller@example.com"},
            )
            assert second.status_code == 201
            assert second.json()["is_primary"] is False

            duplicate = await client.post(
                f"/api/orgs/{ctx['org'].id}/billing-recipients",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"email": "AP@example.com"},
            )
            assert duplicate.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_removing_primary_promotes_the_next_recipient(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                f"/api/orgs/{ctx['org'].id}/billing-recipients",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"email": "ap@example.com"},
            )
            second = await client.post(
                f"/api/orgs/{ctx['org'].id}/billing-recipients",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"email": "controller@example.com"},
            )
            removed = await client.delete(
                f"/api/orgs/{ctx['org'].id}/billing-recipients/{first.json()['id']}",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert removed.status_code == 204

            rows = (
                await db_session.execute(
                    select(BillingRecipient).where(
                        BillingRecipient.organization_id == ctx["org"].id,
                        BillingRecipient.disabled_at.is_(None),
                    )
                )
            ).all()
            assert len(rows) == 1
            promoted = await db_session.get(BillingRecipient, uuid.UUID(second.json()["id"]))
            assert promoted is not None
            assert promoted.is_primary is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_read_billing_profile(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/orgs/{ctx['org'].id}/billing-profile",
                headers=_auth(ctx["viewer"], ctx["org"].id),
            )
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
