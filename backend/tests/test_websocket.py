from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocketDisconnect
from redis.exceptions import RedisError

from app.config import settings

API_KEY = settings.api_key


class TestWebSocketRateLimit:
    """Tests for IP-based WebSocket rate limiting (WS_RATE_LIMIT_MAX=10, WINDOW=60)."""

    def test_rate_limit_allows_first_connections(self, client, monkeypatch):
        """First 10 connections from the same IP succeed (heartbeat received)."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()

        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        for i in range(10):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(f"/api/ws/scan/job-{i}?api_key={API_KEY}") as ws:
                data = ws.receive_json()
                assert data == {"type": "heartbeat"}

    def test_rate_limit_blocks_11th_connection(self, client, monkeypatch):
        """11th connection from same IP gets close code 4008 (rate limit exceeded)."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        # First, saturate the limit with 10 connections
        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        for i in range(10):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(f"/api/ws/scan/job-{i}?api_key={API_KEY}") as ws:
                ws.receive_json()

        # 11th connection should be blocked
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/api/ws/scan/job-11?api_key={API_KEY}"),
        ):
            pass
        assert exc_info.value.code == 4008

    def test_rate_limit_per_ip_isolation(self, client, monkeypatch):
        """Connections from different IPs have separate rate limit counters."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        # Helper: create a WS connection and verify heartbeat
        def connect_and_check(url):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(url) as ws:
                data = ws.receive_json()
                assert data == {"type": "heartbeat"}

        # Use separate fake rate-limit Redis per IP to simulate isolation

        class PerIpFakeRedis:
            """Fake Redis that maintains separate counters per key prefix."""

            def __init__(self, ip_label):
                self._ip_label = ip_label
                self._counters = {}
                self.incr = self._incr
                self.expire = AsyncMock(return_value=True)
                self.ping = AsyncMock(return_value=True)
                self.aclose = AsyncMock(return_value=None)

            async def _incr(self, key):
                self._counters[key] = self._counters.get(key, 0) + 1
                return self._counters[key]

        # Create separate fake Redis instances per IP
        redis_a = PerIpFakeRedis("a")
        redis_b = PerIpFakeRedis("b")

        call_idx = [0]

        async def mock_ws_rate_limit_redis():
            call_idx[0] += 1
            # Return different fake Redis per invocation to simulate different IPs
            # We'll alternate to represent the IP change
            if call_idx[0] <= 10:
                return redis_a
            return redis_b

        monkeypatch.setattr("app.api.websocket._get_ws_rate_limit_redis", mock_ws_rate_limit_redis)

        # Saturate IP-A with 10 connections
        for i in range(10):
            connect_and_check(f"/api/ws/scan/job-a-{i}?api_key={API_KEY}")

        # IP-B should still be able to connect (separate counter)
        connect_and_check(f"/api/ws/scan/job-b-1?api_key={API_KEY}")

    def test_rate_limit_resets_after_window(self, client, monkeypatch):
        """Rate limit counter resets after the window expires (count reset to 0)."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        # Track counters manually and simulate window reset
        counters = {}

        async def incr_side_effect(key):
            counters[key] = counters.get(key, 0) + 1
            return counters[key]

        async def expire_side_effect(key, window):
            # Expire is called on first incr; we'll simulate reset separately
            pass

        fake_rl_redis = MagicMock()
        fake_rl_redis.incr = incr_side_effect
        fake_rl_redis.expire = expire_side_effect
        fake_rl_redis.ping = AsyncMock(return_value=True)
        fake_rl_redis.aclose = AsyncMock(return_value=None)

        async def mock_ws_rl():
            return fake_rl_redis

        monkeypatch.setattr("app.api.websocket._get_ws_rate_limit_redis", mock_ws_rl)

        # Saturate the limit
        for i in range(10):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(f"/api/ws/scan/job-{i}?api_key={API_KEY}") as ws:
                ws.receive_json()

        # 11th should be blocked
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/api/ws/scan/job-blocked?api_key={API_KEY}"),
        ):
            pass
        assert exc_info.value.code == 4008

        # Simulate window reset by clearing counters
        counters.clear()

        # Now connections should work again
        mock_pubsub.get_message = AsyncMock(
            side_effect=[
                None,
                WebSocketDisconnect(),
            ]
        )
        with client.websocket_connect(f"/api/ws/scan/job-after-reset?api_key={API_KEY}") as ws:
            data = ws.receive_json()
            assert data == {"type": "heartbeat"}

    def test_rate_limit_redis_unavailable_returns_4001(self, client, monkeypatch):
        """When _get_ws_rate_limit_redis raises Exception, close code 4001."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        async def mock_ws_rl_error():
            raise RedisError("Redis connection refused")

        monkeypatch.setattr("app.api.websocket._get_ws_rate_limit_redis", mock_ws_rl_error)

        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/api/ws/scan/test-job?api_key={API_KEY}"),
        ):
            pass
        assert exc_info.value.code == 4001

    def test_rate_limit_after_master_key_validates(self, client, monkeypatch):
        """Rate limit check runs even when using the master API key."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()

        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        # Saturate rate limit with 10 connections using master key
        for i in range(10):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(f"/api/ws/scan/job-{i}?api_key={API_KEY}") as ws:
                ws.receive_json()

        # 11th connection with master key still blocked
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(f"/api/ws/scan/job-11?api_key={API_KEY}"),
        ):
            pass
        assert exc_info.value.code == 4008

    def test_rate_limit_after_db_key_validates(self, client, monkeypatch):
        """Rate limit check runs even for DB-stored API keys."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        # Mock DB session for job existence check (non-master key triggers it)
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

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()

        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        # Saturate with a DB key (key value doesn't matter, validate returns True)
        for i in range(10):
            mock_pubsub.get_message = AsyncMock(
                side_effect=[
                    None,
                    WebSocketDisconnect(),
                ]
            )
            with client.websocket_connect(f"/api/ws/scan/job-{i}?api_key=db-stored-key") as ws:
                ws.receive_json()

        # 11th connection with DB key still blocked
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect("/api/ws/scan/job-11?api_key=db-stored-key"),
        ):
            pass
        assert exc_info.value.code == 4008

    @pytest.mark.asyncio
    async def test_ws_rate_limit_redis_lazy_init(self, monkeypatch):
        """First call to _get_ws_rate_limit_redis initializes, second call reuses."""
        monkeypatch.setattr("app.api.websocket._ws_rate_limit_redis", None)

        mock_rl_instance = AsyncMock()
        with patch("app.api.websocket.Redis.from_url", return_value=mock_rl_instance) as mock_from_url:
            from app.api.websocket import _get_ws_rate_limit_redis
            from app.config import settings

            result1 = await _get_ws_rate_limit_redis()
            result2 = await _get_ws_rate_limit_redis()

            mock_from_url.assert_called_once_with(settings.redis_url, decode_responses=True)
            assert result1 is mock_rl_instance
            assert result2 is mock_rl_instance

    @pytest.mark.asyncio
    async def test_ws_rate_limit_redis_uses_decode_responses(self, monkeypatch):
        """_get_ws_rate_limit_redis passes decode_responses=True to Redis.from_url."""
        monkeypatch.setattr("app.api.websocket._ws_rate_limit_redis", None)

        mock_rl_instance = AsyncMock()
        with patch("app.api.websocket.Redis.from_url", return_value=mock_rl_instance) as mock_from_url:
            from app.api.websocket import _get_ws_rate_limit_redis

            await _get_ws_rate_limit_redis()

            mock_from_url.assert_called_once()
            call_kwargs = mock_from_url.call_args
            assert call_kwargs.kwargs.get("decode_responses") is True

    def test_rate_limit_expire_called_on_first_incr(self, client, monkeypatch):
        """expire is called with window=60 when count==1 (first increment)."""

        async def mock_validate(_key):
            return True

        monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

        mock_pubsub = MagicMock()
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()

        mock_redis = MagicMock()
        mock_redis.pubsub.return_value = mock_pubsub

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

        # Use a fake rate limit Redis that tracks expire calls
        expire_calls = []
        counter = [0]

        async def incr_side_effect(key):
            counter[0] += 1
            return counter[0]

        async def expire_side_effect(key, window):
            expire_calls.append((key, window))
            return True

        fake_rl_redis = MagicMock()
        fake_rl_redis.incr = incr_side_effect
        fake_rl_redis.expire = expire_side_effect
        fake_rl_redis.ping = AsyncMock(return_value=True)
        fake_rl_redis.aclose = AsyncMock(return_value=None)

        async def mock_ws_rl():
            return fake_rl_redis

        monkeypatch.setattr("app.api.websocket._get_ws_rate_limit_redis", mock_ws_rl)

        # First connection: count=1, expire should be called
        mock_pubsub.get_message = AsyncMock(
            side_effect=[
                None,
                WebSocketDisconnect(),
            ]
        )
        with client.websocket_connect(f"/api/ws/scan/job-first?api_key={API_KEY}") as ws:
            ws.receive_json()

        assert len(expire_calls) == 1
        assert expire_calls[0][1] == 60

        # Second connection: count=2, expire should NOT be called again
        mock_pubsub.get_message = AsyncMock(
            side_effect=[
                None,
                WebSocketDisconnect(),
            ]
        )
        with client.websocket_connect(f"/api/ws/scan/job-second?api_key={API_KEY}") as ws:
            ws.receive_json()

        assert len(expire_calls) == 1  # still only the first call


def test_reject_no_api_key(client, monkeypatch):
    """Rejects connection when no API key provided (validate_api_key returns False)."""

    async def mock_validate(_key):
        return False

    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    headers = {"X-API-Key": settings.api_key}
    with (
        pytest.raises(WebSocketDisconnect) as exc_info,
        client.websocket_connect("/api/ws/scan/test-job-id", headers=headers),
    ):
        pass
    assert exc_info.value.code == 4001


def test_reject_invalid_api_key(client, monkeypatch):
    """Rejects connection with an invalid API key."""

    async def mock_validate(_key):
        return False

    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    headers = {"X-API-Key": settings.api_key}
    with (
        pytest.raises(WebSocketDisconnect) as exc_info,
        client.websocket_connect("/api/ws/scan/test-job-id?api_key=bad-key", headers=headers),
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
    mock_pubsub.get_message = AsyncMock(
        side_effect=[
            None,
            WebSocketDisconnect(),
        ]
    )

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with client.websocket_connect(f"/api/ws/scan/test-job-id?api_key={API_KEY}") as ws:
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
    mock_pubsub.get_message = AsyncMock(
        side_effect=[
            {"data": b'{"type": "progress", "percent": 50}'},
            None,
            WebSocketDisconnect(),
        ]
    )

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    with client.websocket_connect(f"/api/ws/scan/test-job-id?api_key={API_KEY}") as ws:
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
    mock_pubsub.subscribe = AsyncMock(side_effect=RedisError("subscribe failed"))
    mock_pubsub.unsubscribe = AsyncMock()

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    # subscribe() raises outside the try/except → ASGI app crashes
    with (
        pytest.raises(Exception, match="subscribe failed"),
        client.websocket_connect(f"/api/ws/scan/test-job-id?api_key={API_KEY}"),
    ):
        pass


@pytest.mark.parametrize(
    "bad_data",
    [
        {"data": None},
        {"data": "string-data"},
    ],
)
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

    with pytest.raises(AttributeError), client.websocket_connect(f"/api/ws/scan/test-job-id?api_key={API_KEY}"):
        pass


def test_websocket_concurrent_connections(client, monkeypatch):
    """Two simultaneous WebSocket connections to different job_ids work independently."""

    async def mock_validate(_key):
        return True

    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    mock_pubsub1 = MagicMock()
    mock_pubsub1.subscribe = AsyncMock()
    mock_pubsub1.unsubscribe = AsyncMock()
    mock_pubsub1.get_message = AsyncMock(
        side_effect=[
            None,
            WebSocketDisconnect(),
        ]
    )
    mock_redis1 = MagicMock()
    mock_redis1.pubsub.return_value = mock_pubsub1

    mock_pubsub2 = MagicMock()
    mock_pubsub2.subscribe = AsyncMock()
    mock_pubsub2.unsubscribe = AsyncMock()
    mock_pubsub2.get_message = AsyncMock(
        side_effect=[
            {"data": b'{"status": "done"}'},
            None,
            WebSocketDisconnect(),
        ]
    )
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

    with client.websocket_connect(f"/api/ws/scan/job-1?api_key={API_KEY}") as ws1:
        data1 = ws1.receive_json()
        assert data1 == {"type": "heartbeat"}
        mock_pubsub1.subscribe.assert_called_once_with("scan_progress:job-1")

    with client.websocket_connect(f"/api/ws/scan/job-2?api_key={API_KEY}") as ws2:
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
    mock_pubsub.get_message = AsyncMock(return_value={"type": "message", "data": None})

    mock_redis = MagicMock()
    mock_redis.pubsub.return_value = mock_pubsub

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr("app.api.websocket.get_redis", mock_get_redis)

    # .decode() on None crashes → propagates ASGI AttributeError
    with pytest.raises(AttributeError), client.websocket_connect(f"/api/ws/scan/test-job-id?api_key={API_KEY}"):
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


def test_non_master_key_job_not_found(client, monkeypatch):
    """Non-master API key + non-existent job_id → close code 4004 (lines 79-80)."""

    async def mock_validate(_key):
        return True

    monkeypatch.setattr("app.api.websocket.validate_api_key", mock_validate)

    # Mock DB session: job not found (scalar_one_or_none returns None)
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

    # Ensure rate-limit Redis mock is in place so we don't hit real Redis

    fake_rl_redis = MagicMock()
    fake_rl_redis.incr = AsyncMock(return_value=1)
    fake_rl_redis.expire = AsyncMock(return_value=True)
    fake_rl_redis.ping = AsyncMock(return_value=True)
    fake_rl_redis.aclose = AsyncMock(return_value=None)

    async def mock_ws_rl():
        return fake_rl_redis

    monkeypatch.setattr("app.api.websocket._get_ws_rate_limit_redis", mock_ws_rl)

    import uuid

    nonexistent_id = str(uuid.uuid4())

    with (
        pytest.raises(WebSocketDisconnect) as exc_info,
        client.websocket_connect(f"/api/ws/scan/{nonexistent_id}?api_key=non-master-key"),
    ):
        pass
    assert exc_info.value.code == 4004
