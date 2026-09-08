from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import AiModel, AiProvider, AiWallet
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.ai_crypto import encrypt_credential
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
    wallet = (
        await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))
    ).scalar_one()
    wallet.balance_idr = 10_000
    await db_session.commit()

    from app.services.ai_wallet import hold_idr

    full = hold_idr(max_tokens=8192, model=ctx["model"])
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
            assert hold_idr(max_tokens=forwarded["max_tokens"], model=ctx["model"]) <= 10_000
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
