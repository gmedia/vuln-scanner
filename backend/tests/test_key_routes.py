from app.config import settings

API_KEY = settings.api_key


def test_generate_key(client):
    resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "test-key", "rate_limit": 10},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-key"
    assert data["is_active"] is True
    assert data["rate_limit"] == 10
    assert data["key"].startswith("sk_")
    return data


def test_generate_key_defaults(client):
    resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "default-key"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["rate_limit"] == 60


def test_list_keys(client):
    resp = client.get(
        "/api/keys",
        headers={"X-API-Key": API_KEY},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "keys" in data


def test_generated_key_works(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "working-key", "rate_limit": 100},
    )
    assert create_resp.status_code == 201
    new_key = create_resp.json()["key"]

    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": new_key},
    )
    assert resp.status_code == 200
    assert "X-RateLimit-Limit" in resp.headers
    assert resp.headers["X-RateLimit-Limit"] == "100"


def test_revoked_key_rejected(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "revoke-me", "rate_limit": 100},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]
    new_key = create_resp.json()["key"]

    revoke_resp = client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["is_active"] is False

    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": new_key},
    )
    assert resp.status_code == 401


def test_delete_key(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "delete-me"},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    resp = client.delete(
        f"/api/keys/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert resp.status_code == 204


def test_revoke_nonexistent_key(client):
    resp = client.post(
        "/api/keys/revoke/00000000-0000-0000-0000-000000000000",
        headers={"X-API-Key": API_KEY},
    )
    assert resp.status_code == 404


def test_delete_nonexistent_key(client):
    resp = client.delete(
        "/api/keys/00000000-0000-0000-0000-000000000000",
        headers={"X-API-Key": API_KEY},
    )
    assert resp.status_code == 404
