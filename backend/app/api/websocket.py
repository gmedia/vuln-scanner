from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from app.config import settings

router = APIRouter(tags=["websocket"])

redis: Redis | None = None


async def get_redis():
    global redis
    if redis is None:
        redis = Redis.from_url(settings.redis_url)
    return redis


@router.websocket("/ws/scan/{job_id}")
async def scan_progress(websocket: WebSocket, job_id: str):
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
        pass
    finally:
        await pubsub.unsubscribe(f"scan_progress:{job_id}")
