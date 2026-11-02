from __future__ import annotations

import uuid

import pytest
from redis.exceptions import RedisError

from app.config import settings
from app.services import ai_breaker
from app.services.ai_proxy import UpstreamCandidate


class FakeAsyncRedis:
    def __init__(self, store: dict[str, str] | None = None) -> None:
        self.store: dict[str, str] = store if store is not None else {}
        self.expires: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        value = int(self.store.get(key, 0)) + 1
        self.store[key] = str(value)
        return value

    async def expire(self, key: str, seconds: int) -> bool:
        self.expires[key] = seconds
        return True

    async def exists(self, key: str) -> int:
        return 1 if key in self.store else 0

    async def delete(self, *keys: str) -> int:
        return sum(1 for key in keys if self.store.pop(key, None) is not None)

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self.store[key] = value
        if ex is not None:
            self.expires[key] = ex
        return True

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)


class FakePipeline:
    def __init__(self, client: FakeAsyncRedis) -> None:
        self._client = client
        self._keys: list[str] = []

    def exists(self, key: str) -> FakePipeline:
        self._keys.append(key)
        return self

    async def execute(self) -> list[int]:
        return [1 if key in self._client.store else 0 for key in self._keys]


class FakeSyncRedis:
    def __init__(self, store: dict[str, str]) -> None:
        self._store = store
        self.closed = False

    def incr(self, key: str) -> int:
        value = int(self._store.get(key, 0)) + 1
        self._store[key] = str(value)
        return value

    def expire(self, key: str, seconds: int) -> bool:
        return True

    def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._store[key] = value
        return True

    def delete(self, *keys: str) -> int:
        return sum(1 for key in keys if self._store.pop(key, None) is not None)

    def close(self) -> None:
        self.closed = True


class BoomAsyncRedis:
    async def incr(self, *_args: object, **_kwargs: object) -> int:
        raise RedisError("down")

    async def expire(self, *_args: object, **_kwargs: object) -> bool:
        raise RedisError("down")

    async def exists(self, *_args: object, **_kwargs: object) -> int:
        raise RedisError("down")

    async def delete(self, *_args: object, **_kwargs: object) -> int:
        raise RedisError("down")

    async def set(self, *_args: object, **_kwargs: object) -> bool:
        raise RedisError("down")

    def pipeline(self) -> FakePipeline:
        raise RedisError("down")


class BoomSyncRedis:
    def incr(self, *_args: object, **_kwargs: object) -> int:
        raise RedisError("down")

    def expire(self, *_args: object, **_kwargs: object) -> bool:
        raise RedisError("down")

    def set(self, *_args: object, **_kwargs: object) -> bool:
        raise RedisError("down")

    def delete(self, *_args: object, **_kwargs: object) -> int:
        raise RedisError("down")

    def close(self) -> None:
        return None


def _candidate(provider_id: uuid.UUID, status: str = "ok") -> UpstreamCandidate:
    return UpstreamCandidate(
        provider_id=provider_id,
        upstream_id="up",
        base_url="https://up.example/v1",
        auth_header="Authorization",
        credential_enc="enc",
        max_tokens_cap=None,
        hpp_in=None,
        hpp_out=None,
        provider_status=status,
    )


def _fails_key(provider_id: uuid.UUID) -> str:
    return ai_breaker.FAILS_KEY_TEMPLATE.format(provider_id=provider_id)


def _open_key(provider_id: uuid.UUID) -> str:
    return ai_breaker.OPEN_KEY_TEMPLATE.format(provider_id=provider_id)


@pytest.fixture(autouse=True)
def _fake_client(monkeypatch: pytest.MonkeyPatch) -> FakeAsyncRedis:
    fake = FakeAsyncRedis()
    monkeypatch.setattr(ai_breaker, "_redis", fake)
    return fake


@pytest.mark.asyncio
async def test_record_failure_below_threshold_keeps_closed(_fake_client: FakeAsyncRedis) -> None:
    provider_id = uuid.uuid4()

    for _ in range(settings.ai_breaker_failure_threshold - 1):
        await ai_breaker.record_failure(provider_id, "server_error")

    assert await ai_breaker.is_open(provider_id) is False
    assert _fake_client.store[_fails_key(provider_id)] == str(settings.ai_breaker_failure_threshold - 1)
    assert _fake_client.expires[_fails_key(provider_id)] == int(settings.ai_breaker_window_seconds)


@pytest.mark.asyncio
async def test_reaching_threshold_opens_breaker(_fake_client: FakeAsyncRedis) -> None:
    provider_id = uuid.uuid4()

    for _ in range(settings.ai_breaker_failure_threshold):
        await ai_breaker.record_failure(provider_id, "server_error")

    assert await ai_breaker.is_open(provider_id) is True
    assert _fake_client.store[_open_key(provider_id)] == "1"
    assert _fake_client.expires[_open_key(provider_id)] == int(settings.ai_breaker_cooldown_seconds)


@pytest.mark.asyncio
async def test_record_success_clears_both_keys(_fake_client: FakeAsyncRedis) -> None:
    provider_id = uuid.uuid4()
    for _ in range(settings.ai_breaker_failure_threshold):
        await ai_breaker.record_failure(provider_id, "server_error")
    assert await ai_breaker.is_open(provider_id) is True

    await ai_breaker.record_success(provider_id)

    assert _fails_key(provider_id) not in _fake_client.store
    assert _open_key(provider_id) not in _fake_client.store
    assert await ai_breaker.is_open(provider_id) is False


@pytest.mark.asyncio
async def test_filter_available_drops_open_providers(_fake_client: FakeAsyncRedis) -> None:
    open_id, first_ok, second_ok = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for _ in range(settings.ai_breaker_failure_threshold):
        await ai_breaker.record_failure(open_id, "server_error")

    result = await ai_breaker.filter_available([_candidate(open_id), _candidate(first_ok), _candidate(second_ok)])

    assert [candidate.provider_id for candidate in result] == [first_ok, second_ok]


@pytest.mark.asyncio
async def test_filter_available_returns_original_when_all_open(_fake_client: FakeAsyncRedis) -> None:
    first, second = uuid.uuid4(), uuid.uuid4()
    for provider_id in (first, second):
        for _ in range(settings.ai_breaker_failure_threshold):
            await ai_breaker.record_failure(provider_id, "server_error")
    candidates = [_candidate(first), _candidate(second)]

    result = await ai_breaker.filter_available(candidates)

    assert result is candidates


@pytest.mark.asyncio
async def test_redis_errors_degrade_safely(monkeypatch: pytest.MonkeyPatch) -> None:
    provider_id = uuid.uuid4()
    candidates = [_candidate(provider_id)]
    monkeypatch.setattr(ai_breaker, "_redis", BoomAsyncRedis())
    monkeypatch.setattr(ai_breaker, "_sync_client", lambda: BoomSyncRedis())

    await ai_breaker.record_success(provider_id)
    await ai_breaker.record_failure(provider_id, "server_error")
    assert await ai_breaker.is_open(provider_id) is False
    assert await ai_breaker.filter_available(candidates) == candidates
    ai_breaker.record_success_sync(provider_id)
    ai_breaker.record_failure_sync(provider_id, "server_error")


@pytest.mark.asyncio
async def test_sync_and_async_share_key_names(monkeypatch: pytest.MonkeyPatch, _fake_client: FakeAsyncRedis) -> None:
    provider_id = uuid.uuid4()
    monkeypatch.setattr(ai_breaker, "_sync_client", lambda: FakeSyncRedis(_fake_client.store))

    ai_breaker.record_failure_sync(provider_id, "server_error")
    await ai_breaker.record_failure(provider_id, "server_error")

    assert _fake_client.store[_fails_key(provider_id)] == "2"

    await ai_breaker.record_success(provider_id)

    assert _fails_key(provider_id) not in _fake_client.store
    assert _open_key(provider_id) not in _fake_client.store
