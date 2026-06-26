"""Tests for the RateLimiter class in app.middleware.rate_limit."""

from unittest.mock import MagicMock

import pytest
import redis.asyncio as redis

from app.middleware.rate_limit import RateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_redis_error_returns_503(monkeypatch):
    """When _get_redis raises RedisError, __call__ returns a 503 JSONResponse."""
    limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

    async def mock_get_redis_error():
        raise redis.RedisError("Connection refused")

    monkeypatch.setattr(limiter, "_get_redis", mock_get_redis_error)

    mock_request = MagicMock()
    mock_request.client.host = "127.0.0.1"
    mock_request.headers.get.return_value = None  # ensure e2e bypass not triggered

    response = await limiter(mock_request)

    assert response is not None
    assert response.status_code == 503
    body = response.body if isinstance(response.body, bytes) else response.body
    import json

    content = json.loads(body)
    assert "Service temporarily unavailable" in content["detail"]


@pytest.mark.asyncio
async def test_rate_limiter_redis_from_url_error_returns_503(monkeypatch):
    """When Redis.from_url itself raises RedisError (first call path), returns 503."""
    limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

    # Simulate the case where _get_redis hasn't been called yet and Redis.from_url fails.
    # The global conftest patch replaces from_url, so we replace _get_redis entirely
    # to mimic the from_url failure path.
    async def mock_get_redis_from_url_error():
        # Simulate what happens when redis.Redis.from_url raises during first connection
        raise redis.RedisError("Connection refused")

    monkeypatch.setattr(limiter, "_get_redis", mock_get_redis_from_url_error)

    mock_request = MagicMock()
    mock_request.client.host = "192.168.1.1"
    mock_request.headers.get.return_value = None

    response = await limiter(mock_request)

    assert response is not None
    assert response.status_code == 503
    import json

    content = json.loads(response.body)
    assert "Service temporarily unavailable" in content["detail"]


@pytest.mark.asyncio
async def test_rate_limiter_incr_error_returns_503(monkeypatch):
    """When r.incr() raises RedisError, __call__ returns a 503 JSONResponse."""
    limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

    mock_redis = MagicMock()
    mock_redis.incr = MagicMock(side_effect=redis.RedisError("Connection refused"))

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

    mock_request = MagicMock()
    mock_request.client.host = "10.0.0.1"
    mock_request.headers.get.return_value = None

    response = await limiter(mock_request)

    assert response is not None
    assert response.status_code == 503
    import json

    content = json.loads(response.body)
    assert "Service temporarily unavailable" in content["detail"]


@pytest.mark.asyncio
async def test_rate_limiter_unknown_client_ip(monkeypatch):
    """When request.client is None, uses 'unknown' as the IP key."""
    limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

    async def async_incr(*args, **kwargs):
        return 1

    async def async_expire(*args, **kwargs):
        pass

    mock_redis = MagicMock()
    mock_redis.incr = MagicMock(side_effect=async_incr)
    mock_redis.expire = MagicMock(side_effect=async_expire)

    async def mock_get_redis():
        return mock_redis

    monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

    mock_request = MagicMock()
    mock_request.client = None
    mock_request.headers.get.return_value = None

    response = await limiter(mock_request)

    # Should not raise, and should return None (not rate limited)
    assert response is None
    mock_redis.incr.assert_called_once_with("test:unknown")
    mock_redis.expire.assert_called_once_with("test:unknown", 60)
