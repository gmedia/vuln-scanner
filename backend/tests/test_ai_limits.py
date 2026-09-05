from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from redis.exceptions import RedisError

from app.services import ai_limits
from tests.conftest import _incr_counters


def _key(**overrides: object) -> SimpleNamespace:
    base = {
        "id": uuid.uuid4(),
        "rate_limit_rpm": 2,
        "rate_limit_tpm": 100,
        "max_concurrent": 1,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def _reset_counters() -> None:
    _incr_counters.clear()
    ai_limits._redis = None
    yield
    _incr_counters.clear()
    ai_limits._redis = None


@pytest.mark.asyncio
async def test_acquire_allows_under_limits() -> None:
    key = _key()
    await ai_limits.acquire(key, estimated_tokens=10)
    await ai_limits.release_concurrent(key.id)


@pytest.mark.asyncio
async def test_acquire_rpm_429() -> None:
    key = _key(rate_limit_rpm=1)
    await ai_limits.acquire(key, estimated_tokens=1)
    with pytest.raises(HTTPException) as exc:
        await ai_limits.acquire(key, estimated_tokens=1)
    assert exc.value.status_code == 429
    assert exc.value.detail == "rate_limit_rpm"


@pytest.mark.asyncio
async def test_acquire_tpm_429() -> None:
    key = _key(rate_limit_tpm=10)
    with pytest.raises(HTTPException) as exc:
        await ai_limits.acquire(key, estimated_tokens=50)
    assert exc.value.status_code == 429
    assert exc.value.detail == "rate_limit_tpm"


@pytest.mark.asyncio
async def test_acquire_concurrent_429() -> None:
    key = _key(max_concurrent=1)
    await ai_limits.acquire(key, estimated_tokens=1)
    with pytest.raises(HTTPException) as exc:
        await ai_limits.acquire(key, estimated_tokens=1)
    assert exc.value.status_code == 429
    assert exc.value.detail == "rate_limit_concurrent"


@pytest.mark.asyncio
async def test_redis_down_503() -> None:
    class Boom:
        async def incr(self, *_a: object, **_k: object) -> int:
            raise RedisError("down")

    with (
        patch.object(ai_limits, "_client", return_value=Boom()),
        pytest.raises(HTTPException) as exc,
    ):
        await ai_limits.acquire(_key(), estimated_tokens=1)
    assert exc.value.status_code == 503
    assert exc.value.detail == "rate_limit_unavailable"
