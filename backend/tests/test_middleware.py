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
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


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
    mock_ip = "10.0.0.99"
    for _ in range(300):
        resp = client.get(
            "/api/scan/history",
            headers={"X-API-Key": API_KEY},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} at iteration {_}"
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 429
    assert "IP rate limit" in resp.json()["detail"]
