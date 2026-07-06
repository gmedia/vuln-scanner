import logging
import time
from collections.abc import Awaitable, Callable

import redis.asyncio as redis
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.config import settings
from app.database import get_db as _get_db
from app.models.api_key import ApiKey
from app.utils import hash_key

logger = logging.getLogger(__name__)

EXCLUDED_PATHS = [
    "/health",
    "/api/health",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/verify-email",
    "/api/auth/refresh",
    "/api/auth/me",
]

MASTER_KEY_ID = "__master__"
IP_LIMIT = 300


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that validates API keys and enforces rate limiting."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._redis: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        """Lazy Redis connection — avoids hanging at startup when Redis is unavailable."""
        if self._redis is None:
            self._redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        assert self._redis is not None
        return self._redis

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        """Authenticate request via X-API-Key header and enforce IP and key rate limits."""
        if request.url.path in EXCLUDED_PATHS or request.url.path.startswith("/ws/"):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        api_key_header = request.headers.get("X-API-Key")
        if not api_key_header:
            return JSONResponse(status_code=401, content={"detail": "Missing API key"})

        client_ip = request.client.host if request.client else "unknown"

        # Skip IP rate limiting for e2e test requests
        if not request.headers.get("X-E2E-Test"):
            ip_key = f"ratelimit:ip:{client_ip}"
            try:
                ip_count = await (await self._get_redis()).incr(ip_key)
                if ip_count == 1:
                    await (await self._get_redis()).expire(ip_key, 3600)
                if ip_count > IP_LIMIT:
                    return JSONResponse(
                        status_code=429,
                        content={"detail": "IP rate limit exceeded. Max 300 requests/hour."},
                    )
            except redis.RedisError:
                logger.critical("Rate limit infrastructure unavailable: Redis unavailable for IP rate limit check")
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Service temporarily unavailable. Rate limit infrastructure down."},
                )

        if api_key_header == settings.api_key:
            logger.debug(
                "Master API key accepted for %s %s (ip=%s)",
                request.method,
                request.url.path,
                client_ip,
            )
            return await self._check_rate_and_forward(request, call_next, MASTER_KEY_ID, 1000)

        # Master key didn't match — log both values (truncated) for debugging
        logger.warning(
            "API key mismatch for %s %s (ip=%s): received=%r, expected=%r",
            request.method,
            request.url.path,
            client_ip,
            api_key_header[:8] + "..." if len(api_key_header) > 8 else api_key_header,
            settings.api_key[:8] + "..." if len(settings.api_key) > 8 else settings.api_key,
        )

        key_hash = hash_key(api_key_header)
        get_db_fn = request.app.dependency_overrides.get(_get_db, _get_db)
        gen = get_db_fn()
        session = await gen.__anext__()
        try:
            result = await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
            api_key = result.scalar_one_or_none()
        except SQLAlchemyError:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        finally:
            await gen.aclose()

        if not api_key:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        if not api_key.is_active:
            return JSONResponse(status_code=401, content={"detail": "API key is revoked"})

        return await self._check_rate_and_forward(request, call_next, str(api_key.id), api_key.rate_limit)

    async def _check_rate_and_forward(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[JSONResponse]],
        key_id: str,
        rate_limit: int,
    ) -> JSONResponse:
        """Check per-key rate limit, forward request, and attach rate-limit headers."""
        # Bypass rate limiting for e2e test requests
        if request.headers.get("X-E2E-Test"):
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(rate_limit)
            response.headers["X-RateLimit-Remaining"] = str(rate_limit)
            response.headers["X-RateLimit-Reset"] = "0"
            return response

        key = f"ratelimit:key:{key_id}"
        try:
            count = await (await self._get_redis()).incr(key)
            if count == 1:
                await (await self._get_redis()).expire(key, 3600)
            if count > rate_limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Rate limit exceeded. Max {rate_limit} requests/hour."},
                )
        except redis.RedisError:
            logger.critical("Rate limit infrastructure unavailable: Redis unavailable for key rate limit check")
            return JSONResponse(
                status_code=503, content={"detail": "Service temporarily unavailable. Rate limit infrastructure down."}
            )

        response = await call_next(request)
        remaining = max(0, rate_limit - count)
        now = time.time()
        reset_at = int(now + 3600)
        response.headers["X-RateLimit-Limit"] = str(rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
