import time
from collections import defaultdict
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings

EXCLUDED_PATHS = ["/health", "/api/health", "/docs", "/openapi.json", "/redoc"]


class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._rate_limits: defaultdict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in EXCLUDED_PATHS or request.url.path.startswith("/ws/"):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        api_key = request.headers.get("X-API-Key")
        if not api_key or api_key != settings.api_key:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

        now = time.time()
        window = now - 3600
        self._rate_limits[api_key] = [t for t in self._rate_limits[api_key] if t > window]

        if len(self._rate_limits[api_key]) >= 1000:
            raise HTTPException(status_code=429, detail="Rate limit exceeded. Max 1000 requests/hour.")

        self._rate_limits[api_key].append(now)
        return await call_next(request)
