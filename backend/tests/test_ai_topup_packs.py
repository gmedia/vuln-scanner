"""AI top-up pack catalog: service validation + admin API (S1)."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.user import User
from app.services.ai_topup import create_pack, get_pack, list_packs, update_pack
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


@pytest.mark.asyncio
async def test_create_list_and_update_pack(db_session: AsyncSession) -> None:
    active = await create_pack(
        db_session,
        code="p100",
        label="Rp 100.000",
        amount_idr=100_000,
        sort_order=2,
    )
    inactive = await create_pack(
        db_session,
        code="p50",
        label="Rp 50.000",
        amount_idr=50_000,
        active=False,
        sort_order=1,
    )

    all_packs = await list_packs(db_session)
    assert {p.code for p in all_packs} == {"p100", "p50"}

    sellable = await list_packs(db_session, active_only=True)
    assert [p.code for p in sellable] == ["p100"]

    updated = await update_pack(db_session, inactive.id, active=True, label="Rp 50.000 baru")
    assert updated.active is True
    assert updated.label == "Rp 50.000 baru"
    assert (await get_pack(db_session, active.id)).amount_idr == 100_000


@pytest.mark.asyncio
async def test_create_pack_rejects_invalid_and_duplicate(db_session: AsyncSession) -> None:
    with pytest.raises(HTTPException) as exc:
        await create_pack(db_session, code="bad", label="x", amount_idr=0)
    assert exc.value.status_code == 422

    with pytest.raises(HTTPException) as exc2:
        await create_pack(db_session, code="bad", label="   ", amount_idr=10)
    assert exc2.value.status_code == 422

    with pytest.raises(HTTPException) as exc3:
        await create_pack(db_session, code="bad", label="x", amount_idr=10, bonus_idr=-1)
    assert exc3.value.status_code == 422

    await create_pack(db_session, code="dup", label="x", amount_idr=10)
    with pytest.raises(HTTPException) as exc4:
        await create_pack(db_session, code="dup", label="y", amount_idr=20)
    assert exc4.value.status_code == 409


@pytest.mark.asyncio
async def test_admin_pack_api_crud_and_flag_independent(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "topup-admin@example.com", admin=True)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/ai/topup/packs",
                headers=_auth(admin),
                json={"code": "p200", "label": "Rp 200.000", "amount_idr": 200_000},
            )
            assert created.status_code == 201, created.text
            body = created.json()
            assert body["code"] == "p200"
            assert body["active"] is True
            pack_id = body["id"]

            listed = await client.get("/api/admin/ai/topup/packs", headers=_auth(admin))
            assert listed.status_code == 200, listed.text
            assert listed.json()["total"] == 1

            patched = await client.patch(
                f"/api/admin/ai/topup/packs/{pack_id}",
                headers=_auth(admin),
                json={"active": False},
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["active"] is False

            active_only = await client.get("/api/admin/ai/topup/packs?active_only=true", headers=_auth(admin))
            assert active_only.status_code == 200
            assert active_only.json()["total"] == 0

            duplicate = await client.post(
                "/api/admin/ai/topup/packs",
                headers=_auth(admin),
                json={"code": "p200", "label": "dup", "amount_idr": 1000},
            )
            assert duplicate.status_code == 409

            invalid = await client.post(
                "/api/admin/ai/topup/packs",
                headers=_auth(admin),
                json={"code": "zero", "label": "zero", "amount_idr": 0},
            )
            assert invalid.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_pack_api_rejects_non_admin(db_session: AsyncSession) -> None:
    viewer = await _make_user(db_session, "topup-viewer@example.com", admin=False)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/admin/ai/topup/packs", headers=_auth(viewer))
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()
