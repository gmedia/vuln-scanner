from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.main import app
from app.models.guard import wazuh_group_for_org
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org
from app.services.wazuh_client import MockWazuhClient


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


async def _add_member(db: AsyncSession, org_id: uuid.UUID, user: User, role: str) -> None:
    db.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=user.id,
            role=role,
        )
    )
    await db.commit()


def _auth(user: User, org_id: uuid.UUID) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id),
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def guard_ws(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "guard_enabled", True)
    monkeypatch.setattr(settings, "guard_mock_wazuh", True)
    MockWazuhClient.reset()

    owner = await _make_user(db_session, "g-owner@example.com")
    viewer = await _make_user(db_session, "g-viewer@example.com")
    outsider = await _make_user(db_session, "g-out@example.com")

    company = Organization(
        id=uuid.uuid4(),
        name="Guard Hotel",
        slug=f"guard-hotel-{uuid.uuid4().hex[:6]}",
        kind="hotel",
        created_by_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()
    await _add_member(db_session, company.id, owner, "owner")
    await _add_member(db_session, company.id, viewer, "viewer")

    other = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"other-{uuid.uuid4().hex[:6]}",
        kind="company",
        created_by_user_id=outsider.id,
    )
    db_session.add(other)
    await db_session.flush()
    await _add_member(db_session, other.id, outsider, "owner")
    await db_session.commit()

    return {
        "owner": owner,
        "viewer": viewer,
        "outsider": outsider,
        "org": company,
        "other": other,
    }


@pytest.mark.asyncio
async def test_guard_enable_and_status(db_session: AsyncSession, guard_ws):
    owner = guard_ws["owner"]
    org = guard_ws["org"]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        app.dependency_overrides.clear()
        from app.database import get_db

        async def _db():
            yield db_session

        app.dependency_overrides[get_db] = _db

        r = await client.get("/api/guard/status", headers=_auth(owner, org.id))
        assert r.status_code == 200
        assert r.json()["enabled"] is False

        r = await client.post("/api/guard/enable", headers=_auth(owner, org.id))
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["wazuh_group"] == wazuh_group_for_org(org.id)

        r = await client.get("/api/guard/status", headers=_auth(owner, org.id))
        assert r.json()["enabled"] is True

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_enable_or_create_token(db_session: AsyncSession, guard_ws):
    owner = guard_ws["owner"]
    viewer = guard_ws["viewer"]
    org = guard_ws["org"]
    from app.database import get_db

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/guard/enable", headers=_auth(owner, org.id))
        r = await client.post("/api/guard/enable", headers=_auth(viewer, org.id))
        assert r.status_code == 403

        r = await client.post(
            "/api/guard/enroll-tokens",
            headers=_auth(viewer, org.id),
            json={"label": "vps"},
        )
        assert r.status_code == 403
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_enroll_sync_and_idor(db_session: AsyncSession, guard_ws):
    owner = guard_ws["owner"]
    viewer = guard_ws["viewer"]
    outsider = guard_ws["outsider"]
    org = guard_ws["org"]
    other = guard_ws["other"]
    from app.database import get_db

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.post("/api/guard/enable", headers=_auth(owner, org.id))).status_code == 200

        r = await client.post(
            "/api/guard/enroll-tokens",
            headers=_auth(owner, org.id),
            json={"label": "colo-1"},
        )
        assert r.status_code == 201
        raw = r.json()["token"]
        assert raw
        assert "token" in r.json()

        r = await client.post(
            "/api/guard/enroll",
            headers={"X-E2E-Test": "1"},
            json={"token": raw, "agent_name": "vps-edge-01"},
        )
        assert r.status_code == 200
        enroll = r.json()
        assert enroll["agent_id"]
        assert enroll["agent_key"].startswith("MOCKKEY-")
        assert enroll["organization_id"] == str(org.id)

        group = wazuh_group_for_org(org.id)
        MockWazuhClient.seed_alert(
            group,
            rule_level=14,
            rule_description="Rootkit detected",
            agent_name="vps-edge-01",
            agent_wazuh_id=enroll["agent_id"],
        )

        r = await client.post("/api/guard/sync", headers=_auth(owner, org.id))
        assert r.status_code == 200
        assert r.json()["ok"] is True

        r = await client.get("/api/guard/agents", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        agents = r.json()
        assert len(agents) >= 1
        assert any(a["name"] == "vps-edge-01" for a in agents)

        r = await client.get("/api/guard/alerts", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        alerts = r.json()
        assert any(a["rule_description"] == "Rootkit detected" for a in alerts)
        assert all("full_log" not in a for a in alerts)

        r = await client.get("/api/guard/agents", headers=_auth(outsider, other.id))
        assert r.status_code == 200
        assert r.json() == []

        r = await client.get("/api/guard/agents", headers=_auth(outsider, org.id))
        assert r.status_code in (401, 404)

        r = await client.get("/api/guard/enroll-tokens", headers=_auth(owner, org.id))
        assert r.status_code == 200
        metas = r.json()
        assert len(metas) >= 1
        assert "token" not in metas[0]
        assert "token_hash" not in metas[0]

        tid = metas[0]["id"]
        r = await client.delete(f"/api/guard/enroll-tokens/{tid}", headers=_auth(owner, org.id))
        assert r.status_code == 204

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_member_cannot_create_token(db_session: AsyncSession, guard_ws):
    owner = guard_ws["owner"]
    org = guard_ws["org"]
    member = await _make_user(db_session, "g-member@example.com")
    await _add_member(db_session, org.id, member, "member")
    from app.database import get_db

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/guard/enable", headers=_auth(owner, org.id))
        r = await client.post(
            "/api/guard/enroll-tokens",
            headers=_auth(member, org.id),
            json={},
        )
        assert r.status_code == 403
        r = await client.get("/api/guard/agents", headers=_auth(member, org.id))
        assert r.status_code == 200
    app.dependency_overrides.clear()
