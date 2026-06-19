import time
import hashlib
from collections import defaultdict
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select
from app.config import settings
from app.database import get_db as _get_db
from app.models.api_key import ApiKey

EXCLUDED_PATHS = ["/health", "/api/health", "/docs", "/openapi.json", "/redoc"]

MASTER_KEY_ID = "__master__"
IP_LIMIT = 300


class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._rate_limits: dict[str, list[float]] = defaultdict(list)
        self._ip_limits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in EXCLUDED_PATHS or request.url.path.startswith("/ws/"):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        api_key_header = request.headers.get("X-API-Key")
        if not api_key_header:
            return JSONResponse(status_code=401, content={"detail": "Missing API key"})

        now = time.time()
        window = now - 3600

        client_ip = request.client.host if request.client else "unknown"
        self._ip_limits[client_ip] = [t for t in self._ip_limits[client_ip] if t > window]
        if len(self._ip_limits[client_ip]) >= IP_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "IP rate limit exceeded. Max 300 requests/hour."},
            )
        self._ip_limits[client_ip].append(now)

        if api_key_header == settings.api_key:
            return await self._check_rate_and_forward(
                request, call_next, MASTER_KEY_ID, 1000, now, window
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
            request, call_next, str(api_key.id), api_key.rate_limit, now, window
        )

    async def _check_rate_and_forward(
        self,
        request: Request,
        call_next,
        key_id: str,
        rate_limit: int,
        now: float,
        window: float,
    ):
        self._rate_limits[key_id] = [
            t for t in self._rate_limits[key_id] if t > window
        ]

        if len(self._rate_limits[key_id]) >= rate_limit:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {rate_limit} requests/hour."},
            )

        self._rate_limits[key_id].append(now)

        response = await call_next(request)
        remaining = max(0, rate_limit - len(self._rate_limits[key_id]))
        reset_at = int(window + 3600)
        response.headers["X-RateLimit-Limit"] = str(rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_at)
        return response
