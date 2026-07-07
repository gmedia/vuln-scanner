import logging
import time

import redis.asyncio as redis
from fastapi import Request
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    """Reusable rate limiter using Redis — same pattern as ApiKeyMiddleware in auth.py.

    Lazy Redis connection, incr + expire, returns JSONResponse on limit hit
    or Redis failure.
    """

    max_requests: int
    window_seconds: int
    prefix: str

    def __init__(self, max_requests: int, window_seconds: int, prefix: str):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix
        self._redis: redis.Redis[str] | None = None

    async def _get_redis(self) -> redis.Redis[str]:
        if self._redis is None:
            self._redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def __call__(self, request: Request) -> JSONResponse | None:
        # Bypass rate limiting for e2e test requests
        if request.headers.get("X-E2E-Test"):
            return None

        client_ip = request.client.host if request.client else "unknown"
        key = f"{self.prefix}:{client_ip}"

        try:
            r = await self._get_redis()
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, self.window_seconds)
            if count > self.max_requests:
                try:
                    ttl = await r.ttl(key)
                except redis.RedisError:
                    ttl = -1
                retry_after = ttl if ttl > 0 else self.window_seconds
                logger.warning(
                    "Rate limit hit: prefix=%s ip=%s count=%d/%d window=%ds",
                    self.prefix,
                    client_ip,
                    count,
                    self.max_requests,
                    self.window_seconds,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Try again later."},
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(self.max_requests),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(time.time() + retry_after)),
                    },
                )
        except redis.RedisError:
            logger.critical(
                "Rate limit infrastructure unavailable: Redis down for prefix=%s",
                self.prefix,
            )
            return JSONResponse(
                status_code=503,
                content={"detail": "Service temporarily unavailable. Rate limit infrastructure down."},
            )

        return None
