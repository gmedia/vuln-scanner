import hashlib
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
from redis.asyncio import Redis
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.api_key import ApiKey

router = APIRouter(tags=["websocket"])

redis: Redis | None = None


async def get_redis():
    global redis
    if redis is None:
        redis = Redis.from_url(settings.redis_url)
    return redis


async def validate_api_key(api_key: str | None) -> bool:
    """Validate an API key. Returns True if valid, False otherwise."""
    if not api_key:
        return False

    # Check against master key from settings
    if api_key == settings.api_key:
        return True

    # Check against DB-stored keys
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    async with async_session() as session:
        result = await session.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active.is_(True))
        )
        return result.scalar_one_or_none() is not None


@router.websocket("/ws/scan/{job_id}")
async def scan_progress(
    websocket: WebSocket,
    job_id: str,
    api_key: str | None = Query(None, alias="api_key"),
):
    # Validate API key before accepting the connection
    if not await validate_api_key(api_key):
        await websocket.close(code=4001, reason="Unauthorized: invalid or missing API key")
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
