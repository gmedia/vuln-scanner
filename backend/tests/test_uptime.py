from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.uptime import UptimeEvent, UptimeMonitor, UptimeSample
from app.models.user import User
from app.schemas.uptime import normalize_http_target, normalize_tcp_target
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org
from app.services.uptime import UptimeService, enqueue_uptime_check
from app.services.uptime_apply import purge_old_uptime_rows
from app.services.uptime_probe import ProbeResult


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=100,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User, org_id: uuid.UUID | None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    owner = await _make_user(db_session, "up-owner@example.com")
    member = await _make_user(db_session, "up-member@example.com")
    viewer = await _make_user(db_session, "up-viewer@example.com")
    outsider = await _make_user(db_session, "up-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Uptime Org",
        slug=f"up-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    for user, role in ((owner, "owner"), (member, "member"), (viewer, "viewer")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role=role,
            )
        )
    await db_session.commit()
    return {"owner": owner, "member": member, "viewer": viewer, "outsider": outsider, "org": org}


@pytest.fixture(autouse=True)
def _stub_enqueue(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []

    def _capture(monitor_id: uuid.UUID) -> None:
        seen.append(str(monitor_id))

    monkeypatch.setattr("app.services.uptime.enqueue_uptime_check", _capture)
    return seen


def _bind_db(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest.mark.asyncio
async def test_ssrf_blocked():
    with pytest.raises(ValueError):
        normalize_http_target("http://127.0.0.1/")
    with pytest.raises(ValueError):
        normalize_http_target("http://10.0.0.1/")
    with pytest.raises(ValueError):
        normalize_tcp_target("192.168.1.1:22")
    assert normalize_http_target("https://example.com/health").startswith("https://")


@pytest.mark.asyncio
async def test_allow_private_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings
    from app.services.uptime_probe import _blocked_ip

    monkeypatch.setattr(settings, "uptime_allow_private", True)
    assert normalize_http_target("http://10.0.0.1/health") == "http://10.0.0.1/health"
    assert normalize_tcp_target("192.168.1.1:22") == "192.168.1.1:22"
    assert _blocked_ip("10.0.0.1", allow_private=True) is False
    assert _blocked_ip("10.0.0.1", allow_private=False) is True


@pytest.mark.asyncio
async def test_confirm_two_fails_then_up(db_session: AsyncSession, ctx: dict) -> None:
    org = ctx["org"]
    owner = ctx["owner"]
    monitor = UptimeMonitor(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by=owner.id,
        name="web",
        check_type="http",
        target="https://example.com",
        interval_seconds=60,
        timeout_seconds=10,
        enabled=True,
        state="unknown",
        consecutive_fails=0,
        next_check_at=datetime.now(UTC),
        notify_email=owner.email,
    )
    db_session.add(monitor)
    await db_session.commit()
    svc = UptimeService(db_session)
    fail = ProbeResult(ok=False, latency_ms=5, status_code=500, error="status 500")
    await svc.apply_probe(monitor, fail)
    await db_session.refresh(monitor)
    assert monitor.state != "down"
    await svc.apply_probe(monitor, fail)
    await db_session.refresh(monitor)
    assert monitor.state == "down"
    ok = ProbeResult(ok=True, latency_ms=5, status_code=200, error=None)
    await svc.apply_probe(monitor, ok)
    await db_session.refresh(monitor)
    assert monitor.state == "up"


@pytest.mark.asyncio
async def test_crud_idor_and_sku(db_session: AsyncSession, ctx: dict, _stub_enqueue: list[str]) -> None:
    _bind_db(db_session)
    owner, viewer, outsider, org = ctx["owner"], ctx["viewer"], ctx["outsider"], ctx["org"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={"name": "web", "check_type": "http", "target": "https://example.com/health"},
        )
        assert created.status_code == 201, created.text
        mid = created.json()["id"]
        assert mid in _stub_enqueue
        second = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={"name": "web2", "check_type": "http", "target": "https://example.org/"},
        )
        assert second.status_code == 400
        listed = await client.get("/api/uptime/monitors", headers=_auth(viewer, org.id))
        assert listed.status_code == 200
        assert len(listed.json()) == 1
        hidden = await client.get(f"/api/uptime/monitors/{mid}", headers=_auth(outsider, None))
        assert hidden.status_code in (400, 404)
        too_fast = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={
                "name": "fast",
                "check_type": "http",
                "target": "https://example.net/",
                "interval_seconds": 10,
            },
        )
        assert too_fast.status_code == 422
        paused = await client.post(
            f"/api/uptime/monitors/{mid}/pause",
            headers=_auth(owner, org.id),
        )
        assert paused.status_code == 200
        assert paused.json()["enabled"] is False
        samples = await client.get(
            f"/api/uptime/monitors/{mid}/samples",
            headers=_auth(owner, org.id),
            params={"from": "2020-01-01T00:00:00Z"},
        )
        assert samples.status_code == 200
        body = samples.json()
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)
        hidden_samples = await client.get(
            f"/api/uptime/monitors/{mid}/samples",
            headers=_auth(outsider, None),
        )
        assert hidden_samples.status_code in (400, 404)


@pytest.mark.asyncio
async def test_keyword_case_insensitive(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.uptime_probe as probe_mod

    class _Resp:
        status_code = 200
        content = b"Hello WORLD"

    class _Client:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def request(self, _method, _url, content=None):
            return _Resp()

    monkeypatch.setattr(probe_mod.httpx, "Client", _Client)
    monkeypatch.setattr(probe_mod, "resolve_public", lambda host, **k: "1.1.1.1")
    r = probe_mod.probe_http("https://example.com/", 5, None, "hello world", False)
    assert r.ok is True
    inverted = probe_mod.probe_http("https://example.com/", 5, None, "hello world", True)
    assert inverted.ok is False


@pytest.mark.asyncio
async def test_tls_sets_degraded(db_session: AsyncSession, ctx: dict) -> None:
    org = ctx["org"]
    owner = ctx["owner"]
    monitor = UptimeMonitor(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by=owner.id,
        name="tls",
        check_type="http",
        target="https://example.com",
        interval_seconds=60,
        timeout_seconds=10,
        enabled=True,
        state="up",
        consecutive_fails=0,
        next_check_at=datetime.now(UTC),
        notify_email=owner.email,
    )
    db_session.add(monitor)
    await db_session.commit()
    svc = UptimeService(db_session)
    ok = ProbeResult(ok=True, latency_ms=5, status_code=200, error=None, tls_days_left=3)
    await svc.apply_probe(monitor, ok)
    await db_session.refresh(monitor)
    assert monitor.state == "degraded"
    assert monitor.last_latency_ms == 5


@pytest.mark.asyncio
async def test_purge_old_uptime_rows(db_session: AsyncSession, ctx: dict) -> None:
    org = ctx["org"]
    owner = ctx["owner"]
    monitor = UptimeMonitor(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by=owner.id,
        name="purge",
        check_type="http",
        target="https://example.com/purge",
        interval_seconds=60,
        timeout_seconds=10,
        enabled=True,
        state="up",
        consecutive_fails=0,
        next_check_at=datetime.now(UTC),
        notify_email=owner.email,
    )
    db_session.add(monitor)
    await db_session.flush()
    old_sample = UptimeSample(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        checked_at=datetime.now(UTC) - timedelta(days=8),
        ok=True,
        latency_ms=1,
        status_code=200,
        error=None,
    )
    fresh_sample = UptimeSample(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        checked_at=datetime.now(UTC),
        ok=True,
        latency_ms=1,
        status_code=200,
        error=None,
    )
    old_event = UptimeEvent(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        from_state="up",
        to_state="down",
        at=datetime.now(UTC) - timedelta(days=91),
        notified=False,
        detail=None,
    )
    db_session.add_all([old_sample, fresh_sample, old_event])
    await db_session.commit()
    counts = await purge_old_uptime_rows(db_session)
    await db_session.commit()
    assert counts["samples"] >= 1
    assert counts["events"] >= 1
    remaining = await db_session.get(UptimeSample, fresh_sample.id)
    assert remaining is not None
    gone = await db_session.get(UptimeSample, old_sample.id)
    assert gone is None


def test_enqueue_logs_celery_error(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    from celery.exceptions import CeleryError

    def _boom(*_a, **_k):
        raise CeleryError("broker down")

    monkeypatch.setattr("app.services.uptime._celery.send_task", _boom)
    enqueue_uptime_check(uuid.uuid4())
    assert "uptime enqueue failed" in caplog.text


@pytest.mark.asyncio
async def test_ping_disabled_returns_501(db_session: AsyncSession, ctx: dict) -> None:
    _bind_db(db_session)
    owner, org = ctx["owner"], ctx["org"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={"name": "icmp", "check_type": "ping", "target": "example.com"},
        )
        assert res.status_code == 501


@pytest.mark.asyncio
async def test_heartbeat_create_and_ingest(db_session: AsyncSession, ctx: dict) -> None:
    _bind_db(db_session)
    owner, org = ctx["owner"], ctx["org"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={"name": "cron", "check_type": "heartbeat", "target": ""},
        )
        assert created.status_code == 201, created.text
        body = created.json()
        token = body["heartbeat_token"]
        assert token
        assert body["heartbeat_url"]
        assert "heartbeat_token_hash" not in body
        ping = await client.post(f"/api/uptime/heartbeat/{token}")
        assert ping.status_code == 204
        listed = await client.get("/api/uptime/monitors", headers=_auth(owner, org.id))
        row = next(m for m in listed.json() if m["id"] == body["id"])
        assert row["last_heartbeat_at"] is not None
        assert row.get("heartbeat_token") in (None, "")


def test_probe_heartbeat_stale() -> None:
    from app.services.uptime_probe import probe_heartbeat

    assert probe_heartbeat(None, 60).ok is False
    assert probe_heartbeat(datetime.now(UTC), 60).ok is True
    assert probe_heartbeat(datetime.now(UTC) - timedelta(minutes=10), 60).ok is False


@pytest.mark.asyncio
async def test_timeout_bounds_and_patch_idor(db_session: AsyncSession, ctx: dict) -> None:
    _bind_db(db_session)
    owner, outsider, org = ctx["owner"], ctx["outsider"], ctx["org"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        too_long = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={
                "name": "slow",
                "check_type": "http",
                "target": "https://example.com/health",
                "timeout_seconds": 31,
            },
        )
        assert too_long.status_code == 422
        created = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={
                "name": "ok-to",
                "check_type": "http",
                "target": "https://example.com/health",
                "timeout_seconds": 20,
                "expect_status": 204,
            },
        )
        assert created.status_code == 201, created.text
        mid = created.json()["id"]
        assert created.json()["timeout_seconds"] == 20
        assert created.json()["expect_status"] == 204
        patched = await client.patch(
            f"/api/uptime/monitors/{mid}",
            headers=_auth(owner, org.id),
            json={"timeout_seconds": 15},
        )
        assert patched.status_code == 200
        assert patched.json()["timeout_seconds"] == 15
        cleared = await client.patch(
            f"/api/uptime/monitors/{mid}",
            headers=_auth(owner, org.id),
            json={"expect_status": None},
        )
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["expect_status"] is None
        hidden = await client.patch(
            f"/api/uptime/monitors/{mid}",
            headers=_auth(outsider, None),
            json={"timeout_seconds": 12},
        )
        assert hidden.status_code in (400, 403, 404)
        await client.post(f"/api/uptime/monitors/{mid}/pause", headers=_auth(owner, org.id))
        omitted = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={
                "name": "default-to",
                "check_type": "http",
                "target": "https://example.com/ready",
            },
        )
        assert omitted.status_code == 201, omitted.text
        assert omitted.json()["timeout_seconds"] == 10
        assert omitted.json()["expect_status"] is None
        await client.post(
            f"/api/uptime/monitors/{omitted.json()['id']}/pause",
            headers=_auth(owner, org.id),
        )
        tcp = await client.post(
            "/api/uptime/monitors",
            headers=_auth(owner, org.id),
            json={"name": "tcp1", "check_type": "tcp", "target": "example.com:443", "expect_status": 200},
        )
        assert tcp.status_code == 422


@pytest.mark.asyncio
async def test_samples_pager_events_and_stats(db_session: AsyncSession, ctx: dict) -> None:
    _bind_db(db_session)
    owner, outsider, org = ctx["owner"], ctx["outsider"], ctx["org"]
    now = datetime.now(UTC)
    monitor = UptimeMonitor(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by=owner.id,
        name="pager",
        check_type="http",
        target="https://example.com/pager",
        interval_seconds=60,
        timeout_seconds=10,
        enabled=True,
        state="up",
        consecutive_fails=0,
        next_check_at=now,
        notify_email=owner.email,
    )
    db_session.add(monitor)
    await db_session.flush()
    rows = []
    for i in range(5):
        rows.append(
            UptimeSample(
                id=uuid.uuid4(),
                monitor_id=monitor.id,
                checked_at=now - timedelta(hours=i),
                ok=i != 1,
                latency_ms=10 + i,
                status_code=200 if i != 1 else 500,
                error=None if i != 1 else "status 500",
            )
        )
    too_old = UptimeSample(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        checked_at=now - timedelta(days=8),
        ok=True,
        latency_ms=1,
        status_code=200,
        error=None,
    )
    after_until = UptimeSample(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        checked_at=now - timedelta(minutes=5),
        ok=True,
        latency_ms=3,
        status_code=200,
        error=None,
    )
    down_at = now - timedelta(hours=10)
    up_at = now - timedelta(hours=8)
    prior_down = UptimeEvent(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        from_state="up",
        to_state="down",
        at=now - timedelta(hours=20),
        notified=False,
        detail="prior",
    )
    window_up = UptimeEvent(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        from_state="down",
        to_state="up",
        at=up_at,
        notified=True,
        detail="recovered",
    )
    window_down = UptimeEvent(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        from_state="up",
        to_state="down",
        at=down_at,
        notified=True,
        detail="outage",
    )
    db_session.add_all([*rows, too_old, after_until, prior_down, window_up, window_down])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        paged = await client.get(
            f"/api/uptime/monitors/{monitor.id}/samples",
            headers=_auth(owner, org.id),
            params={"limit": 2, "offset": 0},
        )
        assert paged.status_code == 200
        body = paged.json()
        assert body["total"] == 6
        assert len(body["items"]) == 2
        page2 = await client.get(
            f"/api/uptime/monitors/{monitor.id}/samples",
            headers=_auth(owner, org.id),
            params={"limit": 2, "offset": 2},
        )
        assert page2.status_code == 200
        assert page2.json()["total"] == 6
        assert len(page2.json()["items"]) == 2
        assert {row["id"] for row in paged.json()["items"]}.isdisjoint(
            {row["id"] for row in page2.json()["items"]}
        )
        clamped = await client.get(
            f"/api/uptime/monitors/{monitor.id}/samples",
            headers=_auth(owner, org.id),
            params={"from": (now - timedelta(days=30)).isoformat(), "limit": 500},
        )
        assert clamped.status_code == 200
        ids = {row["id"] for row in clamped.json()["items"]}
        assert str(too_old.id) not in ids
        until_cut = now - timedelta(hours=2)
        cut = await client.get(
            f"/api/uptime/monitors/{monitor.id}/samples",
            headers=_auth(owner, org.id),
            params={"until": until_cut.isoformat(), "limit": 500},
        )
        assert cut.status_code == 200
        cut_ids = {row["id"] for row in cut.json()["items"]}
        assert str(after_until.id) not in cut_ids

        stats = await client.get(
            f"/api/uptime/monitors/{monitor.id}/stats",
            headers=_auth(owner, org.id),
            params={"from": (now - timedelta(hours=6)).isoformat(), "until": now.isoformat()},
        )
        assert stats.status_code == 200
        sbody = stats.json()
        assert sbody["total_count"] >= 1
        assert sbody["ok_count"] <= sbody["total_count"]
        expected = round(100.0 * sbody["ok_count"] / sbody["total_count"], 2)
        assert sbody["uptime_pct"] == expected
        empty = await client.get(
            f"/api/uptime/monitors/{monitor.id}/stats",
            headers=_auth(owner, org.id),
            params={
                "from": (now - timedelta(days=6, hours=23)).isoformat(),
                "until": (now - timedelta(days=6, hours=22)).isoformat(),
            },
        )
        assert empty.status_code == 200
        assert empty.json()["uptime_pct"] is None
        assert empty.json()["total_count"] == 0
        hidden_stats = await client.get(
            f"/api/uptime/monitors/{monitor.id}/stats",
            headers=_auth(outsider, None),
        )
        assert hidden_stats.status_code in (400, 404)

        events = await client.get(
            f"/api/uptime/monitors/{monitor.id}/events",
            headers=_auth(owner, org.id),
            params={"from": (now - timedelta(hours=12)).isoformat(), "until": now.isoformat()},
        )
        assert events.status_code == 200
        event_ids = {row["id"] for row in events.json()}
        assert str(window_down.id) in event_ids
        assert str(window_up.id) in event_ids
        assert str(prior_down.id) in event_ids
        hidden_events = await client.get(
            f"/api/uptime/monitors/{monitor.id}/events",
            headers=_auth(outsider, None),
        )
        assert hidden_events.status_code in (400, 404)
