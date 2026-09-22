from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.guard import GuardAgent
from app.models.host_protect import HostScan, HostSite
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.host_agent_ingest import generate_results_token
from app.services.organization import ensure_personal_org


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=50,
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


def _bind_db(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "host_protect_enabled", True)
    owner = await _make_user(db_session, "ow-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="OnWrite Org",
        slug=f"onwrite-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="multi",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    agent = GuardAgent(
        id=uuid.uuid4(),
        organization_id=org.id,
        wazuh_agent_id="001",
        name="vps-1",
        status="active",
        synced_at=datetime.now(UTC),
    )
    db_session.add(agent)
    await db_session.commit()
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    mock_result = MagicMock()
    mock_result.id = "hp-task"
    monkeypatch.setattr("app.services.host_agent_ingest._celery.send_task", MagicMock(return_value=mock_result))
    return {"owner": owner, "org": org, "agent": agent, "raw": raw}


def _agent_headers(raw: str) -> dict[str, str]:
    return {"X-Host-Agent-Token": raw}


async def _create_site(
    client: AsyncClient, owner: User, org: Organization, agent: GuardAgent, n: int, **extra: object
) -> dict:
    payload: dict[str, object] = {
        "name": f"Site{n}",
        "guard_agent_id": str(agent.id),
        "root_path": f"/var/www/onwrite{n}",
    }
    payload.update(extra)
    r = await client.post("/api/host/sites", headers=_auth(owner, org.id), json=payload)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_watch_flag_create_default_and_patch(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            plain = await _create_site(client, owner, org, agent, 1)
            assert plain["watch_on_write"] is False
            flagged = await _create_site(client, owner, org, agent, 2, watch_on_write=True)
            assert flagged["watch_on_write"] is True
            sid = flagged["id"]
            patched = await client.patch(
                f"/api/host/sites/{sid}",
                headers=_auth(owner, org.id),
                json={"watch_on_write": False},
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["watch_on_write"] is False
            patched2 = await client.patch(
                f"/api/host/sites/{sid}",
                headers=_auth(owner, org.id),
                json={"watch_on_write": True},
            )
            assert patched2.status_code == 200, patched2.text
            assert patched2.json()["watch_on_write"] is True
            fetched = await client.get(f"/api/host/sites/{sid}", headers=_auth(owner, org.id))
            assert fetched.status_code == 200
            assert fetched.json()["watch_on_write"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_request_scan_success_and_debounce(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw: str = ctx["raw"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            site = await _create_site(client, owner, org, agent, 10, watch_on_write=True)
            first = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(raw),
                json={"agent_id": str(agent.id), "site_id": site["id"]},
            )
            assert first.status_code == 200, first.text
            assert first.json()["ok"] is True
            scan_id = first.json()["scan_id"]
            row = (await db_session.execute(select(HostScan).where(HostScan.id == uuid.UUID(scan_id)))).scalar_one()
            assert row.trigger == "on_write"
            assert row.status == "queued"
            second = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(raw),
                json={"agent_id": str(agent.id), "site_id": site["id"]},
            )
            assert second.status_code == 429
            assert "debounce" in second.json()["detail"].lower()
            poll = await client.get(
                "/api/host/agent/jobs",
                params={"agent_id": str(agent.id)},
                headers=_agent_headers(raw),
            )
            assert poll.status_code == 200, poll.text
            jobs = [j for j in poll.json()["jobs"] if j.get("scan_id") == scan_id]
            assert len(jobs) == 1
            assert jobs[0]["trigger"] == "on_write"
    finally:
        app.dependency_overrides.clear()
    await db_session.refresh(agent)
    assert agent.last_helper_poll_at is not None


@pytest.mark.asyncio
async def test_request_scan_rejections(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw: str = ctx["raw"]
    other_agent = GuardAgent(
        id=uuid.uuid4(),
        organization_id=org.id,
        wazuh_agent_id="002",
        name="vps-2",
        status="active",
        synced_at=datetime.now(UTC),
    )
    other_raw, other_hash = generate_results_token()
    other_agent.results_token_hash = other_hash
    db_session.add(other_agent)
    await db_session.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            off = await _create_site(client, owner, org, agent, 20)
            r_off = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(raw),
                json={"agent_id": str(agent.id), "site_id": off["id"]},
            )
            assert r_off.status_code == 400
            on = await _create_site(client, owner, org, agent, 21, watch_on_write=True)
            r_disabled = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(raw),
                json={"agent_id": str(agent.id), "site_id": on["id"]},
            )
            assert r_disabled.status_code == 200, r_disabled.text
            dis = await client.patch(
                f"/api/host/sites/{on['id']}",
                headers=_auth(owner, org.id),
                json={"enabled": False},
            )
            assert dis.status_code == 200
            r_dis = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(raw),
                json={"agent_id": str(agent.id), "site_id": on["id"]},
            )
            assert r_dis.status_code == 403
            watched = await _create_site(client, owner, org, agent, 22, watch_on_write=True)
            r_wrong_agent = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(other_raw),
                json={"agent_id": str(other_agent.id), "site_id": watched["id"]},
            )
            assert r_wrong_agent.status_code == 401
            r_bad_token = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers("not-the-token"),
                json={"agent_id": str(agent.id), "site_id": watched["id"]},
            )
            assert r_bad_token.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_request_scan_org_cap_blocks(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    for i in range(2):
        site = HostSite(
            id=uuid.uuid4(),
            organization_id=org.id,
            guard_agent_id=agent.id,
            name=f"Cap{i}",
            root_path=f"/var/www/cap{i}",
            created_by=owner.id,
            watch_on_write=True,
        )
        db_session.add(site)
        await db_session.flush()
        db_session.add(
            HostScan(
                id=uuid.uuid4(),
                organization_id=org.id,
                site_id=site.id,
                status="queued",
                trigger="manual",
            )
        )
    target = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="CapTarget",
        root_path="/var/www/cap-target",
        created_by=owner.id,
        watch_on_write=True,
    )
    db_session.add(target)
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(ctx["raw"]),
                json={"agent_id": str(agent.id), "site_id": str(target.id)},
            )
            assert r.status_code == 429
            assert "cap" in r.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_debounce_window_expires(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="DebounceOld",
        root_path="/var/www/debounce-old",
        created_by=owner.id,
        watch_on_write=True,
    )
    db_session.add(site)
    await db_session.flush()
    old = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="completed",
        trigger="on_write",
    )
    db_session.add(old)
    await db_session.commit()
    old.created_at = datetime.now(UTC) - timedelta(minutes=16)
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/request-scan",
                headers=_agent_headers(ctx["raw"]),
                json={"agent_id": str(agent.id), "site_id": str(site.id)},
            )
            assert r.status_code == 200, r.text
            assert r.json()["ok"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_watch_sites_lists_only_enabled_watched(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw: str = ctx["raw"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            watched = await _create_site(client, owner, org, agent, 30, watch_on_write=True)
            await _create_site(client, owner, org, agent, 31)
            off = await _create_site(client, owner, org, agent, 32, watch_on_write=True)
            dis = await client.patch(
                f"/api/host/sites/{off['id']}",
                headers=_auth(owner, org.id),
                json={"enabled": False},
            )
            assert dis.status_code == 200, dis.text
            r = await client.get(
                "/api/host/agent/watch-sites",
                params={"agent_id": str(agent.id)},
                headers=_agent_headers(raw),
            )
            assert r.status_code == 200, r.text
            sites = {s["site_id"] for s in r.json()["sites"]}
            assert watched["id"] in sites
            assert off["id"] not in sites
            r_bad = await client.get(
                "/api/host/agent/watch-sites",
                params={"agent_id": str(agent.id)},
                headers=_agent_headers("not-the-token"),
            )
            assert r_bad.status_code == 401
    finally:
        app.dependency_overrides.clear()
