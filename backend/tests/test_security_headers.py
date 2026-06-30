"""Tests for SecurityHeadersMiddleware — server header deletion and security header injection."""

from fastapi import FastAPI
from starlette.testclient import TestClient

from app.middleware.security_headers import SecurityHeadersMiddleware


def _make_app() -> FastAPI:
    """Create a minimal FastAPI app with SecurityHeadersMiddleware for testing."""
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    return app


class TestServerHeaderDeletion:
    def test_server_header_is_deleted_when_present(self):
        """When response has a 'server' header, SecurityHeadersMiddleware deletes it (line 38)."""
        import asyncio
        from unittest.mock import MagicMock

        from starlette.responses import Response as StarletteResponse

        middleware = SecurityHeadersMiddleware(MagicMock())
        request = MagicMock()
        request.url.path = "/test"

        # Build a response that HAS a 'server' header
        response = StarletteResponse()
        response.headers["server"] = "uvicorn"

        async def call_next(req):
            return response

        result = asyncio.run(middleware.dispatch(request, call_next))
        assert "server" not in result.headers

    def test_no_error_when_server_header_absent(self):
        """When response does NOT have 'server' header, no error occurs."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


class TestSecurityHeadersPresent:
    def test_x_content_type_options_is_set(self):
        """X-Content-Type-Options header is set to nosniff."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"

    def test_x_frame_options_is_set(self):
        """X-Frame-Options header is set to DENY."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert resp.headers["X-Frame-Options"] == "DENY"

    def test_x_xss_protection_is_set(self):
        """X-XSS-Protection header is set to 0."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert resp.headers["X-XSS-Protection"] == "0"

    def test_referrer_policy_is_set(self):
        """Referrer-Policy header is set to strict-origin-when-cross-origin."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_permissions_policy_is_set(self):
        """Permissions-Policy header is set correctly."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert "camera=()" in resp.headers["Permissions-Policy"]
        assert "microphone=()" in resp.headers["Permissions-Policy"]
        assert "geolocation=()" in resp.headers["Permissions-Policy"]


class TestSensitivePathCacheControl:
    def test_sensitive_path_gets_no_store(self):
        """Requests to /api/auth/ paths get Cache-Control: no-store."""
        app = _make_app()

        @app.get("/api/auth/login")
        async def auth_login():
            return {"ok": True}

        client = TestClient(app)
        resp = client.get("/api/auth/login")
        assert resp.headers["Cache-Control"] == "no-store, max-age=0"

    def test_non_sensitive_path_no_cache_control(self):
        """Requests to non-sensitive paths do NOT get Cache-Control."""
        app = _make_app()
        client = TestClient(app)

        resp = client.get("/test")
        assert "Cache-Control" not in resp.headers
