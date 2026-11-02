from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import AiFxRate, AiModel, AiProvider, AiUsageEvent, AiWallet
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.ai_crypto import encrypt_credential
from app.services.ai_wallet import hold_idr, resolve_snapshot
from app.services.auth import create_access_token, hash_password
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
    owner = await _make_user(db_session, "ai-v1-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="AI V1 Org",
        slug=f"ai-v1-{uuid.uuid4().hex[:6]}",
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
        base_url="https://wholesale.example/v1",
        credential_enc=encrypt_credential("wholesale-secret"),
    )
    db_session.add(provider)
    await db_session.flush()
    model = AiModel(
        provider_id=provider.id,
        public_id="sinexis/test",
        upstream_id="hidden-upstream",
        price_idr_per_1k_in=1000,
        price_idr_per_1k_out=2000,
        hpp_usd_per_1k_in=1,
        hpp_usd_per_1k_out=2,
        max_tokens_cap=100,
    )
    db_session.add(model)
    db_session.add(AiWallet(organization_id=org.id, balance_idr=50_000))
    await db_session.commit()
    return {"owner": owner, "org": org, "model": model}


@pytest.mark.asyncio
async def test_keys_and_v1_chat(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "cli"})
            assert created.status_code == 201, created.text
            plain = created.json()["key"]
            assert plain.startswith("sx-")
            listed = await ac.get("/api/ai/keys", headers=_auth(owner, org.id))
            assert listed.status_code == 200
            assert listed.json()["items"][0].get("key") in (None, "")

            models = await ac.get("/v1/models", headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"})
            assert models.status_code == 200
            assert models.json()["data"][0]["id"] == "sinexis/test"
            assert "hidden-upstream" not in models.text

            class _Resp:
                status_code = 200

                def json(self):
                    return {
                        "id": "chatcmpl-1",
                        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "hi"}}],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                    }

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=_Resp())

            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "hi"}]},
                )
            assert chat.status_code == 200, chat.text
            assert "wholesale" not in chat.text
            assert "wholesale-secret" not in chat.text
            posted_json = mock_client.post.call_args.kwargs["json"]
            assert posted_json["model"] == "hidden-upstream"
            assert posted_json["model"] != "sinexis/test"

            tools_payload = {
                "model": "sinexis/test",
                "messages": [{"role": "user", "content": "hi"}],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "lookup",
                            "description": "lookup",
                            "parameters": {"type": "object", "properties": {}},
                        },
                    }
                ],
                "tool_choice": "auto",
            }
            mock_client.post = AsyncMock(return_value=_Resp())
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                with_tools = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json=tools_payload,
                )
            assert with_tools.status_code == 200, with_tools.text
            forwarded = mock_client.post.call_args.kwargs["json"]
            assert forwarded["tools"] == tools_payload["tools"]
            assert forwarded["tool_choice"] == "auto"
            assert forwarded["model"] == "hidden-upstream"

            bad_n = await ac.post(
                "/v1/chat/completions",
                headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                json={"model": "sinexis/test", "n": 2, "messages": [{"role": "user", "content": "x"}]},
            )
            assert bad_n.status_code == 400

            multimodal_payload = {
                "model": "sinexis/test",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "what is this?"},
                            {"type": "image_url", "image_url": {"url": "https://example.com/x.png"}},
                        ],
                    }
                ],
            }
            mock_client.post = AsyncMock(return_value=_Resp())
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                mm = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json=multimodal_payload,
                )
            assert mm.status_code == 200, mm.text
            forwarded_mm = mock_client.post.call_args.kwargs["json"]
            assert forwarded_mm["messages"] == multimodal_payload["messages"]
            assert forwarded_mm["model"] == "hidden-upstream"

            unknown = await ac.post(
                "/v1/chat/completions",
                headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                json={"model": "nope", "messages": [{"role": "user", "content": "x"}]},
            )
            assert unknown.status_code == 404

            class _Fail:
                status_code = 401
                text = "https://wholesale.example key=wholesale-secret"

                def json(self):
                    return {"error": {"message": self.text}}

            mock_client.post = AsyncMock(return_value=_Fail())
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                fail = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "x"}]},
                )
            assert fail.status_code == 502
            assert "wholesale" not in fail.text

            key_id = created.json()["id"]
            rev = await ac.delete(f"/api/ai/keys/{key_id}", headers=_auth(owner, org.id))
            assert rev.status_code == 200
            dead = await ac.get("/v1/models", headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"})
            assert dead.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_v1_clamps_hold_to_wallet(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    ctx["model"].max_tokens_cap = 8192
    ctx["model"].price_idr_per_1k_in = 2000
    ctx["model"].price_idr_per_1k_out = 5000
    wallet = (await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))).scalar_one()
    wallet.balance_idr = 10_000
    await db_session.commit()

    snapshot = await resolve_snapshot(db_session, ctx["model"])
    full = hold_idr(max_tokens=8192, snapshot=snapshot)
    assert full > 10_000

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "hold"})
            plain = created.json()["key"]

            class _Resp:
                status_code = 200

                def json(self):
                    return {
                        "id": "chatcmpl-1",
                        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "hi"}}],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                    }

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=_Resp())
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "hi"}]},
                )
            assert chat.status_code == 200, chat.text
            forwarded = mock_client.post.call_args.kwargs["json"]
            assert forwarded["max_tokens"] < 8192
            assert hold_idr(max_tokens=forwarded["max_tokens"], snapshot=snapshot) <= 10_000
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_v1_large_prompt_does_not_402_on_10k_wallet(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    ctx["model"].price_idr_per_1k_in = 10_000
    ctx["model"].price_idr_per_1k_out = 20_000
    wallet = (await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))).scalar_one()
    wallet.balance_idr = 10_000
    await db_session.commit()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "ctx"})
            plain = created.json()["key"]

            class _Resp:
                status_code = 200

                def json(self):
                    return {
                        "id": "chatcmpl-1",
                        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}],
                        "usage": {"prompt_tokens": 8, "completion_tokens": 4},
                    }

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=_Resp())
            huge = "x" * 80_000
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": huge}]},
                )
            assert chat.status_code == 200, chat.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_v1_rate_lock_uses_reservation_snapshot(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    model = ctx["model"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "lock"})
            plain = created.json()["key"]

            class _Resp:
                status_code = 200

                def json(self):
                    return {
                        "id": "chatcmpl-lock",
                        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "hi"}}],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
                    }

            async def _mutate_then_respond(*_args, **_kwargs):
                model.price_idr_per_1k_in = 900_000
                model.price_idr_per_1k_out = 1_800_000
                db_session.add(
                    AiFxRate(
                        base="USD",
                        quote="IDR",
                        rate=Decimal("30000"),
                        source="manual",
                        effective_date=date.today(),
                    )
                )
                await db_session.commit()
                return _Resp()

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(side_effect=_mutate_then_respond)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "hi"}]},
                )
            assert chat.status_code == 200, chat.text

        event = (
            await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org.id))
        ).scalar_one()
        assert event.fx_rate == Decimal("16000")
        assert event.fx_source == "env"
        assert event.price_usd_per_1m_in == Decimal("62.500000")
        assert event.price_usd_per_1m_out == Decimal("125.000000")
        assert event.billed_usd == Decimal("0.001250000000")
        assert event.billed_idr == 20
        assert model.price_idr_per_1k_in == 900_000
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_v1_missing_usage_is_estimated_not_refunded(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "no-usage"})
            plain = created.json()["key"]

            class _Resp:
                status_code = 200

                def json(self):
                    return {
                        "id": "chatcmpl-nousage",
                        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "a" * 40}}],
                    }

            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.post = AsyncMock(return_value=_Resp())
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/v1/chat/completions",
                    headers={"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"},
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "hi"}]},
                )
            assert chat.status_code == 200, chat.text

        event = (
            await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org.id))
        ).scalar_one()
        assert event.usage_missing is True
        assert event.billed_estimated is True
        assert event.prompt_tokens == 1
        assert event.completion_tokens == 10
        assert event.billed_idr > 0
        assert event.cogs_usd is not None
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_v1_flag_off(client) -> None:
    r = client.get("/v1/models", headers={"Authorization": "Bearer sx-x", "X-E2E-Test": "1"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_legacy_sk_sx_prefix_still_authenticates(db_session: AsyncSession, ctx) -> None:
    from app.models.ai_gateway import AiApiKey
    from app.services.ai_keys import LEGACY_KEY_PREFIX, authenticate_customer_key
    from app.utils import hash_key

    org = ctx["org"]
    owner = ctx["owner"]
    plain = LEGACY_KEY_PREFIX + "legacytokenvalue0123456789abcd"
    db_session.add(
        AiApiKey(
            organization_id=org.id,
            created_by_user_id=owner.id,
            name="legacy",
            prefix=plain[:16],
            key_hash=hash_key(plain),
        )
    )
    await db_session.commit()
    row = await authenticate_customer_key(db_session, plain)
    assert row.name == "legacy"


@pytest.mark.asyncio
async def test_public_catalog_returns_usd_and_env_fx(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/ai/models", headers=_auth(owner, org.id))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["price_usd_per_1m_in"] == 62.5
    assert item["price_usd_per_1m_out"] == 125.0
    assert item["price_idr_per_1k_in"] == 1000
    assert item["price_idr_per_1k_out"] == 2000
    assert item["fx_rate"] == float(settings.ai_usd_idr)
    assert item["fx_source"] == "env"
    assert item["fx_effective_date"] is None
    assert item["fx_stale"] is True


@pytest.mark.asyncio
async def test_public_catalog_uses_stored_rate_and_marks_fresh(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    model = ctx["model"]
    model.price_usd_per_1m_in = Decimal("1.5")
    model.price_usd_per_1m_out = Decimal("2.5")
    db_session.add(
        AiFxRate(
            base="USD",
            quote="IDR",
            rate=Decimal("16300"),
            source="manual",
            effective_date=date.today(),
        )
    )
    await db_session.commit()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/ai/models", headers=_auth(owner, org.id))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["price_usd_per_1m_in"] == 1.5
    assert item["price_usd_per_1m_out"] == 2.5
    assert item["price_idr_per_1k_in"] == 24
    assert item["price_idr_per_1k_out"] == 41
    assert item["fx_rate"] == 16300.0
    assert item["fx_source"] == "manual"
    assert item["fx_effective_date"] == date.today().isoformat()
    assert item["fx_stale"] is False


@pytest.mark.asyncio
async def test_customer_usage_hides_cogs_hpp_and_fx(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    db_session.add(
        AiUsageEvent(
            organization_id=org.id,
            source="customer",
            model_public_id="sinexis/test",
            prompt_tokens=10,
            completion_tokens=5,
            billed_idr=10,
            cogs_idr=4,
            billed_usd=Decimal("0.001000000000"),
            cogs_usd=Decimal("0.000400000000"),
            fx_rate=Decimal("16000"),
            fx_source="env",
            price_usd_per_1m_in=Decimal("0.15"),
            price_usd_per_1m_out=Decimal("0.60"),
            hpp_usd_per_1m_in=Decimal("0.075"),
            hpp_usd_per_1m_out=Decimal("0.30"),
            created_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/ai/usage", headers=_auth(owner, org.id))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["billed_idr"] == 10
    for leaked in ("cogs_idr", "cogs_usd", "billed_usd", "hpp_usd_per_1m_in", "hpp_usd_per_1m_out", "margin_idr"):
        assert leaked not in item
    assert "fx_rate" not in item
    assert "fx_source" not in item
    assert "fx_effective_date" not in item
