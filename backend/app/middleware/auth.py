import hashlib
import logging
import time

import redis.asyncio as redis
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import get_db as _get_db
from app.models.api_key import ApiKey

logger = logging.getLogger(__name__)

EXCLUDED_PATHS = ["/health", "/api/health", "/docs", "/openapi.json", "/redoc"]

MASTER_KEY_ID = "__master__"
IP_LIMIT = 300


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that validates API keys and enforces rate limiting."""
    def __init__(self, app):
        super().__init__(app)
        self.redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)

    async def dispatch(self, request: Request, call_next):
        """Authenticate request via X-API-Key header and enforce IP and key rate limits."""
        if request.url.path in EXCLUDED_PATHS or request.url.path.startswith("/ws/"):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        api_key_header = request.headers.get("X-API-Key")
        if not api_key_header:
            return JSONResponse(status_code=401, content={"detail": "Missing API key"})

        client_ip = request.client.host if request.client else "unknown"
        ip_key = f"ratelimit:ip:{client_ip}"
        try:
            ip_count = await self.redis.incr(ip_key)
            if ip_count == 1:
                await self.redis.expire(ip_key, 3600)
            if ip_count > IP_LIMIT:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "IP rate limit exceeded. Max 300 requests/hour."},
                )
        except redis.RedisError:
            logger.warning("Redis unavailable for IP rate limit check; allowing request through")

        if api_key_header == settings.api_key:
            return await self._check_rate_and_forward(
                request, call_next, MASTER_KEY_ID, 1000
            )

        key_hash = hashlib.sha256(api_key_header.encode()).hexdigest()
        get_db_fn = request.app.dependency_overrides.get(_get_db, _get_db)
        gen = get_db_fn()
        session = await gen.__anext__()
        try:
            result = await session.execute(
                select(ApiKey).where(ApiKey.key_hash == key_hash)
            )
            api_key = result.scalar_one_or_none()
        except Exception:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        finally:
            await gen.aclose()

        if not api_key:
            return JSONResponse(status_code=401, content={"detail": "Invalid API key"})
        if not api_key.is_active:
            return JSONResponse(status_code=401, content={"detail": "API key is revoked"})

        return await self._check_rate_and_forward(
            request, call_next, str(api_key.id), api_key.rate_limit
        )

    async def _check_rate_and_forward(
        self,
        request: Request,
        call_next,
        key_id: str,
        rate_limit: int,
    ):
        """Check per-key rate limit, forward request, and attach rate-limit headers."""
        key = f"ratelimit:key:{key_id}"
        try:
            count = await self.redis.incr(key)
            if count == 1:
                await self.redis.expire(key, 3600)
            if count > rate_limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Rate limit exceeded. Max {rate_limit} requests/hour."},
                )
        except redis.RedisError:
            logger.warning("Redis unavailable for key rate limit check; allowing request through")
            count = 0

        response = await call_next(request)
        remaining = max(0, rate_limit - count)
        now = time.time()
        reset_at = int(now + 3600)
        response.headers["X-RateLimit-Limit"] = str(rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
