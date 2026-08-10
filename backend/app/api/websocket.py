from __future__ import annotations

import hashlib
import logging
from uuid import UUID

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.api_key import ApiKey
from app.models.scan_job import ScanJob
from app.models.user import User
from app.services.auth import decode_token
from app.services.organization import get_membership, role_at_least
from app.utils import hash_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

redis: Redis[bytes] | None = None
_ws_rate_limit_redis: Redis[str] | None = None

WS_RATE_LIMIT_MAX = settings.ws_rate_limit_max
WS_RATE_LIMIT_WINDOW = settings.ws_rate_limit_window
WS_RATE_LIMIT_PREFIX = "ratelimit:ws"
WS_KEY_LIMIT_MAX = settings.ws_key_rate_limit_max
WS_KEY_LIMIT_WINDOW = settings.ws_key_rate_limit_window
WS_KEY_LIMIT_PREFIX = "ratelimit:ws_key"


async def get_redis() -> Redis[bytes]:
    """Return a shared Redis connection, creating it lazily on first call."""
    global redis
    if redis is None:
        redis = Redis.from_url(settings.redis_url)
    return redis


async def _get_ws_rate_limit_redis() -> Redis[str]:
    """Return a Redis connection for WebSocket rate limiting (decode_responses=True)."""
    global _ws_rate_limit_redis
    if _ws_rate_limit_redis is None:
        _ws_rate_limit_redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _ws_rate_limit_redis


async def validate_api_key(api_key: str | None) -> bool:
    """Validate an API key. Returns True if valid, False otherwise."""
    if not api_key:
        return False

    if api_key == settings.api_key:
        return True

    key_hash = hash_key(api_key)
    async with async_session() as session:
        result = await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active.is_(True)))
        return result.scalar_one_or_none() is not None


def _extract_bearer(websocket: WebSocket, token_query: str | None) -> str | None:
    if token_query:
        return token_query
    authorization = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value:
        return None
    return value


async def _authorize_ws_connection(
    websocket: WebSocket,
    job_id: str,
    api_key: str | None,
    token: str | None,
) -> tuple[bool, str | None]:
    bearer = _extract_bearer(websocket, token)
    if bearer:
        try:
            payload = decode_token(bearer)
        except jwt.PyJWTError:
            await websocket.close(code=4001, reason="Unauthorized: invalid or expired token")
            return False, None
        if payload.get("type") != "access":
            await websocket.close(code=4001, reason="Unauthorized: access token required")
            return False, None
        user_id_raw = payload.get("sub")
        if not user_id_raw:
            await websocket.close(code=4001, reason="Unauthorized: token missing subject")
            return False, None
        try:
            user_id = UUID(str(user_id_raw))
        except ValueError:
            await websocket.close(code=4001, reason="Unauthorized: invalid user identifier")
            return False, None

        async with async_session() as session:
            user_result = await session.execute(select(User.id).where(User.id == user_id))
            if user_result.scalar_one_or_none() is None:
                await websocket.close(code=4001, reason="Unauthorized: user not found")
                return False, None

            job_result = await session.execute(select(ScanJob).where(ScanJob.id == job_id))
            job = job_result.scalar_one_or_none()
            if job is None:
                await websocket.close(code=4004, reason="Job not found")
                return False, None

            if job.user_id == user_id:
                return True, f"jwt:{user_id}"

            if job.organization_id is None:
                await websocket.close(code=4003, reason="Forbidden: not authorized for this job")
                return False, None

            membership = await get_membership(session, job.organization_id, user_id)
            if membership is None or not role_at_least(membership.role, "viewer"):
                await websocket.close(code=4003, reason="Forbidden: not authorized for this job")
                return False, None
            return True, f"jwt:{user_id}"

    if not await validate_api_key(api_key):
        await websocket.close(code=4001, reason="Unauthorized: invalid or missing credentials")
        return False, None

    is_master_key = api_key == settings.api_key
    if not is_master_key:
        async with async_session() as session:
            job_result = await session.execute(select(ScanJob.id).where(ScanJob.id == job_id))
            if not job_result.scalar_one_or_none():
                await websocket.close(code=4004, reason="Job not found")
                return False, None

    return True, f"key:{api_key or ''}"


@router.websocket("/ws/scan/{job_id}")
async def scan_progress(
    websocket: WebSocket,
    job_id: str,
    api_key: str | None = Query(None, alias="api_key"),
    token: str | None = Query(None, alias="token"),
) -> None:
    """WebSocket endpoint that streams scan progress updates for a given job ID."""
    authorized, identity = await _authorize_ws_connection(websocket, job_id, api_key, token)
    if not authorized:
        return

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

    identity_raw = identity or "unknown"
    key_hash = hashlib.sha256(identity_raw.encode()).hexdigest()
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
