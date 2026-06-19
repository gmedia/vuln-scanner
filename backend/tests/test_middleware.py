import pytest
from app.config import settings

API_KEY = settings.api_key


def test_auth_missing_key(client):
    from fastapi.exceptions import HTTPException
    with pytest.raises((HTTPException, ExceptionGroup)):
        client.get("/api/scan/history")


def test_auth_invalid_key(client):
    from fastapi.exceptions import HTTPException
    with pytest.raises((HTTPException, ExceptionGroup)):
        client.get("/api/scan/history", headers={"X-API-Key": "wrong-key"})


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


def test_rate_limit_exceeded(client, mock_celery):
    from fastapi.exceptions import HTTPException
    for _ in range(1000):
        resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
        assert resp.status_code == 200

    with pytest.raises(HTTPException) as exc_info:
        client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert exc_info.value.status_code == 429
    assert "rate limit" in exc_info.value.detail.lower()
