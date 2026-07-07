import hashlib
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.api_key import ApiKey
from app.models.scan_job import ScanJob
from app.utils import hash_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

redis: Redis | None = None
_ws_rate_limit_redis: Redis | None = None

WS_RATE_LIMIT_MAX = settings.ws_rate_limit_max
WS_RATE_LIMIT_WINDOW = settings.ws_rate_limit_window
WS_RATE_LIMIT_PREFIX = "ratelimit:ws"
WS_KEY_LIMIT_MAX = settings.ws_key_rate_limit_max
WS_KEY_LIMIT_WINDOW = settings.ws_key_rate_limit_window
WS_KEY_LIMIT_PREFIX = "ratelimit:ws_key"


async def get_redis() -> Redis:
    """Return a shared Redis connection, creating it lazily on first call."""
    global redis
    if redis is None:
        redis = Redis.from_url(settings.redis_url)
    return redis


async def _get_ws_rate_limit_redis() -> Redis:
    """Return a Redis connection for WebSocket rate limiting (decode_responses=True)."""
    global _ws_rate_limit_redis
    if _ws_rate_limit_redis is None:
        _ws_rate_limit_redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _ws_rate_limit_redis


async def validate_api_key(api_key: str | None) -> bool:
    """Validate an API key. Returns True if valid, False otherwise."""
    if not api_key:
        return False

    # Check against master key from settings
    if api_key == settings.api_key:
        return True

    # Check against DB-stored keys
    key_hash = hash_key(api_key)
    async with async_session() as session:
        result = await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active.is_(True)))
        return result.scalar_one_or_none() is not None


@router.websocket("/ws/scan/{job_id}")
async def scan_progress(
    websocket: WebSocket,
    job_id: str,
    api_key: str | None = Query(None, alias="api_key"),
) -> None:
    """WebSocket endpoint that streams scan progress updates for a given job ID."""
    # Validate API key before accepting the connection
    if not await validate_api_key(api_key):
        await websocket.close(code=4001, reason="Unauthorized: invalid or missing API key")
        return

    # Defense-in-depth: verify the job exists (non-master keys must have valid job)
    is_master_key = api_key == settings.api_key
    if not is_master_key:
        async with async_session() as session:
            job_result = await session.execute(select(ScanJob.id).where(ScanJob.id == job_id))
            if not job_result.scalar_one_or_none():
                await websocket.close(code=4004, reason="Job not found")
                return

    # IP-based rate limiting
    client_ip = websocket.client.host if websocket.client else "unknown"
    key = f"{WS_RATE_LIMIT_PREFIX}:{client_ip}"
    try:
        rl = await _get_ws_rate_limit_redis()
        count = await rl.incr(key)
        if count == 1:
            await rl.expire(key, WS_RATE_LIMIT_WINDOW)
        if count > WS_RATE_LIMIT_MAX:
            logger.warning(
                "WebSocket rate limit hit: ip=%s count=%d/%d window=%ds",
                client_ip,
                count,
                WS_RATE_LIMIT_MAX,
                WS_RATE_LIMIT_WINDOW,
            )
            await websocket.close(code=4008, reason="Rate limit exceeded: max 10 WebSocket connections per minute")
            return
    except RedisError:
        logger.critical("Rate limit infrastructure unavailable for WebSocket (Redis down)")
        await websocket.close(code=4001, reason="Service temporarily unavailable")
        return

    # Per-key rate limiting
    key_hash = hashlib.sha256((api_key or "").encode()).hexdigest()
    key_rl_key = f"{WS_KEY_LIMIT_PREFIX}:{key_hash}"
    try:
        rl = await _get_ws_rate_limit_redis()
        key_count = await rl.incr(key_rl_key)
        if key_count == 1:
            await rl.expire(key_rl_key, WS_KEY_LIMIT_WINDOW)
        if key_count > WS_KEY_LIMIT_MAX:
            logger.warning(
                "WebSocket per-key rate limit hit: key_hash=%s count=%d/%d window=%ds",
                key_hash,
                key_count,
                WS_KEY_LIMIT_MAX,
                WS_KEY_LIMIT_WINDOW,
            )
            await websocket.close(code=4008, reason="Rate limit exceeded per API key")
            return
    except RedisError:
        logger.critical("Rate limit infrastructure unavailable for WebSocket key limit (Redis down)")
        await websocket.close(code=4001, reason="Service temporarily unavailable")
        return

    await websocket.accept()
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(f"scan_progress:{job_id}")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30.0)
            if message:
                await websocket.send_text(message["data"].decode())
            else:
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        logger.info("Client disconnected from job %s", job_id)
    finally:
        await pubsub.unsubscribe(f"scan_progress:{job_id}")
