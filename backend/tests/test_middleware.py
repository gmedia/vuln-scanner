from app.config import settings

API_KEY = settings.api_key


def test_auth_missing_key(client):
    resp = client.get("/api/scan/history")
    assert resp.status_code == 401


def test_auth_invalid_key(client):
    resp = client.get("/api/scan/history", headers={"X-API-Key": "wrong-key"})
    assert resp.status_code == 401


def test_auth_valid_key(client, mock_celery):
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200


def test_health_excluded_from_auth(client):
    resp = client.get("/health")
    # DB/Redis unavailable in test → returns 503 with "degraded" status
    assert resp.status_code in (200, 503)


def test_websocket_excluded(client):
    resp = client.get("/ws/scan/some-id")
    assert resp.status_code not in (401, 429)
    assert resp.status_code in (404, 405)


def test_rate_limit_headers_present(client, mock_celery):
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    assert "X-RateLimit-Limit" in resp.headers
    assert "X-RateLimit-Remaining" in resp.headers
    assert "X-RateLimit-Reset" in resp.headers
    remaining = int(resp.headers["X-RateLimit-Remaining"])
    assert remaining < 1000


def test_ip_rate_limit_exceeded(client, mock_celery):
    for _ in range(300):
        resp = client.get(
            "/api/scan/history",
            headers={"X-API-Key": API_KEY},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} at iteration {_}"
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 429
    assert "IP rate limit" in resp.json()["detail"]


def test_options_preflight(client):
    resp = client.options("/api/scan/history")
    assert resp.status_code != 401
    assert resp.status_code != 429


def test_auth_db_exception(client, db_session, monkeypatch):
    async def mock_execute(*args, **kwargs):
        raise Exception("DB error")

    monkeypatch.setattr(db_session, "execute", mock_execute)
    resp = client.get("/api/scan/history", headers={"X-API-Key": "some-non-master-key"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid API key"


def test_non_master_rate_limit_exceeded(client, mock_celery):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "rate-limit-test", "rate_limit": 1},
    )
    assert create_resp.status_code == 201
    new_key = create_resp.json()["key"]
    resp1 = client.get("/api/scan/history", headers={"X-API-Key": new_key})
    assert resp1.status_code == 200
    resp2 = client.get("/api/scan/history", headers={"X-API-Key": new_key})
    assert resp2.status_code == 429
