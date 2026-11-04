"""Admin promo-code API: auth gate, CRUD, pagination and validate."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import create_access_token, hash_password


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}

def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

async def _make_user(db: AsyncSession, email: str, *, admin: bool) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=admin,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

def _create_body(code: str = "LAUNCH2026", **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "code": code,
        "description": "Launch discount",
        "kind": "percent",
        "percent_off_bp": 1000,
        "min_amount_idr": 0,
        "max_redemptions_per_org": 1,
    }
    body.update(overrides)
    return body

@pytest.mark.asyncio
async def test_non_admin_is_forbidden(db_session: AsyncSession) -> None:
    viewer = await _make_user(db_session, "promo-viewer@example.com", admin=False)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/admin/promo-codes", headers=_auth(viewer)
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_crud_duplicate_deactivate_reactivate_and_delete(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-admin@example.com", admin=True)
    _bind(db_session)
    transport = ASGITransport(app=app)
    headers = _auth(admin)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/promo-codes", headers=headers, json=_create_body("launch2026")
            )
            assert created.status_code == 201, created.text
            promo = created.json()
            assert promo["code"] == "LAUNCH2026"
            promo_id = promo["id"]

            duplicate = await client.post(
                "/api/admin/promo-codes", headers=headers, json=_create_body("LAUNCH2026")
            )
            assert duplicate.status_code == 409

            listing = await client.get("/api/admin/promo-codes", headers=headers)
            assert listing.status_code == 200
            assert listing.json()["total"] == 1

            detail = await client.get(
                f"/api/admin/promo-codes/{promo_id}", headers=headers
            )
            assert detail.status_code == 200
            assert detail.json()["percent_off_bp"] == 1000

            patched = await client.patch(
                f"/api/admin/promo-codes/{promo_id}",
                headers=headers,
                json={"description": "Updated description"},
            )
            assert patched.status_code == 200
            assert patched.json()["description"] == "Updated description"

            off = await client.post(
                f"/api/admin/promo-codes/{promo_id}/deactivate", headers=headers
            )
            assert off.status_code == 200
            assert off.json()["active"] is False
            on = await client.post(
                f"/api/admin/promo-codes/{promo_id}/reactivate", headers=headers
            )
            assert on.status_code == 200
            assert on.json()["active"] is True

            history = await client.get(
                f"/api/admin/promo-codes/{promo_id}/history", headers=headers
            )
            assert history.status_code == 200
            assert [row["action"] for row in history.json()["items"]] == [
                "reactivated",
                "deactivated",
                "updated",
                "created",
            ]

            deleted = await client.delete(
                f"/api/admin/promo-codes/{promo_id}", headers=headers
            )
            assert deleted.status_code == 204
            missing = await client.get(
                f"/api/admin/promo-codes/{promo_id}", headers=headers
            )
            assert missing.status_code == 404
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_pagination(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-page@example.com", admin=True)
    _bind(db_session)
    transport = ASGITransport(app=app)
    headers = _auth(admin)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for index in range(3):
                response = await client.post(
                    "/api/admin/promo-codes",
                    headers=headers,
                    json=_create_body(f"PAGE{index}2026"),
                )
                assert response.status_code == 201, response.text
            page = await client.get(
                "/api/admin/promo-codes?page=1&page_size=2", headers=headers
            )
            body = page.json()
            assert body["total"] == 3
            assert len(body["items"]) == 2
            assert body["page"] == 1
            assert body["page_size"] == 2
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_admin_validate_returns_discount_and_total(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-validate@example.com", admin=True)
    org = Organization(
        id=uuid.uuid4(),
        name="Validate Org",
        slug=f"validate-org-{uuid.uuid4().hex[:8]}",
        kind="company",
        sku="basic",
        created_by_user_id=admin.id,
    )
    db_session.add(org)
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    headers = _auth(admin)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/admin/promo-codes",
                headers=headers,
                json=_create_body("VALIDATE2026"),
            )
            response = await client.post(
                "/api/admin/promo-codes/validate",
                headers=headers,
                json={
                    "organization_id": str(org.id),
                    "code": "validate2026",
                    "product": "scan",
                    "sku": "basic",
                    "cycle": "monthly",
                },
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body == {
                "valid": True,
                "description": "Launch discount",
                "discount_idr": 30_000,
                "total_idr": 270_000,
            }
    finally:
        app.dependency_overrides.clear()
