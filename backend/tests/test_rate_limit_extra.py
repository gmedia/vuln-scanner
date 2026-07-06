"""Expanded tests for the RateLimiter class in app.middleware.rate_limit."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.middleware.rate_limit import RateLimiter


class TestRateLimiterInit:
    def test_sets_params_correctly(self):
        limiter = RateLimiter(max_requests=10, window_seconds=30, prefix="api")
        assert limiter.max_requests == 10
        assert limiter.window_seconds == 30
        assert limiter.prefix == "api"
        assert limiter._redis is None


class TestRateLimiterCall:
    @pytest.mark.asyncio
    async def test_under_limit_returns_none(self, monkeypatch):
        """When count <= max_requests, __call__ returns None (not rate limited)."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=3)
        mock_redis.expire = AsyncMock(return_value=True)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)
        assert response is None

    @pytest.mark.asyncio
    async def test_over_limit_returns_429(self, monkeypatch):
        """When count > max_requests, __call__ returns a 429 JSONResponse."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=6)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=42)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)

        assert response is not None
        assert response.status_code == 429
        import json

        content = json.loads(response.body)
        assert "Too many requests" in content["detail"]

    @pytest.mark.asyncio
    async def test_exactly_at_limit_returns_none(self, monkeypatch):
        """When count == max_requests, __call__ returns None."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=5)
        mock_redis.expire = AsyncMock(return_value=True)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)
        assert response is None

    @pytest.mark.asyncio
    async def test_e2e_test_header_bypass(self, monkeypatch):
        """X-E2E-Test header bypasses rate limiting."""
        limiter = RateLimiter(max_requests=1, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=999)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = "1"

        response = await limiter(mock_request)
        assert response is None
        mock_redis.incr.assert_not_called()

    @pytest.mark.asyncio
    async def test_key_format(self, monkeypatch):
        """Key format is {prefix}:{client_ip}."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="api-v1")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock(return_value=True)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "192.168.1.100"
        mock_request.headers.get.return_value = None

        await limiter(mock_request)
        mock_redis.incr.assert_called_once_with("api-v1:192.168.1.100")
        mock_redis.expire.assert_called_once_with("api-v1:192.168.1.100", 60)

    @pytest.mark.asyncio
    async def test_first_request_sets_expire(self, monkeypatch):
        """When count == 1, expire is called to set the window."""
        limiter = RateLimiter(max_requests=5, window_seconds=30, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=1)
        mock_redis.expire = AsyncMock(return_value=True)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.5"
        mock_request.headers.get.return_value = None

        await limiter(mock_request)
        mock_redis.expire.assert_called_once_with("test:10.0.0.5", 30)

    @pytest.mark.asyncio
    async def test_subsequent_requests_no_expire(self, monkeypatch):
        """When count > 1, expire is not called again."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=4)
        mock_redis.expire = AsyncMock(return_value=True)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.5"
        mock_request.headers.get.return_value = None

        await limiter(mock_request)
        mock_redis.expire.assert_not_called()

    @pytest.mark.asyncio
    async def test_429_includes_rate_limit_headers(self, monkeypatch):
        """When rate limited, response includes Retry-After + X-RateLimit-* headers."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=6)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=42)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)

        assert response is not None
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "42"
        assert response.headers["X-RateLimit-Limit"] == "5"
        assert response.headers["X-RateLimit-Remaining"] == "0"
        assert "X-RateLimit-Reset" in response.headers

    @pytest.mark.asyncio
    async def test_429_falls_back_to_window_when_ttl_negative(self, monkeypatch):
        """When TTL is -1 (key expired), Retry-After falls back to window_seconds."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=6)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(return_value=-1)

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)

        assert response is not None
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "60"

    @pytest.mark.asyncio
    async def test_429_falls_back_to_window_when_ttl_fails(self, monkeypatch):
        """When TTL call raises RedisError, Retry-After falls back to window_seconds."""
        limiter = RateLimiter(max_requests=5, window_seconds=120, prefix="test")

        mock_redis = MagicMock()
        mock_redis.incr = AsyncMock(return_value=6)
        mock_redis.expire = AsyncMock(return_value=True)
        mock_redis.ttl = AsyncMock(side_effect=__import__("redis.asyncio").RedisError("fail"))

        async def mock_get_redis():
            return mock_redis

        monkeypatch.setattr(limiter, "_get_redis", mock_get_redis)

        mock_request = MagicMock()
        mock_request.client.host = "10.0.0.1"
        mock_request.headers.get.return_value = None

        response = await limiter(mock_request)

        assert response is not None
        assert response.status_code == 429
        assert response.headers["Retry-After"] == "120"


class TestGetRedis:
    @pytest.mark.asyncio
    async def test_caches_redis_instance(self, monkeypatch):
        """_get_redis returns the same instance on second call."""
        limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="test")

        mock_redis = MagicMock()
        mock_from_url = MagicMock(return_value=mock_redis)

        monkeypatch.setattr(
            "app.middleware.rate_limit.redis.Redis.from_url",
            mock_from_url,
        )

        r1 = await limiter._get_redis()
        r2 = await limiter._get_redis()

        assert r1 is r2
        assert limiter._redis is r1
        mock_from_url.assert_called_once()
