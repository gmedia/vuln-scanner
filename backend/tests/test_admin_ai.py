from __future__ import annotations

import pytest

from app.config import settings
from app.services.ai_crypto import decrypt_credential, encrypt_credential

API_HEADERS = {"X-API-Key": settings.api_key, "X-E2E-Test": "1"}


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
