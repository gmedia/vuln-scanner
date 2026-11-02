from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.models.ai_gateway import AiModel, AiUsageEvent
from app.services.ai_crypto import decrypt_credential, encrypt_credential

API_HEADERS = {"X-API-Key": settings.api_key, "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def engine():
    """Shadow conftest's engine with SQLite FK enforcement so ON DELETE CASCADE
    actually fires — the default SQLite behaviour would leave orphaned rows."""
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    @event.listens_for(test_engine.sync_engine, "connect")
    def _enable_sqlite_fks(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    yield test_engine
    await test_engine.dispose()


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


def test_ai_gateway_disabled_404(client) -> None:
    r = client.get("/api/admin/ai/providers", headers=API_HEADERS)
    assert r.status_code == 404
    r = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={"name": "x", "base_url": "https://api.example/v1", "credential": "k"},
    )
    assert r.status_code == 404
    assert client.post("/api/admin/ai/chat", headers=API_HEADERS, json={"model": "x"}).status_code == 404


def test_encrypt_roundtrip() -> None:
    token = encrypt_credential("sk-wholesale")
    assert token != "sk-wholesale"
    assert decrypt_credential(token) == "sk-wholesale"
    assert encrypt_credential("") == ""
    assert decrypt_credential("") == ""
    with pytest.raises(ValueError):
        decrypt_credential("not-a-fernet-token")


def test_provider_model_crud(client, ai_on) -> None:
    created = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={
            "name": "OpenRouter",
            "base_url": "https://openrouter.ai/api/v1",
            "credential": "sk-or-v1-secret",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["credential_set"] is True
    assert "credential" not in body
    assert "sk-or" not in created.text
    pid = body["id"]

    listed = client.get("/api/admin/ai/providers", headers=API_HEADERS)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    patched_p = client.patch(
        f"/api/admin/ai/providers/{pid}",
        headers=API_HEADERS,
        json={"status": "degraded", "name": "OR"},
    )
    assert patched_p.status_code == 200
    assert patched_p.json()["status"] == "degraded"
    assert patched_p.json()["name"] == "OR"

    bad_status = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={
            "name": "bad",
            "base_url": "https://api.example/v1",
            "credential": "k",
            "status": "nope",
        },
    )
    assert bad_status.status_code == 422

    missing_provider = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": "00000000-0000-0000-0000-000000000001",
            "public_id": "sinexis/missing",
            "upstream_id": "x",
            "price_idr_per_1k_in": 1,
            "price_idr_per_1k_out": 1,
        },
    )
    assert missing_provider.status_code == 422

    model = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/qwen-72b",
            "upstream_id": "qwen/qwen-2.5-72b",
            "price_idr_per_1k_in": 100,
            "price_idr_per_1k_out": 200,
        },
    )
    assert model.status_code == 201, model.text
    mid = model.json()["id"]
    assert model.json()["public_id"] == "sinexis/qwen-72b"

    patched = client.patch(
        f"/api/admin/ai/models/{mid}",
        headers=API_HEADERS,
        json={"enabled": False},
    )
    assert patched.status_code == 200
    assert patched.json()["enabled"] is False

    clash = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/qwen-72b",
            "upstream_id": "other",
            "price_idr_per_1k_in": 1,
            "price_idr_per_1k_out": 1,
        },
    )
    assert clash.status_code == 409

    other = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/other",
            "upstream_id": "other",
            "price_idr_per_1k_in": 1,
            "price_idr_per_1k_out": 1,
        },
    )
    assert other.status_code == 201
    oid = other.json()["id"]

    listed_m = client.get(f"/api/admin/ai/models?provider_id={pid}", headers=API_HEADERS)
    assert listed_m.status_code == 200
    assert listed_m.json()["total"] == 2

    rename_clash = client.patch(
        f"/api/admin/ai/models/{oid}",
        headers=API_HEADERS,
        json={"public_id": "sinexis/qwen-72b"},
    )
    assert rename_clash.status_code == 409

    missing_uuid = "00000000-0000-0000-0000-000000000099"
    missing_provider = client.patch(
        f"/api/admin/ai/providers/{missing_uuid}",
        headers=API_HEADERS,
        json={"name": "x"},
    )
    assert missing_provider.status_code == 404
    assert (
        client.patch(
            f"/api/admin/ai/providers/{pid}",
            headers=API_HEADERS,
            json={"status": "nope"},
        ).status_code
        == 422
    )
    cred = client.patch(
        f"/api/admin/ai/providers/{pid}",
        headers=API_HEADERS,
        json={
            "base_url": "https://example.com/v1/",
            "auth_header": "X-Api-Key",
            "credential": "new-secret",
            "enabled": False,
        },
    )
    assert cred.status_code == 200
    assert cred.json()["base_url"] == "https://example.com/v1"
    assert cred.json()["auth_header"] == "X-Api-Key"
    assert cred.json()["enabled"] is False
    assert "new-secret" not in cred.text

    missing_model = client.patch(
        f"/api/admin/ai/models/{missing_uuid}",
        headers=API_HEADERS,
        json={"enabled": True},
    )
    assert missing_model.status_code == 404
    assert client.delete(f"/api/admin/ai/models/{missing_uuid}", headers=API_HEADERS).status_code == 404
    assert client.delete(f"/api/admin/ai/providers/{missing_uuid}", headers=API_HEADERS).status_code == 404

    assert client.delete(f"/api/admin/ai/models/{mid}", headers=API_HEADERS).status_code == 204
    assert client.delete(f"/api/admin/ai/models/{oid}", headers=API_HEADERS).status_code == 204
    assert client.delete(f"/api/admin/ai/providers/{pid}", headers=API_HEADERS).status_code == 204


def test_delete_provider_cascades_models(client, ai_on) -> None:
    # ai_models.provider_id has ON DELETE CASCADE but is nullable=False; without
    # passive_deletes=True the ORM tried to NULL the child FK and raised IntegrityError (500).
    created = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={
            "name": "Cascade",
            "base_url": "https://api.example/v1",
            "credential": "k",
        },
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]

    model = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/cascade",
            "upstream_id": "cascade-up",
            "price_idr_per_1k_in": 1,
            "price_idr_per_1k_out": 1,
        },
    )
    assert model.status_code == 201, model.text

    deleted = client.delete(f"/api/admin/ai/providers/{pid}", headers=API_HEADERS)
    assert deleted.status_code == 204, deleted.text

    listed = client.get(f"/api/admin/ai/models?provider_id={pid}", headers=API_HEADERS)
    assert listed.status_code == 200
    assert listed.json()["total"] == 0


def test_admin_trial_chat_stream_rejected_and_ok(client, ai_on) -> None:
    created = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={
            "name": "OR",
            "base_url": "https://openrouter.ai/api/v1",
            "credential": "sk-or-v1-secret",
        },
    )
    pid = created.json()["id"]
    mid = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/trial",
            "upstream_id": "hidden-up",
            "price_idr_per_1k_in": 100,
            "price_idr_per_1k_out": 200,
            "hpp_usd_per_1k_in": 1,
            "hpp_usd_per_1k_out": 2,
        },
    ).json()["id"]
    stream = client.post(
        "/api/admin/ai/chat",
        headers=API_HEADERS,
        json={"model": "sinexis/trial", "stream": True, "messages": [{"role": "user", "content": "x"}]},
    )
    assert stream.status_code == 400

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "id": "chatcmpl-admin",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "pong"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_Resp())
    with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
        ok = client.post(
            "/api/admin/ai/chat",
            headers=API_HEADERS,
            json={"model": "sinexis/trial", "messages": [{"role": "user", "content": "ping"}]},
        )
    assert ok.status_code == 200, ok.text
    assert "sk-or" not in ok.text
    assert "hidden-up" not in ok.text
    usage = client.get("/api/admin/ai/usage", headers=API_HEADERS)
    assert usage.status_code == 200
    items = usage.json()["items"]
    assert items
    assert items[0].get("request_payload") is not None
    assert items[0]["request_payload"].get("model") == "sinexis/trial"
    assert items[0].get("response_payload", {}).get("id") == "chatcmpl-admin"
    assert client.delete(f"/api/admin/ai/models/{mid}", headers=API_HEADERS).status_code == 204
    assert client.delete(f"/api/admin/ai/providers/{pid}", headers=API_HEADERS).status_code == 204


@pytest.mark.asyncio
async def test_admin_usage_paginated(client, db_session, ai_on) -> None:
    now = datetime.now(UTC)
    for i in range(3):
        db_session.add(
            AiUsageEvent(
                source="admin_trial",
                model_public_id=f"sinexis/page-{i}",
                prompt_tokens=1,
                completion_tokens=1,
                billed_idr=i,
                created_at=now + timedelta(seconds=i),
            )
        )
    await db_session.commit()
    first = client.get("/api/admin/ai/usage?page=1&limit=2", headers=API_HEADERS)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["items"][0]["model_public_id"] == "sinexis/page-2"
    second = client.get("/api/admin/ai/usage?page=2&limit=2", headers=API_HEADERS)
    assert second.status_code == 200
    page_two = second.json()
    assert page_two["total"] == 3
    assert len(page_two["items"]) == 1
    assert page_two["items"][0]["model_public_id"] == "sinexis/page-0"


def _trial_model(client, public_id: str) -> str:
    pid = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={"name": "Trial", "base_url": "https://openrouter.ai/api/v1", "credential": "sk-or-v1-secret"},
    ).json()["id"]
    return client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": public_id,
            "upstream_id": "hidden-up",
            "price_idr_per_1k_in": 100,
            "price_idr_per_1k_out": 200,
            "hpp_usd_per_1k_in": 1,
            "hpp_usd_per_1k_out": 2,
        },
    ).json()["id"]


@pytest.mark.asyncio
async def test_admin_trial_cap_uses_cogs_usd(client, db_session, ai_on) -> None:
    _trial_model(client, "sinexis/trial-usd")
    db_session.add(
        AiUsageEvent(
            source="admin_trial",
            model_public_id="sinexis/old",
            prompt_tokens=0,
            completion_tokens=0,
            billed_idr=0,
            cogs_idr=0,
            cogs_usd=Decimal("40"),
            created_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    blocked = client.post(
        "/api/admin/ai/chat",
        headers=API_HEADERS,
        json={"model": "sinexis/trial-usd", "messages": [{"role": "user", "content": "x"}]},
    )
    assert blocked.status_code == 402


@pytest.mark.asyncio
async def test_admin_trial_cap_uses_legacy_cogs_idr_fallback(client, db_session, ai_on) -> None:
    _trial_model(client, "sinexis/trial-legacy")
    db_session.add(
        AiUsageEvent(
            source="admin_trial",
            model_public_id="sinexis/old",
            prompt_tokens=0,
            completion_tokens=0,
            billed_idr=0,
            cogs_idr=600_000,
            created_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    blocked = client.post(
        "/api/admin/ai/chat",
        headers=API_HEADERS,
        json={"model": "sinexis/trial-legacy", "messages": [{"role": "user", "content": "x"}]},
    )
    assert blocked.status_code == 402


@pytest.mark.asyncio
async def test_admin_trial_post_response_over_cap_bills_zero_but_records_cost(
    client, db_session, ai_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    mid = _trial_model(client, "sinexis/trial-zero")
    monkeypatch.setattr("app.services.ai_proxy.trial_cap_usd", lambda: Decimal("0.0000001"))

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "id": "chatcmpl-over",
                "choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": "pong"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_Resp())
    with patch("app.services.ai_proxy.httpx.AsyncClient", return_value=mock_client):
        ok = client.post(
            "/api/admin/ai/chat",
            headers=API_HEADERS,
            json={"model": "sinexis/trial-zero", "messages": [{"role": "user", "content": "ping"}]},
        )
    assert ok.status_code == 200, ok.text

    event = (
        await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.model_public_id == "sinexis/trial-zero"))
    ).scalar_one()
    assert event.billed_idr == 0
    assert event.billed_usd is not None and event.billed_usd > 0
    assert event.cogs_usd is not None and event.cogs_usd > 0
    assert event.cogs_idr > 0
    assert client.delete(f"/api/admin/ai/models/{mid}", headers=API_HEADERS).status_code == 204


def _provider(client) -> str:
    return client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={"name": "USD", "base_url": "https://usd.example/v1", "credential": "k"},
    ).json()["id"]


@pytest.mark.asyncio
async def test_create_model_with_usd_writes_canonical_and_derived_legacy(client, db_session, ai_on) -> None:
    pid = _provider(client)
    response = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/usd-create",
            "upstream_id": "usd-up",
            "price_usd_per_1m_in": 0.15,
            "price_usd_per_1m_out": 0.6,
            "hpp_usd_per_1m_in": 0.075,
            "hpp_usd_per_1m_out": 0.3,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["price_usd_per_1m_in"] == 0.15
    assert body["price_usd_per_1m_out"] == 0.6
    assert body["price_idr_per_1k_in"] == 2
    assert body["price_idr_per_1k_out"] == 10
    assert body["hpp_usd_per_1m_in"] == 0.075
    assert body["hpp_usd_per_1m_out"] == 0.3

    row = (await db_session.execute(select(AiModel).where(AiModel.id == UUID(body["id"])))).scalar_one()
    assert row.price_usd_per_1m_in == Decimal("0.150000")
    assert row.price_usd_per_1m_out == Decimal("0.600000")
    assert row.price_idr_per_1k_in == 2
    assert row.price_idr_per_1k_out == 10


@pytest.mark.asyncio
async def test_create_model_legacy_only_is_converted_to_usd(client, db_session, ai_on) -> None:
    pid = _provider(client)
    response = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/legacy-create",
            "upstream_id": "legacy-up",
            "price_idr_per_1k_in": 1000,
            "price_idr_per_1k_out": 2000,
            "hpp_usd_per_1k_in": 1,
            "hpp_usd_per_1k_out": 2,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["price_usd_per_1m_in"] == 62.5
    assert body["price_usd_per_1m_out"] == 125.0
    assert body["price_idr_per_1k_in"] == 1000
    assert body["price_idr_per_1k_out"] == 2000
    assert body["hpp_usd_per_1m_in"] == 1000.0
    assert body["hpp_usd_per_1m_out"] == 2000.0

    row = (await db_session.execute(select(AiModel).where(AiModel.id == UUID(body["id"])))).scalar_one()
    assert row.price_usd_per_1m_in == Decimal("62.500000")
    assert row.hpp_usd_per_1k_in == 1


@pytest.mark.asyncio
async def test_create_model_both_shapes_prefers_usd(client, ai_on) -> None:
    pid = _provider(client)
    response = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/both",
            "upstream_id": "both-up",
            "price_usd_per_1m_in": 1,
            "price_usd_per_1m_out": 2,
            "price_idr_per_1k_in": 99999,
            "price_idr_per_1k_out": 99999,
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["price_usd_per_1m_in"] == 1.0
    assert body["price_usd_per_1m_out"] == 2.0
    assert body["price_idr_per_1k_in"] == 16
    assert body["price_idr_per_1k_out"] == 32


@pytest.mark.asyncio
async def test_update_model_partial_usd_keeps_other_leg(client, ai_on) -> None:
    pid = _provider(client)
    created = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": pid,
            "public_id": "sinexis/partial",
            "upstream_id": "partial-up",
            "price_usd_per_1m_in": 1,
            "price_usd_per_1m_out": 2,
            "hpp_usd_per_1m_in": 0.1,
            "hpp_usd_per_1m_out": 0.2,
        },
    ).json()
    mid = created["id"]

    patched = client.patch(
        f"/api/admin/ai/models/{mid}",
        headers=API_HEADERS,
        json={"price_usd_per_1m_out": 3},
    )

    assert patched.status_code == 200, patched.text
    body = patched.json()
    assert body["price_usd_per_1m_in"] == 1.0
    assert body["price_usd_per_1m_out"] == 3.0
    assert body["price_idr_per_1k_in"] == 16
    assert body["price_idr_per_1k_out"] == 48

    hpp_patched = client.patch(
        f"/api/admin/ai/models/{mid}",
        headers=API_HEADERS,
        json={"hpp_usd_per_1m_in": 0.25},
    )

    assert hpp_patched.status_code == 200, hpp_patched.text
    assert hpp_patched.json()["hpp_usd_per_1m_in"] == 0.25
    assert hpp_patched.json()["hpp_usd_per_1m_out"] == 0.2


@pytest.mark.asyncio
async def test_admin_usage_exposes_cogs_margin_and_fx(client, db_session, ai_on) -> None:
    db_session.add(
        AiUsageEvent(
            source="admin_trial",
            model_public_id="sinexis/cogs",
            prompt_tokens=10,
            completion_tokens=5,
            billed_idr=100,
            cogs_idr=40,
            billed_usd=Decimal("0.006250000000"),
            cogs_usd=Decimal("0.002500000000"),
            fx_rate=Decimal("16000"),
            fx_source="env",
            fx_effective_date=date.today(),
            price_usd_per_1m_in=Decimal("0.15"),
            price_usd_per_1m_out=Decimal("0.60"),
            hpp_usd_per_1m_in=Decimal("0.075"),
            hpp_usd_per_1m_out=Decimal("0.30"),
            created_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    response = client.get("/api/admin/ai/usage", headers=API_HEADERS)

    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert item["billed_idr"] == 100
    assert item["cogs_idr"] == 40
    assert item["margin_idr"] == item["billed_idr"] - item["cogs_idr"]
    assert item["margin_idr"] == 60
    assert item["billed_usd"] == 0.00625
    assert item["cogs_usd"] == 0.0025
    assert item["fx_rate"] == 16000.0
    assert item["fx_source"] == "env"
    assert item["fx_effective_date"] == date.today().isoformat()
    assert item["price_usd_per_1m_in"] == 0.15
    assert item["hpp_usd_per_1m_in"] == 0.075


def _make_provider(client, name: str, *, enabled: bool = True) -> str:
    created = client.post(
        "/api/admin/ai/providers",
        headers=API_HEADERS,
        json={
            "name": name,
            "base_url": "https://api.example/v1",
            "credential": "k",
            "enabled": enabled,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _make_model(client, provider_id: str, public_id: str, upstream_id: str) -> str:
    created = client.post(
        "/api/admin/ai/models",
        headers=API_HEADERS,
        json={
            "provider_id": provider_id,
            "public_id": public_id,
            "upstream_id": upstream_id,
            "price_usd_per_1m_in": 1,
            "price_usd_per_1m_out": 1,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _add_upstream(client, model_id: str, provider_id: str, upstream_id: str, **extra: object):
    payload: dict[str, object] = {
        "provider_id": provider_id,
        "upstream_id": upstream_id,
        **extra,
    }
    return client.post(
        f"/api/admin/ai/models/{model_id}/upstreams",
        headers=API_HEADERS,
        json=payload,
    )


def test_model_upstream_crud_and_resequence(client, ai_on) -> None:
    provider_a = _make_provider(client, "Primary A")
    provider_b = _make_provider(client, "Fallback B")
    provider_c = _make_provider(client, "Fallback C")
    provider_d = _make_provider(client, "Fallback D")
    model_id = _make_model(client, provider_a, "sinexis/fallback-crud", "a-up")

    first = _add_upstream(client, model_id, provider_b, "b-up")
    assert first.status_code == 201, first.text
    body = first.json()
    assert len(body["upstreams"]) == 1
    assert [u["rank"] for u in body["upstreams"]] == [1]
    assert [u["provider_name"] for u in body["upstreams"]] == ["Fallback B"]

    second = _add_upstream(client, model_id, provider_c, "c-up")
    assert second.status_code == 201, second.text
    body = second.json()
    assert len(body["upstreams"]) == 2
    assert [u["rank"] for u in body["upstreams"]] == [1, 2]
    assert [u["provider_name"] for u in body["upstreams"]] == ["Fallback B", "Fallback C"]

    third = _add_upstream(client, model_id, provider_d, "d-up")
    assert third.status_code == 201, third.text
    body = third.json()
    assert len(body["upstreams"]) == 3
    assert [u["rank"] for u in body["upstreams"]] == [1, 2, 3]
    assert [u["provider_name"] for u in body["upstreams"]] == ["Fallback B", "Fallback C", "Fallback D"]

    middle_id = body["upstreams"][1]["id"]
    deleted = client.delete(f"/api/admin/ai/models/{model_id}/upstreams/{middle_id}", headers=API_HEADERS)
    assert deleted.status_code == 200, deleted.text
    remaining = deleted.json()["upstreams"]
    assert len(remaining) == 2
    assert [u["rank"] for u in remaining] == [1, 2]
    assert [u["upstream_id"] for u in remaining] == ["b-up", "d-up"]

    replacement = _add_upstream(client, model_id, provider_c, "c-up-new")
    assert replacement.status_code == 201, replacement.text
    rep_body = replacement.json()
    assert [u["rank"] for u in rep_body["upstreams"]] == [1, 2, 3]
    assert rep_body["upstreams"][2]["upstream_id"] == "c-up-new"
    rep_id = rep_body["upstreams"][2]["id"]

    moved = client.patch(
        f"/api/admin/ai/models/{model_id}/upstreams/{rep_id}",
        headers=API_HEADERS,
        json={"rank": 1},
    )
    assert moved.status_code == 200, moved.text
    assert [u["upstream_id"] for u in moved.json()["upstreams"]] == ["c-up-new", "b-up", "d-up"]
    assert [u["rank"] for u in moved.json()["upstreams"]] == [1, 2, 3]

    listed = client.get("/api/admin/ai/models", headers=API_HEADERS)
    assert listed.status_code == 200
    row = next(item for item in listed.json()["items"] if item["id"] == model_id)
    assert [u["upstream_id"] for u in row["upstreams"]] == ["c-up-new", "b-up", "d-up"]
    assert [u["rank"] for u in row["upstreams"]] == [1, 2, 3]


def test_model_upstream_validation(client, ai_on) -> None:
    provider_a = _make_provider(client, "Validation A")
    provider_b = _make_provider(client, "Validation B")
    disabled_provider = _make_provider(client, "Validation Disabled", enabled=False)
    model_id = _make_model(client, provider_a, "sinexis/validation", "a-up")

    missing_model = _add_upstream(client, "00000000-0000-0000-0000-000000000099", provider_b, "x")
    assert missing_model.status_code == 404

    unknown_provider = _add_upstream(client, model_id, "00000000-0000-0000-0000-000000000098", "x")
    assert unknown_provider.status_code == 422

    disabled = _add_upstream(client, model_id, disabled_provider, "x")
    assert disabled.status_code == 422

    primary = _add_upstream(client, model_id, provider_a, "a-up")
    assert primary.status_code == 409
    assert primary.json()["detail"] == "target is the primary upstream"

    ok = _add_upstream(client, model_id, provider_b, "b-up")
    assert ok.status_code == 201, ok.text
    fallback_id = ok.json()["upstreams"][0]["id"]

    duplicate = _add_upstream(client, model_id, provider_b, "b-up")
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "upstream target already exists"

    rank_clash = _add_upstream(client, model_id, provider_b, "b-up-2", rank=1)
    assert rank_clash.status_code == 409
    assert rank_clash.json()["detail"] == "rank already in use"

    second = _add_upstream(client, model_id, provider_b, "b-up-2")
    assert second.status_code == 201, second.text
    third = _add_upstream(client, model_id, provider_b, "b-up-3")
    assert third.status_code == 201, third.text

    fourth = _add_upstream(client, model_id, provider_b, "b-up-4")
    assert fourth.status_code == 422
    assert fourth.json()["detail"] == "candidate limit reached"

    unknown_patch = client.patch(
        f"/api/admin/ai/models/{model_id}/upstreams/{fallback_id}",
        headers=API_HEADERS,
        json={"provider_id": "00000000-0000-0000-0000-000000000097"},
    )
    assert unknown_patch.status_code == 422


def test_model_upstream_same_provider_different_upstream_allowed(client, ai_on) -> None:
    provider_a = _make_provider(client, "Same Provider A")
    model_id = _make_model(client, provider_a, "sinexis/same-provider", "a-up")

    same_provider = _add_upstream(client, model_id, provider_a, "a-up-alt")
    assert same_provider.status_code == 201, same_provider.text
    assert same_provider.json()["upstreams"][0]["provider_id"] == provider_a
    assert same_provider.json()["upstreams"][0]["upstream_id"] == "a-up-alt"

    same_target = _add_upstream(client, model_id, provider_a, "a-up")
    assert same_target.status_code == 409
    assert same_target.json()["detail"] == "target is the primary upstream"


def test_model_upstreams_survive_model_patch(client, ai_on) -> None:
    provider_a = _make_provider(client, "Survive A")
    provider_b = _make_provider(client, "Survive B")
    model_id = _make_model(client, provider_a, "sinexis/survive", "a-up")
    added = _add_upstream(client, model_id, provider_b, "b-up")
    assert added.status_code == 201, added.text

    disabled = client.patch(
        f"/api/admin/ai/models/{model_id}",
        headers=API_HEADERS,
        json={"enabled": False},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["enabled"] is False
    assert len(disabled.json()["upstreams"]) == 1
    assert disabled.json()["upstreams"][0]["upstream_id"] == "b-up"

    enabled = client.patch(
        f"/api/admin/ai/models/{model_id}",
        headers=API_HEADERS,
        json={"enabled": True},
    )
    assert enabled.status_code == 200, enabled.text
    assert len(enabled.json()["upstreams"]) == 1
    assert enabled.json()["upstreams"][0]["upstream_id"] == "b-up"


def test_model_primary_repoint_rejects_existing_fallback(client, ai_on) -> None:
    provider_a = _make_provider(client, "Repoint A")
    provider_b = _make_provider(client, "Repoint B")
    model_id = _make_model(client, provider_a, "sinexis/repoint", "a-up")
    added = _add_upstream(client, model_id, provider_b, "b-up")
    assert added.status_code == 201, added.text

    clash = client.patch(
        f"/api/admin/ai/models/{model_id}",
        headers=API_HEADERS,
        json={"provider_id": provider_b, "upstream_id": "b-up"},
    )
    assert clash.status_code == 409
    assert clash.json()["detail"] == "target already exists as a fallback upstream"

    moved = client.patch(
        f"/api/admin/ai/models/{model_id}",
        headers=API_HEADERS,
        json={"provider_id": provider_b, "upstream_id": "new-up"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["provider_id"] == provider_b
    assert moved.json()["upstream_id"] == "new-up"
    assert len(moved.json()["upstreams"]) == 1
    assert moved.json()["upstreams"][0]["upstream_id"] == "b-up"

    unknown = client.patch(
        f"/api/admin/ai/models/{model_id}",
        headers=API_HEADERS,
        json={"provider_id": "00000000-0000-0000-0000-000000000096"},
    )
    assert unknown.status_code == 422


def test_provider_delete_cascades_model_upstreams(client, ai_on) -> None:
    provider_a = _make_provider(client, "Cascade Primary")
    provider_b = _make_provider(client, "Cascade Fallback")
    model_id = _make_model(client, provider_a, "sinexis/cascade-upstream", "a-up")
    added = _add_upstream(client, model_id, provider_b, "b-up")
    assert added.status_code == 201, added.text

    deleted = client.delete(f"/api/admin/ai/providers/{provider_b}", headers=API_HEADERS)
    assert deleted.status_code == 204, deleted.text

    listed = client.get("/api/admin/ai/models", headers=API_HEADERS)
    assert listed.status_code == 200
    row = next(item for item in listed.json()["items"] if item["id"] == model_id)
    assert row["upstreams"] == []
