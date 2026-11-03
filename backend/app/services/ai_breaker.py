from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import TYPE_CHECKING
from uuid import UUID

import redis
import redis.asyncio as redis_async

from app.config import settings

if TYPE_CHECKING:
    from app.services.ai_proxy import UpstreamCandidate

logger = logging.getLogger(__name__)

FAILS_KEY_TEMPLATE = "ai:cb:{provider_id}:fails"
OPEN_KEY_TEMPLATE = "ai:cb:{provider_id}:open"

_redis: redis_async.Redis[str] | None = None


async def _client() -> redis_async.Redis[str]:
    global _redis
    if _redis is None:
        _redis = redis_async.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _fails_key(provider_id: UUID) -> str:
    return FAILS_KEY_TEMPLATE.format(provider_id=provider_id)


def _open_key(provider_id: UUID) -> str:
    return OPEN_KEY_TEMPLATE.format(provider_id=provider_id)


def _window_seconds() -> int:
    return max(1, int(settings.ai_breaker_window_seconds))


def _cooldown_seconds() -> int:
    return max(1, int(settings.ai_breaker_cooldown_seconds))


async def _note_failure(client: redis_async.Redis[str], provider_id: UUID, reason: str) -> None:
    fails_key = _fails_key(provider_id)
    fails = await client.incr(fails_key)
    await client.expire(fails_key, _window_seconds())
    if fails >= settings.ai_breaker_failure_threshold:
        await client.set(_open_key(provider_id), "1", ex=_cooldown_seconds())
        logger.warning("ai_breaker_open", extra={"provider_id": str(provider_id), "reason": reason})


async def record_success(provider_id: UUID) -> None:
    try:
        client = await _client()
        await client.delete(_fails_key(provider_id), _open_key(provider_id))
    except redis.RedisError:
        logger.warning("ai_breaker_redis_unavailable", extra={"op": "record_success", "provider_id": str(provider_id)})


async def record_failure(provider_id: UUID, reason: str) -> None:
    try:
        await _note_failure(await _client(), provider_id, reason)
    except redis.RedisError:
        logger.warning("ai_breaker_redis_unavailable", extra={"op": "record_failure", "provider_id": str(provider_id)})


async def is_open(provider_id: UUID) -> bool:
    try:
        client = await _client()
        return bool(await client.exists(_open_key(provider_id)))
    except redis.RedisError:
        logger.warning("ai_breaker_redis_unavailable", extra={"op": "is_open", "provider_id": str(provider_id)})
        return False


async def filter_available(candidates: Sequence[UpstreamCandidate]) -> list[UpstreamCandidate]:
    if not candidates:
        return []
    provider_ids = list(dict.fromkeys(candidate.provider_id for candidate in candidates))
    try:
        client = await _client()
        pipe = client.pipeline()
        for provider_id in provider_ids:
            pipe.exists(_open_key(provider_id))
        states = await pipe.execute()
        open_providers = {pid for pid, state in zip(provider_ids, states, strict=True) if state}
        # Failing open is mandatory: an open breaker must never turn a priced request into a 404.
        if len(open_providers) >= len(provider_ids):
            logger.warning("ai_breaker_all_open", extra={"model_candidates": len(candidates)})
            return candidates if isinstance(candidates, list) else list(candidates)
        return [candidate for candidate in candidates if candidate.provider_id not in open_providers]
    except redis.RedisError:
        logger.warning("ai_breaker_redis_unavailable", extra={"op": "filter_available"})
        return candidates if isinstance(candidates, list) else list(candidates)
