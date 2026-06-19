from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import WebSocketDisconnect

from app.config import settings

API_KEY = settings.api_key


def test_reject_no_api_key(client, monkeypatch):
    """Rejects connection when no API key provided (validate_api_key returns False)."""
    async def mock_validate(_key):
        return False
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    headers = {"X-API-Key": settings.api_key}
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/ws/scan/test-job-id", headers=headers
        ):
            pass
    assert exc_info.value.code == 4001


def test_reject_invalid_api_key(client, monkeypatch):
    """Rejects connection with an invalid API key."""
    async def mock_validate(_key):
        return False
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    headers = {"X-API-Key": settings.api_key}
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            "/api/ws/scan/test-job-id?api_key=bad-key", headers=headers
        ):
            pass
    assert exc_info.value.code == 4001


def test_accept_valid_api_key_and_receive_heartbeat(client, monkeypatch):
    """Accepts connection with valid API key and receives heartbeat JSON."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.get_message = AsyncMock(side_effect=[
        None,
        WebSocketDisconnect(),
    ])

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with client.websocket_connect(
        f"/api/ws/scan/test-job-id?api_key={API_KEY}"
    ) as ws:
        data = ws.receive_json()
        assert data == {"type": "heartbeat"}


def test_handles_redis_pubsub_messages(client, monkeypatch):
    """Handles Redis pubsub messages after connection is accepted."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.get_message = AsyncMock(side_effect=[
        {"data": b'{"type": "progress", "percent": 50}'},
        None,
        WebSocketDisconnect(),
    ])

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with client.websocket_connect(
        f"/api/ws/scan/test-job-id?api_key={API_KEY}"
    ) as ws:
        data1 = ws.receive_json()
        assert data1 == {"type": "progress", "percent": 50}

        data2 = ws.receive_json()
        assert data2 == {"type": "heartbeat"}
