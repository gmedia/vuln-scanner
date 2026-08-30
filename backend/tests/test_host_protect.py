from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.guard import GuardAgent
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
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
    owner = await _make_user(db_session, "hp-owner@example.com")
    member = await _make_user(db_session, "hp-member@example.com")
    viewer = await _make_user(db_session, "hp-viewer@example.com")
    outsider = await _make_user(db_session, "hp-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Host Org",
        slug=f"host-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="multi",
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
    return {
        "owner": owner,
        "member": member,
        "viewer": viewer,
        "outsider": outsider,
        "org": org,
        "agent": agent,
    }


@pytest.mark.asyncio
async def test_flag_off_404(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "host_protect_enabled", False)
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/host/sites", headers=_auth(owner, org.id))
            assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_site_crud_and_scan_enqueue(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    member: User = ctx["member"]
    agent: GuardAgent = ctx["agent"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "Web",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/html",
                    "cms_hint": "wordpress",
                },
            )
            assert created.status_code == 201, created.text
            sid = created.json()["id"]
            listed = await client.get("/api/host/sites", headers=_auth(owner, org.id))
            assert listed.status_code == 200
            assert len(listed.json()) == 1
            patched = await client.patch(
                f"/api/host/sites/{sid}",
                headers=_auth(owner, org.id),
                json={"name": "Web 2"},
            )
            assert patched.status_code == 200
            assert patched.json()["name"] == "Web 2"
            scan = await client.post(f"/api/host/sites/{sid}/scan", headers=_auth(member, org.id))
            assert scan.status_code == 201, scan.text
            assert scan.json()["status"] == "queued"
            scans = await client.get(f"/api/host/sites/{sid}/scans", headers=_auth(member, org.id))
            assert scans.status_code == 200
            assert len(scans.json()) == 1
            hits = await client.get("/api/host/hits", headers=_auth(owner, org.id))
            assert hits.status_code == 200
            assert hits.json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_path_traversal_rejected(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            bad = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "Nope",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/html/../etc",
                },
            )
            assert bad.status_code in (400, 422)
            outside = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "Nope2",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/etc/passwd",
                },
            )
            assert outside.status_code in (400, 422)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_create_outsider_idor(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    viewer: User = ctx["viewer"]
    outsider: User = ctx["outsider"]
    agent: GuardAgent = ctx["agent"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.post(
                "/api/host/sites",
                headers=_auth(viewer, org.id),
                json={
                    "name": "Nope",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/denied",
                },
            )
            assert denied.status_code == 403
            created = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "Pub",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/pub",
                },
            )
            assert created.status_code == 201, created.text
            sid = created.json()["id"]
            steal = await client.get(
                f"/api/host/sites/{sid}",
                headers=_auth(outsider, outsider.last_active_organization_id),
            )
            assert steal.status_code == 404
            scan_denied = await client.post(
                f"/api/host/sites/{sid}/scan",
                headers=_auth(viewer, org.id),
            )
            assert scan_denied.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_basic_sku_hard_cap(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    org.sku = "basic"
    await db_session.commit()
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            first = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "One",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/one",
                },
            )
            assert first.status_code == 201, first.text
            second = await client.post(
                "/api/host/sites",
                headers=_auth(owner, org.id),
                json={
                    "name": "Two",
                    "guard_agent_id": str(agent.id),
                    "root_path": "/var/www/two",
                },
            )
            assert second.status_code == 400
            assert "limit" in second.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
