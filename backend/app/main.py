import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, cast

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import api_router
from app.config import check_settings, settings
from app.middleware.auth import ApiKeyMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.utils.log_sanitizer import sanitize_for_log

logger = logging.getLogger(__name__)


def _init_sentry() -> None:
    """Initialise Sentry SDK if a DSN is configured."""
    dsn = settings.sentry_dsn
    if dsn:
        sentry_sdk.init(
            dsn=dsn,
            enable_tracing=True,
            traces_sample_rate=0.1,
            profiles_sample_rate=0.1,
            send_default_pii=False,
        )
        logger.info("Sentry SDK initialised (DSN configured)")
    else:
        logger.info("Sentry DSN not set — error tracking disabled")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Verify settings on startup and clean up on shutdown."""
    check_settings()
    _init_sentry()
    yield


app = FastAPI(
    title="VulnScanner API",
    description="""Vulnerability scanner with IP, domain, and mobile scan modes.

## Authentication

| Method | Header | Use Case |
|--------|--------|----------|
| **JWT Bearer** | `Authorization: Bearer <token>` | Dashboard users (web UI) |
| **API Key** | `X-API-Key: <key>` | Programmatic / machine-to-machine |

**JWT auth** is the primary auth for the dashboard. See `/api/auth/*` endpoints.
**API Key auth** bypasses user auth for service-to-service calls.

## Scan Types

- **IP Scan** — Port scan via nmap (`-sV -sC -O`), CVE lookup via OSV.dev
- **Domain Scan** — DNS resolution, subdomain enum (crt.sh), SSL/TLS analysis
- **Mobile Scan** — APK/IPA manifest analysis, permission classification
""",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["X-API-Key", "Content-Type", "Authorization", "Accept"],
)

app.add_middleware(SecurityHeadersMiddleware)

# Prometheus metrics — registered before ApiKeyMiddleware so /metrics is open
from prometheus_fastapi_instrumentator import Instrumentator  # noqa: E402

instrumentator = Instrumentator().instrument(app)
instrumentator.expose(app, endpoint="/metrics", include_in_schema=True)

app.add_middleware(ApiKeyMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled exception: %s | path=%s method=%s",
        sanitize_for_log(str(exc)),
        request.url.path,
        request.method,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(api_router, prefix="/api")


@app.get("/health")
@app.get("/api/health")
async def health_check() -> JSONResponse:
    """Check database and Redis connectivity. Returns 200 if both are reachable, 503 if degraded."""
    import redis.asyncio as aioredis

    checks: dict[str, str] = {"status": "ok"}

    try:
        from sqlalchemy import text

        from app.database import engine

        async with engine.connect() as conn:
            _ = await conn.execute(text("SELECT 1"))
        checks["database"] = "connected"
    except Exception as e:
        checks["database"] = f"error: {e}"
        checks["status"] = "degraded"

    try:
        r = cast(Any, aioredis).from_url(settings.redis_url, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        checks["redis"] = "connected"
    except Exception as e:
        checks["redis"] = f"error: {e}"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "ok" else 503
    return JSONResponse(checks, status_code=status_code)
