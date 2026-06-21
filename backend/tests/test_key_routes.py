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


def test_revoke_key_success(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "revoke-success", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    revoke_resp = client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke_resp.status_code == 200
    data = revoke_resp.json()
    assert data["is_active"] is False
    assert data["id"] == key_id


def test_list_keys_returns_key_fields(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "list-fields-key", "rate_limit": 25},
    )
    assert create_resp.status_code == 201

    list_resp = client.get(
        "/api/keys",
        headers={"X-API-Key": API_KEY},
    )
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert "keys" in data
    keys = data["keys"]
    assert len(keys) >= 1

    created_key = next((k for k in keys if k["name"] == "list-fields-key"), None)
    assert created_key is not None
    assert created_key["id"] is not None
    assert created_key["is_active"] is True
    assert created_key["rate_limit"] == 25
    assert created_key["created_at"] is not None


def test_delete_key_success(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "delete-success"},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    delete_resp = client.delete(
        f"/api/keys/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert delete_resp.status_code == 204

    list_resp = client.get(
        "/api/keys",
        headers={"X-API-Key": API_KEY},
    )
    assert list_resp.status_code == 200
    ids = [k["id"] for k in list_resp.json()["keys"]]
    assert key_id not in ids


def test_rotate_key(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "rotate-me", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    old_key_id = create_resp.json()["id"]
    old_key = create_resp.json()["key"]

    resp = client.get("/api/scan/history", headers={"X-API-Key": old_key})
    assert resp.status_code == 200

    revoke_resp = client.post(
        f"/api/keys/revoke/{old_key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["is_active"] is False

    resp = client.get("/api/scan/history", headers={"X-API-Key": old_key})
    assert resp.status_code == 401

    create_resp2 = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "rotate-me-new", "rate_limit": 10},
    )
    assert create_resp2.status_code == 201
    new_key = create_resp2.json()["key"]
    assert new_key != old_key

    resp = client.get("/api/scan/history", headers={"X-API-Key": new_key})
    assert resp.status_code == 200


def test_revoke_already_revoked_key_is_idempotent(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "double-revoke", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]

    revoke1 = client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke1.status_code == 200
    assert revoke1.json()["is_active"] is False

    revoke2 = client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke2.status_code == 200
    assert revoke2.json()["is_active"] is False


def test_list_keys_excludes_revoked_keys_from_active_usage(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "active-then-revoked", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    key_id = create_resp.json()["id"]
    plain_key = create_resp.json()["key"]

    list_resp = client.get("/api/keys", headers={"X-API-Key": API_KEY})
    assert list_resp.status_code == 200
    before_key = next(
        (k for k in list_resp.json()["keys"] if k["id"] == key_id), None
    )
    assert before_key is not None
    assert before_key["is_active"] is True

    client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )

    list_resp2 = client.get("/api/keys", headers={"X-API-Key": API_KEY})
    assert list_resp2.status_code == 200
    after_key = next(
        (k for k in list_resp2.json()["keys"] if k["id"] == key_id), None
    )
    assert after_key is not None
    assert after_key["is_active"] is False

    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 401


def test_generate_key_with_empty_name(client):
    resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "", "rate_limit": 10},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == ""


def test_generate_key_max_rate_limit(client):
    resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "max-rate", "rate_limit": 999999},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["rate_limit"] == 999999


def test_generate_key_negative_rate_limit(client):
    resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "negative-rate", "rate_limit": -1},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["rate_limit"] == -1


def test_delete_and_regenerate_same_name(client):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "unique-name", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    old_id = create_resp.json()["id"]
    old_key = create_resp.json()["key"]

    delete_resp = client.delete(
        f"/api/keys/{old_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert delete_resp.status_code == 204

    create_resp2 = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "unique-name", "rate_limit": 10},
    )
    assert create_resp2.status_code == 201
    data2 = create_resp2.json()
    assert data2["id"] != old_id
    assert data2["key"] != old_key


def test_list_keys_has_correct_shape(client):
    resp = client.get("/api/keys", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    data = resp.json()
    assert "keys" in data
    assert isinstance(data["keys"], list)
    for key in data["keys"]:
        assert "id" in key
        assert "name" in key
        assert "is_active" in key
        assert "rate_limit" in key
        assert "created_at" in key
