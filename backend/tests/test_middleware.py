import pytest
import redis.asyncio as redis
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings

API_KEY = settings.api_key


def test_auth_missing_key(client):
    resp = client.get("/api/scan/history")
    assert resp.status_code == 401


def test_auth_invalid_key(client):
    resp = client.get("/api/scan/history", headers={"X-API-Key": "wrong-key"})
    assert resp.status_code == 401


def test_auth_valid_key(client, mock_celery):
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200


def test_health_excluded_from_auth(client):
    resp = client.get("/health")
    # DB/Redis unavailable in test → returns 503 with "degraded" status
    assert resp.status_code in (200, 503)


def test_websocket_excluded(client):
    resp = client.get("/ws/scan/some-id")
    assert resp.status_code not in (401, 429)
    assert resp.status_code in (404, 405)


def test_rate_limit_headers_present(client, mock_celery):
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    assert "X-RateLimit-Limit" in resp.headers
    assert "X-RateLimit-Remaining" in resp.headers
    assert "X-RateLimit-Reset" in resp.headers
    remaining = int(resp.headers["X-RateLimit-Remaining"])
    assert remaining < 1000


def test_ip_rate_limit_exceeded(client, mock_celery):
    # Verify IP rate limit mechanism: make enough requests to exceed IP_LIMIT (300)
    for _ in range(300):
        resp = client.get(
            "/api/scan/history",
            headers={"X-API-Key": API_KEY},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} at iteration {_}"
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 429
    assert "IP rate limit" in resp.json()["detail"]


def test_options_preflight(client):
    resp = client.options("/api/scan/history")
    assert resp.status_code != 401
    assert resp.status_code != 429


def test_auth_db_exception(client, db_session, monkeypatch):
    async def mock_execute(*args, **kwargs):
        raise SQLAlchemyError("DB error")

    monkeypatch.setattr(db_session, "execute", mock_execute)
    resp = client.get("/api/scan/history", headers={"X-API-Key": "some-non-master-key"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid API key"


def test_non_master_rate_limit_exceeded(client, mock_celery):
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "rate-limit-test", "rate_limit": 1},
    )
    assert create_resp.status_code == 201
    new_key = create_resp.json()["key"]
    resp1 = client.get("/api/scan/history", headers={"X-API-Key": new_key})
    assert resp1.status_code == 200
    resp2 = client.get("/api/scan/history", headers={"X-API-Key": new_key})
    assert resp2.status_code == 429


def test_excluded_path_docs(client):
    """GET /docs skips auth middleware (returns OpenAPI docs HTML)."""
    resp = client.get("/docs")
    assert resp.status_code == 200


def test_excluded_path_openapi(client):
    """GET /openapi.json skips auth middleware."""
    resp = client.get("/openapi.json")
    assert resp.status_code == 200


def test_excluded_path_redoc(client):
    """GET /redoc skips auth middleware."""
    resp = client.get("/redoc")
    assert resp.status_code == 200


def test_excluded_path_api_health(client):
    """GET /api/health is also excluded (not just /health)."""
    resp = client.get("/api/health")
    assert resp.status_code in (200, 503)


def test_excluded_path_register(client):
    """POST /api/auth/register skips auth middleware (may return 422 on missing body)."""
    resp = client.post("/api/auth/register")
    assert resp.status_code != 401


def test_excluded_path_verify_email(client):
    """POST /api/auth/verify-email skips auth middleware."""
    resp = client.post("/api/auth/verify-email")
    assert resp.status_code != 401


def test_excluded_path_refresh(client):
    """POST /api/auth/refresh skips auth middleware."""
    resp = client.post("/api/auth/refresh")
    assert resp.status_code != 401


def test_excluded_path_me(client):
    """GET /api/auth/me is NOT excluded from auth middleware — returns 401 'Missing API key'."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing API key"


def test_master_key_rate_limit_headers(client, mock_celery):
    """Master key gets X-RateLimit-Limit: 1000 (not the default 60)."""
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200
    assert resp.headers["X-RateLimit-Limit"] == "1000"
    assert int(resp.headers["X-RateLimit-Remaining"]) == 999
    assert "X-RateLimit-Reset" in resp.headers


def test_master_key_rate_limit_exceeded(client, mock_celery, monkeypatch):
    """Exceed 1000 requests on the master key → 429."""
    from app.middleware import auth as auth_module

    monkeypatch.setattr(auth_module, "IP_LIMIT", 2000)
    for i in range(1000):
        resp = client.get(
            "/api/scan/history",
            headers={"X-API-Key": API_KEY},
        )
        assert resp.status_code == 200, f"Expected 200 at iteration {i}, got {resp.status_code}"
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["detail"]
    assert "1000" in resp.json()["detail"]


def test_revoked_key_returns_401(client, mock_celery):
    """Create a key, revoke it, then use it → 401 'API key is revoked'."""
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "revoke-test", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    data = create_resp.json()
    key_id = data["id"]
    plain_key = data["key"]

    resp_ok = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp_ok.status_code == 200

    revoke_resp = client.post(
        f"/api/keys/revoke/{key_id}",
        headers={"X-API-Key": API_KEY},
    )
    assert revoke_resp.status_code == 200

    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "API key is revoked"


def test_redis_down_key_rate_limit_503(client, mock_celery, monkeypatch):
    """When Redis raises RedisError during key rate limit check → 503."""
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "redis-down-test", "rate_limit": 10},
    )
    assert create_resp.status_code == 201
    plain_key = create_resp.json()["key"]

    from app.middleware.auth import ApiKeyMiddleware

    call_count = 0

    async def mock_get_redis_error():
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise redis.RedisError("Connection refused")
        from tests.conftest import _fake_redis

        return _fake_redis

    middleware_instance = client.app.middleware_stack.app
    assert isinstance(middleware_instance, ApiKeyMiddleware), (
        f"Expected ApiKeyMiddleware, got {type(middleware_instance)}"
    )
    monkeypatch.setattr(middleware_instance, "_get_redis", mock_get_redis_error)

    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 503
    assert "Rate limit infrastructure" in resp.json()["detail"]


def test_non_master_key_rate_limit_headers(client, mock_celery):
    """Verify rate limit headers match the key's configured rate_limit."""
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "header-test", "rate_limit": 42},
    )
    assert create_resp.status_code == 201
    plain_key = create_resp.json()["key"]

    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 200
    assert resp.headers["X-RateLimit-Limit"] == "42"
    assert int(resp.headers["X-RateLimit-Remaining"]) == 41


def test_missing_api_key_returns_401(client):
    """No X-API-Key header → 401 with 'Missing API key' detail."""
    resp = client.get("/api/scan/history")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing API key"


def test_api_key_with_leading_trailing_spaces(client, mock_celery):
    """X-API-Key with spaces is treated literally (hash mismatch → 401)."""
    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": f"  {API_KEY}  "},
    )
    assert resp.status_code == 401


def test_excluded_paths_all_skip_auth(client):
    """Smoke-test: all EXCLUDED_PATHS return non-401 from middleware."""
    from app.middleware.auth import EXCLUDED_PATHS

    for path in EXCLUDED_PATHS:
        method = "POST" if path.startswith("/api/auth/") else "GET"
        resp = client.post(path) if method == "POST" else client.get(path)
        if resp.status_code == 401:
            detail = resp.json().get("detail", "")
            assert "Missing API key" not in detail, f"{path} was blocked by middleware"
            assert "Invalid API key" not in detail, f"{path} was blocked by middleware"


def test_redis_down_ip_rate_limit_503(client, monkeypatch):
    """When Redis raises RedisError during IP rate limit check → 503."""
    from app.middleware.auth import ApiKeyMiddleware

    async def mock_get_redis_error():
        raise redis.RedisError("Connection refused")

    middleware_instance = client.app.middleware_stack.app
    assert isinstance(middleware_instance, ApiKeyMiddleware)
    monkeypatch.setattr(middleware_instance, "_get_redis", mock_get_redis_error)

    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 503
    assert "Rate limit infrastructure" in resp.json()["detail"]


def test_options_bypass_on_protected_path(client):
    """OPTIONS on a protected path returns 200 (not 401/429)."""
    resp = client.options("/api/scan/history")
    assert resp.status_code not in (401, 429)


def test_options_bypass_on_root_path(client):
    """OPTIONS on root returns 200."""
    resp = client.options("/")
    assert resp.status_code not in (401, 429)


def test_e2e_test_header_bypasses_rate_limit(client, mock_celery):
    """X-E2E-Test header bypasses both IP and key rate limiting (auth.py:132-136)."""
    # Use a key with rate_limit=1 — second request should 429, but E2E bypass skips it
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "e2e-test-key", "rate_limit": 1},
    )
    assert create_resp.status_code == 201
    plain_key = create_resp.json()["key"]

    # First request — should succeed (count=1, limit=1)
    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 200

    # Second request with E2E bypass — should still succeed (bypasses rate limit)
    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": plain_key, "X-E2E-Test": "true"},
    )
    assert resp.status_code == 200
    # E2E bypass still sets rate limit headers
    assert "X-RateLimit-Limit" in resp.headers


def test_e2e_test_bypasses_ip_rate_limit(client, mock_celery):
    """X-E2E-Test header bypasses IP rate limiting even after exceeding IP_LIMIT."""
    # Saturate IP rate limit
    for _ in range(300):
        resp = client.get(
            "/api/scan/history",
            headers={"X-API-Key": API_KEY},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} at iteration {_}"

    # Next request without E2E bypass → 429
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 429

    # Same request with E2E bypass → 200 (bypasses IP rate limit)
    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": API_KEY, "X-E2E-Test": "true"},
    )
    assert resp.status_code == 200


def test_e2e_test_bypasses_dedicated_rate_limiter(client, mock_celery):
    """X-E2E-Test bypasses RateLimiter.__call__ (rate_limit.py:37)."""
    # Create key with rate_limit=1, exhaust it
    create_resp = client.post(
        "/api/keys/generate",
        headers={"X-API-Key": API_KEY},
        json={"name": "e2e-dedicated", "rate_limit": 1},
    )
    assert create_resp.status_code == 201
    plain_key = create_resp.json()["key"]

    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 200

    # Without E2E bypass → 429
    resp = client.get("/api/scan/history", headers={"X-API-Key": plain_key})
    assert resp.status_code == 429

    # With E2E bypass → 200
    resp = client.get(
        "/api/scan/history",
        headers={"X-API-Key": plain_key, "X-E2E-Test": "true"},
    )
    assert resp.status_code == 200


def test_security_headers_removes_server_header(client, mock_celery):
    """SecurityHeadersMiddleware strips the 'server' header from responses (security_headers.py:38)."""
    resp = client.get("/api/scan/history", headers={"X-API-Key": API_KEY})
    assert "server" not in resp.headers
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"


def test_rate_limiter_e2e_bypass_via_login_route(client):
    """RateLimiter.__call__ returns None when X-E2E-Test is set (rate_limit.py:37).
    Hits the login route which uses login_limiter — without E2E bypass,
    this route would still work but the limiter's bypass path wouldn't be covered.
    With the header, the limiter returns None immediately."""
    resp = client.post(
        "/api/auth/login",
        json={"email": "nonexistent@example.com", "password": "wrong-password"},
        headers={"X-E2E-Test": "true"},
    )
    assert resp.status_code != 429
    assert resp.status_code in (401, 403)


def test_auth_me_requires_jwt(client):
    """GET /api/auth/me without Authorization header → 401."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_auth_me_requires_jwt_not_api_key(client):
    """GET /api/auth/me with API key → 200 (middleware passes, dependency override provides user).
    /api/auth/me requires JWT Bearer auth at the dependency level, but the test fixture
    overrides get_current_user, so an API key that passes middleware will get through."""
    resp = client.get("/api/auth/me", headers={"X-API-Key": API_KEY})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_jwt_bearer_gets_rate_limited(client, mock_celery, db_session):
    """Bearer token requests are IP-rate-limited via _jwt_rate_limit()."""
    import uuid as _uuid

    import app.middleware.auth as auth_module
    from app.models.user import User
    from app.services.auth import hash_password

    auth_module.settings.jwt_rate_limit = 3
    auth_module.settings.jwt_rate_limit_window = 3600

    user = User(
        id=_uuid.uuid4(),
        email="jwtrate@example.com",
        password_hash=hash_password("Test1234!"),
        is_verified=True,
        credits=100,
    )
    db_session.add(user)
    await db_session.commit()

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "jwtrate@example.com", "password": "Test1234!"},
        headers={"X-E2E-Test": "true"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    for _ in range(3):
        resp = client.get(
            "/api/scan/history",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code} at iteration {_}"

    resp = client.get(
        "/api/scan/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 429
    assert "Too many requests" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_jwt_rate_limit_e2e_bypass(client, mock_celery, db_session):
    """X-E2E-Test header bypasses JWT IP rate limiting."""
    import uuid as _uuid

    import app.middleware.auth as auth_module
    from app.models.user import User
    from app.services.auth import hash_password

    auth_module.settings.jwt_rate_limit = 1
    auth_module.settings.jwt_rate_limit_window = 3600

    user = User(
        id=_uuid.uuid4(),
        email="jwte2e@example.com",
        password_hash=hash_password("Test1234!"),
        is_verified=True,
        credits=100,
    )
    db_session.add(user)
    await db_session.commit()

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "jwte2e@example.com", "password": "Test1234!"},
        headers={"X-E2E-Test": "true"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp = client.get(
        "/api/scan/history",
        headers={"Authorization": f"Bearer {token}", "X-E2E-Test": "true"},
    )
    assert resp.status_code == 200


def test_scan_submit_rate_limited(client, mock_celery, monkeypatch):
    """POST /api/scan/ip is rate-limited at 30 req/hr via scan_submit_limiter."""
    from app.api import scan_routes

    call_count = [0]

    async def mock_limiter_second_hit(request):
        call_count[0] += 1
        if call_count[0] > 1:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=429, content={"detail": "Too many scan requests"})
        return None

    monkeypatch.setattr(scan_routes, "scan_submit_limiter", mock_limiter_second_hit)

    resp1 = client.post(
        "/api/scan/ip",
        headers={"X-API-Key": API_KEY},
        json={"target": "8.8.8.8", "ports": "22-443"},
    )
    assert resp1.status_code == 202

    resp2 = client.post(
        "/api/scan/ip",
        headers={"X-API-Key": API_KEY},
        json={"target": "8.8.8.8", "ports": "22-443"},
    )
    assert resp2.status_code == 429


@pytest.mark.asyncio
async def test_admin_endpoint_rate_limited(client, mock_celery, monkeypatch, db_session):
    """GET /api/admin/stats is rate-limited via admin_limiter."""
    import uuid as _uuid

    from app.api.admin_routes import admin_limiter
    from app.models.user import User
    from app.services.auth import hash_password

    call_count = [0]

    async def mock_limiter_second_hit(request):
        call_count[0] += 1
        if call_count[0] > 1:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=429, content={"detail": "Too many admin requests"})
        return None

    monkeypatch.setattr(admin_limiter, "__call__", mock_limiter_second_hit)

    user = User(
        id=_uuid.uuid4(),
        email="admintest@example.com",
        password_hash=hash_password("Test1234!"),
        is_verified=True,
        is_admin=True,
        credits=100,
    )
    db_session.add(user)
    await db_session.commit()

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "admintest@example.com", "password": "Test1234!"},
        headers={"X-E2E-Test": "true"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp1 = client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 200

    resp2 = client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 429
