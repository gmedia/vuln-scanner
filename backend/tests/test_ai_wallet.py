from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import AiModel, AiProvider
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.ai_wallet import billed_idr, hold_idr, record_usage, release, reserve, settle
from app.services.auth import create_access_token, get_current_admin, hash_password
from app.services.organization import ensure_personal_org


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=10,
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
        is_admin=user.is_admin,
        org_id=str(org_id),
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession, ai_on):
    owner = await _make_user(db_session, "ai-owner@example.com")
    outsider = await _make_user(db_session, "ai-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="AI Org",
        slug=f"ai-org-{uuid.uuid4().hex[:6]}",
        kind="hotel",
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
    provider = AiProvider(
        name="OR",
        base_url="https://example.com/v1",
        credential_enc="x",
    )
    db_session.add(provider)
    await db_session.flush()
    model = AiModel(
        provider_id=provider.id,
        public_id="sinexis/test",
        upstream_id="test",
        price_idr_per_1k_in=1000,
        price_idr_per_1k_out=2000,
        hpp_usd_per_1k_in=1,
        hpp_usd_per_1k_out=2,
        max_tokens_cap=100,
    )
    db_session.add(model)
    await db_session.commit()
    return {"owner": owner, "outsider": outsider, "org": org, "model": model}


def test_billed_idr_ceils_per_thousand() -> None:
    class _M:
        price_idr_per_1k_in = 1000
        price_idr_per_1k_out = 2000

    assert billed_idr(prompt_tokens=1, completion_tokens=1, model=_M()) == 3
    assert billed_idr(prompt_tokens=1000, completion_tokens=500, model=_M()) == 2000


def test_flag_off_customer_404(client) -> None:
    r = client.get("/api/ai/wallet", headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_wallet_idor_and_topup(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    outsider = ctx["outsider"]
    org = ctx["org"]
    model = ctx["model"]

    async def override_get_db():
        yield db_session

    async def override_admin() -> User:
        owner.is_admin = True
        return owner

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_admin] = override_admin
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            empty = await ac.get("/api/ai/wallet", headers=_auth(owner, org.id))
            assert empty.status_code == 200, empty.text
            assert empty.json()["balance_idr"] == 0

            out_org = outsider.last_active_organization_id
            assert out_org is not None
            other = await ac.get("/api/ai/wallet", headers=_auth(outsider, out_org))
            assert other.status_code == 200
            assert other.json()["organization_id"] != str(org.id)
            stolen = await ac.get("/api/ai/wallet", headers=_auth(outsider, org.id))
            assert stolen.status_code == 401

            top = await ac.post(
                f"/api/admin/ai/wallets/{org.id}/topup",
                headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"},
                json={"amount_idr": 10_000},
            )
            assert top.status_code == 200, top.text
            assert top.json()["balance_idr"] == 10_000

            after = await ac.get("/api/ai/wallet", headers=_auth(owner, org.id))
            assert after.json()["balance_idr"] == 10_000

            hold = hold_idr(max_tokens=10, model=model)
            first = await reserve(db_session, organization_id=org.id, hold=hold)
            with pytest.raises(HTTPException) as exc:
                await reserve(db_session, organization_id=org.id, hold=9_000)
            assert exc.value.status_code == 402
            billed = billed_idr(prompt_tokens=10, completion_tokens=20, model=model)
            await settle(db_session, reservation=first, billed=billed)
            await record_usage(
                db_session,
                organization_id=org.id,
                user_id=owner.id,
                key_id=None,
                source="customer",
                model=model,
                prompt_tokens=10,
                completion_tokens=20,
                billed=billed,
                cogs=1,
                reservation_id=first.id,
            )
            await db_session.commit()

            usage = await ac.get("/api/ai/usage", headers=_auth(owner, org.id))
            assert usage.status_code == 200
            body = usage.json()
            assert body["total"] == 1
            assert "messages" not in usage.text

            res2 = await reserve(db_session, organization_id=org.id, hold=hold)
            await release(db_session, res2)
            await db_session.commit()

            models = await ac.get("/api/ai/models", headers=_auth(owner, org.id))
            assert models.status_code == 200
            assert models.json()["total"] >= 1
            assert "upstream_id" not in models.text

            admin_usage = await ac.get(
                "/api/admin/ai/usage",
                headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"},
            )
            assert admin_usage.status_code == 200
            assert admin_usage.json()["total"] >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_admin, None)
