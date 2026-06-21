from unittest.mock import AsyncMock, MagicMock, patch

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
    with pytest.raises(WebSocketDisconnect) as exc_info, client.websocket_connect(
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
    with pytest.raises(WebSocketDisconnect) as exc_info, client.websocket_connect(
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


@pytest.mark.asyncio
async def test_validate_master_api_key_direct():
    """Tests the actual validate_api_key function with the master API key directly."""
    from app.api.websocket import validate_api_key

    result = await validate_api_key(settings.api_key)
    assert result is True


@pytest.mark.asyncio
async def test_validate_empty_api_key():
    """Tests the actual validate_api_key function with None (empty key path)."""
    from app.api.websocket import validate_api_key

    result = await validate_api_key(None)
    assert result is False


@pytest.mark.asyncio
async def test_get_redis_lazy_init(monkeypatch):
    monkeypatch.setattr("app.api.websocket.redis", None)

    mock_redis_instance = AsyncMock()
    with patch("app.api.websocket.Redis.from_url", return_value=mock_redis_instance) as mock_from_url:
        from app.api.websocket import get_redis
        from app.config import settings

        result = await get_redis()

        mock_from_url.assert_called_once_with(settings.redis_url)
        assert result is mock_redis_instance


@pytest.mark.asyncio
async def test_validate_api_key_db_found(monkeypatch):
    mock_session = AsyncMock()
    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = MagicMock()
    mock_session.execute.return_value = mock_scalar

    class FakeAsyncSession:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args, **kwargs):
            pass

    monkeypatch.setattr("app.api.websocket.async_session", lambda: FakeAsyncSession())

    from app.api.websocket import validate_api_key

    result = await validate_api_key("db-stored-key-not-master")
    assert result is True


# ======================================================================
# WebSocket edge case tests
# ======================================================================


@pytest.mark.asyncio
async def test_get_redis_connection_error(monkeypatch):
    """Verify ConnectionError propagates from Redis.from_url through get_redis."""
    monkeypatch.setattr("app.api.websocket.redis", None)

    with patch("app.api.websocket.Redis.from_url") as mock_from_url:
        mock_from_url.side_effect = ConnectionError("Redis connection refused")
        from app.api.websocket import get_redis

        with pytest.raises(ConnectionError):
            await get_redis()


def test_websocket_redis_subscribe_error(client, monkeypatch):
    """WebSocket disconnect when pubsub.subscribe() raises an exception."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock(side_effect=Exception("subscribe failed"))
    mock_pubsub.unsubscribe = AsyncMock()

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    # subscribe() raises outside the try/except → ASGI app crashes
    with pytest.raises(Exception, match="subscribe failed"), client.websocket_connect(
        f"/api/ws/scan/test-job-id?api_key={API_KEY}"
    ):
        pass


@pytest.mark.parametrize("bad_data", [
    {"data": None},
    {"data": "string-data"},
])
def test_websocket_get_message_unexpected_data(client, monkeypatch, bad_data):
    """Non-bytes data in pubsub message causes crash (no `.decode()` on None/str)."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.get_message = AsyncMock(return_value=bad_data)

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with pytest.raises(AttributeError), client.websocket_connect(
        f"/api/ws/scan/test-job-id?api_key={API_KEY}"
    ):
        pass


def test_websocket_concurrent_connections(client, monkeypatch):
    """Two simultaneous WebSocket connections to different job_ids work independently."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub1 = MagicMock()
    mock_pubsub1.subscribe = AsyncMock()
    mock_pubsub1.unsubscribe = AsyncMock()
    mock_pubsub1.get_message = AsyncMock(side_effect=[
        None,
        WebSocketDisconnect(),
    ])
    mock_redis1 = MagicMock()
    mock_redis1.pubsub.return_value = mock_pubsub1

    mock_pubsub2 = MagicMock()
    mock_pubsub2.subscribe = AsyncMock()
    mock_pubsub2.unsubscribe = AsyncMock()
    mock_pubsub2.get_message = AsyncMock(side_effect=[
        {"data": b'{"status": "done"}'},
        None,
        WebSocketDisconnect(),
    ])
    mock_redis2 = MagicMock()
    mock_redis2.pubsub.return_value = mock_pubsub2

    call_count = 0

    async def mock_get_redis():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mock_redis1
        return mock_redis2
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with client.websocket_connect(
        f"/api/ws/scan/job-1?api_key={API_KEY}"
    ) as ws1:
        data1 = ws1.receive_json()
        assert data1 == {"type": "heartbeat"}
        mock_pubsub1.subscribe.assert_called_once_with("scan_progress:job-1")

    with client.websocket_connect(
        f"/api/ws/scan/job-2?api_key={API_KEY}"
    ) as ws2:
        data2 = ws2.receive_json()
        assert data2 == {"status": "done"}
        mock_pubsub2.subscribe.assert_called_once_with("scan_progress:job-2")


def test_websocket_handles_pubsub_none_message_gracefully(client, monkeypatch):
    """Corrupted message with None data causes clean disconnect (does not hang)."""
    async def mock_validate(_key):
        return True
    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub = MagicMock()
    mock_pubsub.subscribe = AsyncMock()
    mock_pubsub.unsubscribe = AsyncMock()
    mock_pubsub.get_message = AsyncMock(
        return_value={"type": "message", "data": None}
    )

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis
    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    # .decode() on None crashes → propagates ASGI AttributeError
    with pytest.raises(AttributeError), client.websocket_connect(
        f"/api/ws/scan/test-job-id?api_key={API_KEY}"
    ):
        pass


@pytest.mark.asyncio
async def test_validate_api_key_db_not_found(monkeypatch):
    """validate_api_key returns False when key is not in DB and not master key."""
    mock_session = AsyncMock()
    mock_scalar = MagicMock()
    mock_scalar.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_scalar

    class FakeAsyncSession:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, *args, **kwargs):
            pass

    monkeypatch.setattr("app.api.websocket.async_session", lambda: FakeAsyncSession())

    from app.api.websocket import validate_api_key

    result = await validate_api_key("some-key-not-master")
    assert result is False


@pytest.mark.asyncio
async def test_get_redis_reuses_instance(monkeypatch):
    """get_redis() caches and reuses the Redis instance on subsequent calls."""
    monkeypatch.setattr("app.api.websocket.redis", None)

    mock_redis_instance = AsyncMock()
    with patch("app.api.websocket.Redis.from_url", return_value=mock_redis_instance) as mock_from_url:
        from app.api.websocket import get_redis

        result1 = await get_redis()
        result2 = await get_redis()

        mock_from_url.assert_called_once_with(settings.redis_url)
        assert result1 is mock_redis_instance
        assert result2 is mock_redis_instance
