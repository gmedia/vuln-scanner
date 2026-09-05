from __future__ import annotations

import logging
from uuid import UUID

import redis.asyncio as redis
from fastapi import HTTPException

from app.config import settings
from app.models.ai_gateway import AiApiKey

logger = logging.getLogger(__name__)

_redis: redis.Redis[str] | None = None


async def _client() -> redis.Redis[str]:
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _rpm_key(key_id: UUID) -> str:
    return f"ai:rpm:{key_id}"


def _tpm_key(key_id: UUID) -> str:
    return f"ai:tpm:{key_id}"


def _conc_key(key_id: UUID) -> str:
    return f"ai:conc:{key_id}"


async def acquire(key: AiApiKey, *, estimated_tokens: int) -> None:
    try:
        r = await _client()
        rpm = await r.incr(_rpm_key(key.id))
        if rpm == 1:
            await r.expire(_rpm_key(key.id), 60)
        if rpm > key.rate_limit_rpm:
            await r.decr(_rpm_key(key.id))
            raise HTTPException(status_code=429, detail="rate_limit_rpm")

        tpm = await r.incrby(_tpm_key(key.id), max(estimated_tokens, 1))
        if tpm == max(estimated_tokens, 1):
            await r.expire(_tpm_key(key.id), 60)
        if tpm > key.rate_limit_tpm:
            await r.incrby(_tpm_key(key.id), -max(estimated_tokens, 1))
            await r.decr(_rpm_key(key.id))
            raise HTTPException(status_code=429, detail="rate_limit_tpm")

        conc = await r.incr(_conc_key(key.id))
        await r.expire(_conc_key(key.id), 300)
        if conc > key.max_concurrent:
            await r.decr(_conc_key(key.id))
            await r.incrby(_tpm_key(key.id), -max(estimated_tokens, 1))
            await r.decr(_rpm_key(key.id))
            raise HTTPException(status_code=429, detail="rate_limit_concurrent")
    except HTTPException:
        raise
    except redis.RedisError:
        logger.critical("AI rate limit Redis unavailable")
        raise HTTPException(status_code=503, detail="rate_limit_unavailable") from None


async def release_concurrent(key_id: UUID) -> None:
    try:
        r = await _client()
        val = await r.decr(_conc_key(key_id))
        if val < 0:
            await r.delete(_conc_key(key_id))
    except redis.RedisError:
        logger.warning("AI concurrent release Redis unavailable")
