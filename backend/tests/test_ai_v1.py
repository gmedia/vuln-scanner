from __future__ import annotations

import time
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from prometheus_client.registry import REGISTRY
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import (
    AiFxRate,
    AiModel,
    AiModelUpstream,
    AiProvider,
    AiUsageEvent,
    AiWallet,
    AiWalletLedger,
)
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services import ai_breaker
from app.services.ai_crypto import encrypt_credential
from app.services.ai_proxy import (
    UpstreamCandidate,
    _attempt_timeout,
    _can_retry,
    _post_with_failover,
)
from app.services.ai_wallet import hold_idr, resolve_snapshot
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org
from tests.test_ai_breaker import FakeAsyncRedis


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


@pytest.fixture(autouse=True)
def _breaker_redis(monkeypatch: pytest.MonkeyPatch) -> FakeAsyncRedis:
    fake = FakeAsyncRedis()
    monkeypatch.setattr(ai_breaker, "_redis", fake)
    return fake


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


# --- AI gateway upstream failover -------------------------------------------

CHAT_PATH = "/v1/chat/completions"
MODELS_PATH = "/v1/models"


class _UpstreamResponse:
    """Non-stream upstream response fake: only ``status_code`` and ``json()`` are read."""

    def __init__(self, status_code: int, payload: dict[str, object] | None = None) -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self) -> dict[str, object]:
        return self._payload


class _FakeStreamResponse:
    """Async context manager standing in for ``httpx.Response`` returned by ``client.stream``."""

    def __init__(
        self,
        status_code: int,
        chunks: list[bytes] | None = None,
        raise_after: bool = False,
        raise_before: bool = False,
    ) -> None:
        self.status_code = status_code
        self._chunks = chunks or []
        self._raise_after = raise_after
        self._raise_before = raise_before

    async def __aenter__(self) -> _FakeStreamResponse:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def aiter_bytes(self):
        if self._raise_before:
            raise httpx.ReadTimeout("no first byte")
        for chunk in self._chunks:
            yield chunk
        if self._raise_after:
            raise httpx.TransportError("boom")


def _chat_payload(prompt: int = 10, completion: int = 5) -> dict[str, object]:
    return {
        "id": "chatcmpl-failover",
        "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "hi"}}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion},
    }


def _chat_body(**extra: object) -> dict[str, object]:
    body: dict[str, object] = {"model": "sinexis/test", "messages": [{"role": "user", "content": "hi"}]}
    body.update(extra)
    return body


def _key_headers(plain: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {plain}", "X-E2E-Test": "1"}


def _post_client(*responses: object) -> AsyncMock:
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(side_effect=list(responses))
    return mock_client


def _stream_client(*responses: object) -> AsyncMock:
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    # ``AsyncClient.stream`` is a sync method returning an async context manager, not a coroutine.
    mock_client.stream = MagicMock(side_effect=list(responses))
    return mock_client


async def _add_fallback(
    db: AsyncSession,
    model: AiModel,
    *,
    name: str = "FB",
    base_url: str = "https://fallback.example/v1",
    upstream_id: str = "fb-upstream",
    rank: int = 1,
    enabled: bool = True,
    status: str = "ok",
    provider_enabled: bool = True,
    hpp_in: Decimal | None = None,
    hpp_out: Decimal | None = None,
    max_tokens_cap: int | None = None,
) -> AiProvider:
    provider = AiProvider(
        name=name,
        base_url=base_url,
        credential_enc=encrypt_credential("fb-secret"),
        status=status,
        enabled=provider_enabled,
    )
    db.add(provider)
    await db.flush()
    db.add(
        AiModelUpstream(
            model_id=model.id,
            provider_id=provider.id,
            upstream_id=upstream_id,
            rank=rank,
            enabled=enabled,
            hpp_usd_per_1m_in=hpp_in,
            hpp_usd_per_1m_out=hpp_out,
            max_tokens_cap=max_tokens_cap,
        )
    )
    await db.commit()
    return provider


async def _create_key(ac: AsyncClient, owner: User, org_id: uuid.UUID) -> str:
    created = await ac.post("/api/ai/keys", headers=_auth(owner, org_id), json={"name": "failover"})
    assert created.status_code == 201, created.text
    return str(created.json()["key"])


async def _get_models(
    db_session: AsyncSession,
    ctx,
    *,
    allowed_model_ids: list[str] | None = None,
) -> httpx.Response:
    from app.models.ai_gateway import AiApiKey

    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            created = await ac.post("/api/ai/keys", headers=_auth(owner, org.id), json={"name": "models"})
            assert created.status_code == 201, created.text
            plain = str(created.json()["key"])
            if allowed_model_ids is not None:
                key = await db_session.get(AiApiKey, uuid.UUID(created.json()["id"]))
                assert key is not None
                key.allowed_model_ids = allowed_model_ids
                await db_session.commit()
            return await ac.get(MODELS_PATH, headers=_key_headers(plain))
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _wallet_balance(db: AsyncSession, org_id: uuid.UUID) -> int:
    value = (await db.execute(select(AiWallet.balance_idr).where(AiWallet.organization_id == org_id))).scalar_one()
    return int(value)


async def _ledger_rows(db: AsyncSession, org_id: uuid.UUID) -> list[AiWalletLedger]:
    return list(
        (await db.execute(select(AiWalletLedger).where(AiWalletLedger.organization_id == org_id))).scalars().all()
    )


async def _usage_events(db: AsyncSession, org_id: uuid.UUID) -> list[AiUsageEvent]:
    return list((await db.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org_id))).scalars().all())


def _attempt_total(model: str, outcome: str, reason: str) -> float:
    value = REGISTRY.get_sample_value(
        "vuln_ai_upstream_attempts_total",
        {"model": model, "outcome": outcome, "reason": reason},
    )
    return float(value or 0.0)


@pytest.mark.asyncio
async def test_v1_failover_on_5xx_serves_secondary(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    fallback = await _add_fallback(db_session, ctx["model"], hpp_in=Decimal("5"), hpp_out=Decimal("10"))
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 2
    second = mock_client.post.call_args_list[1]
    assert second.args[0] == "https://fallback.example/v1/chat/completions"
    assert second.kwargs["json"]["model"] == "fb-upstream"

    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    event = events[0]
    assert event.provider_id == fallback.id
    assert event.hpp_usd_per_1m_in == Decimal("5.000000")
    assert event.price_usd_per_1m_in == Decimal("62.500000")
    assert event.billed_idr > 0


@pytest.mark.asyncio
async def test_v1_failover_on_401(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    fallback = await _add_fallback(db_session, ctx["model"], hpp_in=Decimal("5"), hpp_out=Decimal("10"))
    mock_client = _post_client(_UpstreamResponse(401), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 2
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].provider_id == fallback.id
    assert events[0].billed_idr > 0


@pytest.mark.asyncio
async def test_v1_no_failover_on_400(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(400), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 400, chat.text
    assert mock_client.post.call_count == 1
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].billed_idr == 0


@pytest.mark.asyncio
async def test_v1_failover_all_fail_releases_hold(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    # Price the model so the reservation hold is the entire 50_000 balance: a full release is 50_000.
    ctx["model"].price_idr_per_1k_in = 0
    ctx["model"].price_idr_per_1k_out = 500_000
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(503))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 502, chat.text
    assert await _wallet_balance(db_session, org.id) == 50_000
    ledger = await _ledger_rows(db_session, org.id)
    releases = [row for row in ledger if row.kind == "release"]
    assert len(releases) == 1
    assert releases[0].delta_idr == 50_000
    assert len(await _usage_events(db_session, org.id)) == 1
    for leaked in ("wholesale", "fallback.example", "fb-secret", "fb-upstream"):
        assert leaked not in chat.text


@pytest.mark.asyncio
async def test_v1_failover_respects_kill_switch(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_enabled", False)
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 502, chat.text
    assert mock_client.post.call_count == 1


@pytest.mark.asyncio
async def test_v1_failover_skips_disabled_candidate(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"], status="disabled")
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 502, chat.text
    assert mock_client.post.call_count == 1


@pytest.mark.asyncio
async def test_v1_failover_ledger_sum_matches_balance(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    # The fixture seeds the balance without a ledger row; add the opening entry so the ledger describes it.
    db_session.add(AiWalletLedger(organization_id=org.id, kind="opening", delta_idr=50_000, balance_after_idr=50_000))
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"], hpp_in=Decimal("5"), hpp_out=Decimal("10"))
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    total = (
        await db_session.execute(
            select(func.coalesce(func.sum(AiWalletLedger.delta_idr), 0)).where(AiWalletLedger.organization_id == org.id)
        )
    ).scalar_one()
    assert int(total) == await _wallet_balance(db_session, org.id)


@pytest.mark.asyncio
async def test_v1_stream_failover_before_first_byte(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    fallback = await _add_fallback(db_session, ctx["model"])
    content_chunk = b'data: {"id":"s1","choices":[{"delta":{"content":"hello"}}]}\n\n'
    mock_client = _stream_client(_FakeStreamResponse(503), _FakeStreamResponse(200, [content_chunk]))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body(stream=True))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert mock_client.stream.call_count == 2
    assert "hello" in chat.text
    assert "data: [DONE]" in chat.text
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].provider_id == fallback.id


@pytest.mark.asyncio
async def test_v1_stream_no_failover_after_first_byte(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"])
    content_chunk = b'data: {"id":"s1","choices":[{"delta":{"content":"hello"}}]}\n\n'
    mock_client = _stream_client(_FakeStreamResponse(200, [content_chunk], raise_after=True))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body(stream=True))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert mock_client.stream.call_count == 1
    assert "Upstream provider error" in chat.text
    assert "data: [DONE]" in chat.text
    assert await _wallet_balance(db_session, org.id) == 50_000
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].billed_idr == 0


@pytest.mark.asyncio
async def test_v1_single_reserve_ledger_row(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"], hpp_in=Decimal("5"), hpp_out=Decimal("10"))
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    ledger = await _ledger_rows(db_session, org.id)
    assert len([row for row in ledger if row.kind == "reserve"]) == 1


@pytest.mark.asyncio
async def test_v1_primary_disabled_falls_back(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    fallback = await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args.args[0] == "https://fallback.example/v1/chat/completions"
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].provider_id == fallback.id


@pytest.mark.asyncio
async def test_v1_no_usable_candidate_404(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    mock_client = _post_client()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 404, chat.text
    # The route rewrites HTTPException(detail=...) into a machine-readable error code.
    assert chat.json()["error"]["code"] == "model_not_found"
    assert mock_client.post.call_count == 0


@pytest.mark.asyncio
async def test_v1_failover_deadline_exhausted(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_deadline_seconds", -1.0)
    owner = ctx["owner"]
    org = ctx["org"]
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 502, chat.text
    assert mock_client.post.call_count == 1


@pytest.mark.asyncio
async def test_v1_insufficient_balance_402_no_ledger(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    wallet = (await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))).scalar_one()
    wallet.balance_idr = 0
    await db_session.commit()
    mock_client = _post_client()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 402, chat.text
    assert await _ledger_rows(db_session, org.id) == []
    assert await _usage_events(db_session, org.id) == []


@pytest.mark.asyncio
async def test_v1_failover_metric_records_served_and_retried(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    public_id = ctx["model"].public_id
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))
    served_before = _attempt_total(public_id, "served", "none")
    retried_before = _attempt_total(public_id, "retried", "server_error")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert _attempt_total(public_id, "served", "none") - served_before == pytest.approx(1.0)
    assert _attempt_total(public_id, "retried", "server_error") - retried_before == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_v1_failover_metric_records_failed_when_all_candidates_fail(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    public_id = ctx["model"].public_id
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(503))
    failed_before = _attempt_total(public_id, "failed", "server_error")
    retried_before = _attempt_total(public_id, "retried", "server_error")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 502, chat.text
    assert _attempt_total(public_id, "failed", "server_error") - failed_before == pytest.approx(1.0)
    assert _attempt_total(public_id, "retried", "server_error") - retried_before == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_v1_metric_records_rejected_on_client_error(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    public_id = ctx["model"].public_id
    await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(400), _UpstreamResponse(200, _chat_payload()))
    rejected_before = _attempt_total(public_id, "rejected", "client_error")
    retried_before = _attempt_total(public_id, "retried", "client_error")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body())
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 400, chat.text
    assert _attempt_total(public_id, "rejected", "client_error") - rejected_before == pytest.approx(1.0)
    assert _attempt_total(public_id, "retried", "client_error") - retried_before == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_v1_stream_metric_records_served_after_failover(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    public_id = ctx["model"].public_id
    await _add_fallback(db_session, ctx["model"])
    chunk = b'data: {"id":"s1","choices":[{"delta":{"content":"hello"}}]}\n\n'
    mock_client = _stream_client(_FakeStreamResponse(503), _FakeStreamResponse(200, [chunk]))
    served_before = _attempt_total(public_id, "served", "none")
    retried_before = _attempt_total(public_id, "retried", "server_error")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body(stream=True))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert "hello" in chat.text
    assert _attempt_total(public_id, "served", "none") - served_before == pytest.approx(1.0)
    assert _attempt_total(public_id, "retried", "server_error") - retried_before == pytest.approx(1.0)


def test_attempt_timeout_clamps_to_remaining_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_deadline_seconds", 100.0)
    monkeypatch.setattr(settings, "ai_upstream_timeout_seconds", 120.0)
    monkeypatch.setattr(settings, "ai_upstream_connect_timeout_seconds", 10.0)

    fresh = _attempt_timeout(time.monotonic(), streaming=False)
    assert fresh.read == pytest.approx(100.0, abs=1.0)
    assert fresh.connect == pytest.approx(10.0)

    nearly_spent = _attempt_timeout(time.monotonic() - 90.0, streaming=False)
    assert nearly_spent.read == pytest.approx(10.0, abs=1.0)
    assert nearly_spent.read < 120.0


def test_attempt_timeout_uses_an_explicit_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_timeout_seconds", 120.0)
    monkeypatch.setattr(settings, "ai_upstream_connect_timeout_seconds", 10.0)

    timeout = _attempt_timeout(time.monotonic(), streaming=False, deadline=12.0)
    assert timeout.read == pytest.approx(12.0, abs=0.5)
    assert timeout.read < settings.ai_upstream_timeout_seconds


def test_attempt_timeout_streaming_uses_idle_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_deadline_seconds", 100.0)
    monkeypatch.setattr(settings, "ai_upstream_stream_idle_timeout_seconds", 45.0)

    timeout = _attempt_timeout(time.monotonic(), streaming=True)
    assert timeout.read == pytest.approx(45.0)
    assert timeout.read < settings.ai_upstream_failover_deadline_seconds


def test_can_retry_requires_enough_budget_left(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_deadline_seconds", 100.0)
    monkeypatch.setattr(settings, "ai_upstream_min_attempt_seconds", 5.0)
    candidates = [
        UpstreamCandidate(uuid.uuid4(), "a", "https://a/v1", "Authorization", "c", None, None, None, "ok"),
        UpstreamCandidate(uuid.uuid4(), "b", "https://b/v1", "Authorization", "c", None, None, None, "ok"),
    ]

    assert _can_retry(0, candidates, time.monotonic()) is True
    assert _can_retry(0, candidates, time.monotonic() - 97.0) is False
    assert _can_retry(1, candidates, time.monotonic()) is False


@pytest.mark.asyncio
async def test_post_with_failover_passes_clamped_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_deadline_seconds", 100.0)
    mock_client = _post_client(_UpstreamResponse(200, _chat_payload()))
    candidate = UpstreamCandidate(
        uuid.uuid4(), "a", "https://a/v1", "Authorization", encrypt_credential("secret"), None, None, None, "ok"
    )

    with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
        await _post_with_failover([candidate], {"max_tokens": 8}, time.monotonic(), public_id="sinexis/test")

    passed = mock_client.post.call_args.kwargs["timeout"]
    assert isinstance(passed, httpx.Timeout)
    assert passed.read == pytest.approx(100.0, abs=1.0)


@pytest.mark.asyncio
async def test_v1_stream_failover_when_primary_stalls_before_first_byte(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    fallback = await _add_fallback(db_session, ctx["model"])
    chunk = b'data: {"id":"s1","choices":[{"delta":{"content":"hello"}}]}\n\n'
    mock_client = _stream_client(
        _FakeStreamResponse(200, raise_before=True),
        _FakeStreamResponse(200, [chunk]),
    )

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body(stream=True))
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert chat.status_code == 200, chat.text
    assert "hello" in chat.text
    assert mock_client.stream.call_count == 2
    events = await _usage_events(db_session, org.id)
    assert len(events) == 1
    assert events[0].provider_id == fallback.id


# --- AI gateway provider circuit breaker ------------------------------------


def _breaker_key(template: str, provider_id: uuid.UUID) -> str:
    return template.format(provider_id=provider_id)


async def _chat_with_mock(db_session: AsyncSession, ctx, mock_client: AsyncMock, *, stream: bool = False) -> object:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                return await ac.post(CHAT_PATH, headers=_key_headers(plain), json=_chat_body(stream=stream))
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_v1_breaker_skips_provider_after_repeated_failures(
    db_session: AsyncSession, ctx, _breaker_redis: FakeAsyncRedis
) -> None:
    org = ctx["org"]
    primary_id = ctx["model"].provider_id
    fallback = await _add_fallback(db_session, ctx["model"])
    for _ in range(settings.ai_breaker_failure_threshold):
        await ai_breaker.record_failure(primary_id, "server_error")
    mock_client = _post_client(_UpstreamResponse(200, _chat_payload()))

    chat = await _chat_with_mock(db_session, ctx, mock_client)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args.args[0] == "https://fallback.example/v1/chat/completions"
    events = await _usage_events(db_session, org.id)
    assert events[0].provider_id == fallback.id


@pytest.mark.asyncio
async def test_v1_breaker_records_success_and_failure(
    db_session: AsyncSession, ctx, _breaker_redis: FakeAsyncRedis
) -> None:
    primary_id = ctx["model"].provider_id
    fallback = await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(503), _UpstreamResponse(200, _chat_payload()))

    chat = await _chat_with_mock(db_session, ctx, mock_client)

    assert chat.status_code == 200, chat.text
    fails_key = _breaker_key(ai_breaker.FAILS_KEY_TEMPLATE, primary_id)
    assert int(_breaker_redis.store.get(fails_key, "0")) >= 1
    assert _breaker_key(ai_breaker.FAILS_KEY_TEMPLATE, fallback.id) not in _breaker_redis.store
    assert _breaker_key(ai_breaker.OPEN_KEY_TEMPLATE, fallback.id) not in _breaker_redis.store


@pytest.mark.asyncio
async def test_v1_client_error_does_not_open_breaker(
    db_session: AsyncSession, ctx, _breaker_redis: FakeAsyncRedis
) -> None:
    primary_id = ctx["model"].provider_id
    fallback = await _add_fallback(db_session, ctx["model"])
    mock_client = _post_client(_UpstreamResponse(400))

    chat = await _chat_with_mock(db_session, ctx, mock_client)

    assert chat.status_code == 400, chat.text
    assert mock_client.post.call_count == 1
    for provider_id in (primary_id, fallback.id):
        assert _breaker_key(ai_breaker.FAILS_KEY_TEMPLATE, provider_id) not in _breaker_redis.store
        assert _breaker_key(ai_breaker.OPEN_KEY_TEMPLATE, provider_id) not in _breaker_redis.store


@pytest.mark.asyncio
async def test_v1_all_breakers_open_still_calls_primary(
    db_session: AsyncSession, ctx, _breaker_redis: FakeAsyncRedis
) -> None:
    primary_id = ctx["model"].provider_id
    fallback = await _add_fallback(db_session, ctx["model"])
    for provider_id in (primary_id, fallback.id):
        for _ in range(settings.ai_breaker_failure_threshold):
            await ai_breaker.record_failure(provider_id, "server_error")
    mock_client = _post_client(_UpstreamResponse(200, _chat_payload()))

    chat = await _chat_with_mock(db_session, ctx, mock_client)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args.args[0] == "https://wholesale.example/v1/chat/completions"


@pytest.mark.asyncio
async def test_v1_degraded_primary_is_ordered_behind_healthy_fallback(
    db_session: AsyncSession, ctx, _breaker_redis: FakeAsyncRedis
) -> None:
    model = ctx["model"]
    provider = await db_session.get(AiProvider, model.provider_id)
    assert provider is not None
    provider.status = "degraded"
    await db_session.commit()
    fallback = await _add_fallback(db_session, model)
    mock_client = _post_client(_UpstreamResponse(200, _chat_payload()))

    chat = await _chat_with_mock(db_session, ctx, mock_client)

    assert chat.status_code == 200, chat.text
    assert mock_client.post.call_count == 1
    assert mock_client.post.call_args.args[0] == "https://fallback.example/v1/chat/completions"
    events = await _usage_events(db_session, ctx["org"].id)
    assert events[0].provider_id == fallback.id


@pytest.mark.asyncio
async def test_v1_models_lists_a_healthy_model(db_session: AsyncSession, ctx) -> None:
    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [m["id"] for m in body["data"]] == ["sinexis/test"]
    assert all(m["object"] == "model" and m["owned_by"] == "sinexis" for m in body["data"])


@pytest.mark.asyncio
async def test_v1_models_hides_model_whose_only_provider_is_disabled(db_session: AsyncSession, ctx) -> None:
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()

    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


@pytest.mark.asyncio
async def test_v1_models_lists_model_with_a_usable_fallback(db_session: AsyncSession, ctx) -> None:
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"])

    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["data"]] == ["sinexis/test"]


@pytest.mark.asyncio
async def test_v1_models_hides_disabled_fallback_only_model(db_session: AsyncSession, ctx) -> None:
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"], status="disabled")

    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


@pytest.mark.asyncio
async def test_v1_models_ignores_failover_when_disabled(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_enabled", False)
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"])

    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


@pytest.mark.asyncio
async def test_v1_models_respects_allowed_model_ids(db_session: AsyncSession, ctx) -> None:
    response = await _get_models(db_session, ctx, allowed_model_ids=["other/alias"])

    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


@pytest.mark.asyncio
async def test_v1_models_skips_a_disabled_model_row(db_session: AsyncSession, ctx) -> None:
    ctx["model"].enabled = False
    await db_session.commit()

    response = await _get_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["data"] == []


async def _get_public_models(db_session: AsyncSession, ctx) -> httpx.Response:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            return await ac.get("/api/ai/models", headers=_auth(owner, org.id))
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_public_models_lists_a_healthy_model(db_session: AsyncSession, ctx, ai_on) -> None:
    response = await _get_public_models(db_session, ctx)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [m["public_id"] for m in body["items"]] == ["sinexis/test"]
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_public_models_hides_model_whose_only_provider_is_disabled(db_session: AsyncSession, ctx, ai_on) -> None:
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()

    response = await _get_public_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_public_models_lists_model_with_a_usable_fallback(db_session: AsyncSession, ctx, ai_on) -> None:
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"])

    response = await _get_public_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert [m["public_id"] for m in response.json()["items"]] == ["sinexis/test"]


@pytest.mark.asyncio
async def test_public_models_ignores_failover_when_disabled(
    db_session: AsyncSession, ctx, ai_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_upstream_failover_enabled", False)
    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()
    await _add_fallback(db_session, ctx["model"])

    response = await _get_public_models(db_session, ctx)

    assert response.status_code == 200, response.text
    assert response.json()["items"] == []


async def _both_catalog_ids(db_session: AsyncSession, ctx) -> tuple[set[str], set[str]]:
    v1 = await _get_models(db_session, ctx)
    spa = await _get_public_models(db_session, ctx)
    assert v1.status_code == 200, v1.text
    assert spa.status_code == 200, spa.text
    return {m["id"] for m in v1.json()["data"]}, {m["public_id"] for m in spa.json()["items"]}


@pytest.mark.asyncio
async def test_catalogs_never_disagree(db_session: AsyncSession, ctx, ai_on) -> None:
    """Both catalogs and routing must share one definition of a servable model.

    They drifted twice: /v1/models kept a model whose provider was disabled (#1170),
    then /api/ai/models did the same (#1172). Asserting equality here fails whichever
    of the two re-introduces a private filter.
    """
    v1_ids, spa_ids = await _both_catalog_ids(db_session, ctx)
    assert v1_ids == spa_ids == {"sinexis/test"}

    primary = await db_session.get(AiProvider, ctx["model"].provider_id)
    assert primary is not None
    primary.status = "disabled"
    await db_session.commit()

    v1_ids, spa_ids = await _both_catalog_ids(db_session, ctx)
    assert v1_ids == spa_ids == set()

    await _add_fallback(db_session, ctx["model"])
    db_session.expire(ctx["model"], ["upstreams"])

    v1_ids, spa_ids = await _both_catalog_ids(db_session, ctx)
    assert v1_ids == spa_ids == {"sinexis/test"}


# --- Customer trial chat (keyless, org wallet) ------------------------------


@pytest.mark.asyncio
async def test_org_trial_chat_spends_wallet_and_records_usage(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    wallet = (await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))).scalar_one()
    before = wallet.balance_idr

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "id": "chatcmpl-trial",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "pong"}}],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 5,
                    "prompt_tokens_details": {"cached_tokens": 6},
                },
            }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_Resp())
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/api/ai/chat",
                    headers=_auth(owner, org.id),
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "ping"}]},
                )
            assert chat.status_code == 200, chat.text
            assert "hidden-upstream" not in chat.text

            usage = await ac.get("/api/ai/usage", headers=_auth(owner, org.id))
            assert usage.status_code == 200, usage.text
            item = usage.json()["items"][0]
            assert item["source"] == "customer_trial"
            assert item["prompt_tokens"] == 10
            assert item["completion_tokens"] == 5
            assert item["cached_tokens"] == 6
            assert item["http_status"] == 200
            assert "ttft_ms" in item
            assert "tps" in item
    finally:
        app.dependency_overrides.pop(get_db, None)

    event = (await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org.id))).scalar_one()
    assert event.source == "customer_trial"
    assert event.key_id is None
    assert event.user_id == owner.id
    assert event.cached_tokens == 6
    assert event.http_status == 200
    await db_session.refresh(wallet)
    assert wallet.balance_idr < before


@pytest.mark.asyncio
async def test_org_trial_chat_releases_hold_on_upstream_failure(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]
    wallet = (await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))).scalar_one()
    before = wallet.balance_idr

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    mock_client = _post_client(_UpstreamResponse(503))
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    "/api/ai/chat",
                    headers=_auth(owner, org.id),
                    json={"model": "sinexis/test", "messages": [{"role": "user", "content": "ping"}]},
                )
            assert chat.status_code == 502, chat.text
    finally:
        app.dependency_overrides.pop(get_db, None)

    await db_session.refresh(wallet)
    assert wallet.balance_idr == before
    event = (await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org.id))).scalar_one()
    assert event.http_status == 503
    assert event.billed_idr == 0


def test_usage_schema_derives_tps_from_generation_window() -> None:
    from datetime import UTC, datetime

    from app.schemas.ai_gateway import AiUsageOut

    row = AiUsageOut(
        id=uuid.uuid4(),
        organization_id=None,
        source="customer",
        model_public_id="sinexis/test",
        prompt_tokens=10,
        completion_tokens=80,
        cached_tokens=4,
        ttft_ms=200,
        billed_idr=10,
        latency_ms=1200,
        http_status=200,
        finish_reason="stop",
        created_at=datetime.now(UTC),
    )
    assert row.tps == 80.0


def test_cached_tokens_reads_provider_variants() -> None:
    from app.services.ai_proxy import _cached_tokens_from_payload

    assert _cached_tokens_from_payload({"usage": {"prompt_tokens_details": {"cached_tokens": 7}}}) == 7
    assert _cached_tokens_from_payload({"usage": {"prompt_cache_hit_tokens": 3}}) == 3
    assert _cached_tokens_from_payload({"usage": {"cache_read_input_tokens": 2}}) == 2
    assert _cached_tokens_from_payload({"usage": {"prompt_tokens": 9}}) == 0


@pytest.mark.asyncio
async def test_v1_stream_records_cache_hits_and_ttft(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    chunks = [
        b'data: {"choices":[{"delta":{"content":"he"},"finish_reason":null}]}\n\n',
        b'data: {"choices":[{"delta":{"content":"llo"},"finish_reason":"stop"}],'
        b'"usage":{"prompt_tokens":10,"completion_tokens":2,'
        b'"prompt_tokens_details":{"cached_tokens":4}}}\n\n',
        b"data: [DONE]\n\n",
    ]
    mock_client = _stream_client(_FakeStreamResponse(200, chunks=chunks))
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            plain = await _create_key(ac, owner, org.id)
            with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
                chat = await ac.post(
                    CHAT_PATH,
                    headers=_key_headers(plain),
                    json=_chat_body(stream=True),
                )
            assert chat.status_code == 200, chat.text
            assert "[DONE]" in chat.text
    finally:
        app.dependency_overrides.pop(get_db, None)

    event = (await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.organization_id == org.id))).scalar_one()
    assert event.cached_tokens == 4
    assert event.ttft_ms is not None
    assert event.ttft_ms >= 0
    assert event.latency_ms is not None
