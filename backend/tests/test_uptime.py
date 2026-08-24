from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.uptime import UptimeMonitor
from app.models.user import User
from app.schemas.uptime import normalize_http_target, normalize_tcp_target
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org
from app.services.uptime import UptimeService
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
async def test_crud_idor_and_sku(db_session: AsyncSession, ctx: dict) -> None:
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
