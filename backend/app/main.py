from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import check_settings, settings
from app.middleware.auth import ApiKeyMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Verify settings on startup and clean up on shutdown."""
    check_settings()
    yield


app = FastAPI(
    title="Vuln Scanner API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(ApiKeyMiddleware)

app.include_router(api_router, prefix="/api")


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Check database and Redis connectivity. Returns 200 if both are reachable, 503 if degraded."""
    import redis.asyncio as aioredis

    checks = {"status": "ok"}

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
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        checks["redis"] = "connected"
    except Exception as e:
        checks["redis"] = f"error: {e}"
        checks["status"] = "degraded"

    status_code = 200 if checks["status"] == "ok" else 503
    from starlette.responses import JSONResponse

    return JSONResponse(checks, status_code=status_code)
