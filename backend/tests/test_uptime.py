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
