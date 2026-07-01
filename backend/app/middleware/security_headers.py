import logging
from typing import Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.config import settings

logger = logging.getLogger(__name__)

SENSITIVE_PATH_PREFIXES = ("/api/auth/", "/api/admin/")

STS_MAX_AGE = 31536000


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security-focused response headers to every response."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)

        headers = response.headers

        if settings.cookie_secure:
            headers["Strict-Transport-Security"] = (
                f"max-age={STS_MAX_AGE}; includeSubDomains"
            )

        headers["X-Content-Type-Options"] = "nosniff"
        headers["X-Frame-Options"] = "DENY"
        headers["X-XSS-Protection"] = "0"
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

        if request.url.path.startswith(SENSITIVE_PATH_PREFIXES):
            headers["Cache-Control"] = "no-store, max-age=0"

        if "server" in headers:
            del headers["server"]

        return response
