from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.main import app
from app.models.guard import GuardAgent, GuardOrgBinding, wazuh_group_for_org
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
async def siem_ws(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", True)
    monkeypatch.setattr(settings, "guard_mock_wazuh", True)
    MockWazuhClient.reset()

    owner = await _make_user(db_session, "s-owner@example.com")
    viewer = await _make_user(db_session, "s-viewer@example.com")
    outsider = await _make_user(db_session, "s-out@example.com")

    company = Organization(
        id=uuid.uuid4(),
        name="SIEM Hotel",
        slug=f"siem-hotel-{uuid.uuid4().hex[:6]}",
        kind="hotel",
        created_by_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()
    await _add_member(db_session, company.id, owner, "owner")
    await _add_member(db_session, company.id, viewer, "viewer")

    group = wazuh_group_for_org(company.id)
    db_session.add(
        GuardOrgBinding(
            id=uuid.uuid4(),
            organization_id=company.id,
            wazuh_group=group,
            enabled=True,
        )
    )
    db_session.add(
        GuardAgent(
            id=uuid.uuid4(),
            organization_id=company.id,
            wazuh_agent_id="001",
            name="vps-edge-01",
            status="active",
        )
    )
    await db_session.commit()

    other = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"siem-other-{uuid.uuid4().hex[:6]}",
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
        "group": group,
    }


async def _client(db_session: AsyncSession):
    from app.database import get_db

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    return ASGITransport(app=app)


@pytest.mark.asyncio
async def test_siem_disabled_returns_404(db_session: AsyncSession, siem_ws, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", False)
    owner = siem_ws["owner"]
    org = siem_ws["org"]
    transport = await _client(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/siem/status", headers=_auth(owner, org.id))
        assert r.status_code == 404
        r = await client.get("/api/siem/events", headers=_auth(owner, org.id))
        assert r.status_code == 404
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_siem_status_and_events(db_session: AsyncSession, siem_ws):
    viewer = siem_ws["viewer"]
    org = siem_ws["org"]
    group = siem_ws["group"]
    MockWazuhClient.seed_alert(
        group,
        external_id="evt-1",
        rule_level=10,
        rule_description="sshd brute force",
        agent_wazuh_id="001",
        agent_name="vps-edge-01",
        occurred_at=datetime.now(UTC),
    )
    MockWazuhClient.seed_alert(
        group,
        external_id="evt-foreign",
        rule_level=14,
        rule_description="foreign leak",
        agent_wazuh_id="999",
        agent_name="other-host",
        occurred_at=datetime.now(UTC),
    )
    transport = await _client(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/siem/status", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["indexer_reachable"] is True
        assert body["search_min_level"] == 7
        assert body["include_full_log"] is False

        r = await client.get("/api/siem/events", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        items = r.json()["items"]
        ids = [i["external_id"] for i in items]
        assert "evt-1" in ids
        assert "evt-foreign" not in ids
        assert all("full_log" not in i for i in items)

        r = await client.get("/api/siem/events/evt-1", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        assert r.json()["external_id"] == "evt-1"

        r = await client.get("/api/siem/events/evt-foreign", headers=_auth(viewer, org.id))
        assert r.status_code == 404
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_siem_rejects_dsl_query(db_session: AsyncSession, siem_ws):
    viewer = siem_ws["viewer"]
    org = siem_ws["org"]
    transport = await _client(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(
            "/api/siem/events",
            params={"q": "rule.id:* OR agent.id:001"},
            headers=_auth(viewer, org.id),
        )
        assert r.status_code == 400
        r = await client.get(
            "/api/siem/events",
            params={"query": '{"bool":{}}'},
            headers=_auth(viewer, org.id),
        )
        assert r.status_code == 400
        r = await client.get(
            "/api/siem/events",
            params={"dsl": "match_all"},
            headers=_auth(viewer, org.id),
        )
        assert r.status_code == 400
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_siem_indexer_degraded_returns_empty(db_session: AsyncSession, siem_ws, monkeypatch: pytest.MonkeyPatch):
    from app.services.wazuh_client import WazuhClientError

    async def _boom(*_a, **_k):
        raise WazuhClientError("indexer down")

    monkeypatch.setattr("app.services.siem.search_org_events", _boom)
    viewer = siem_ws["viewer"]
    org = siem_ws["org"]
    transport = await _client(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/siem/events", headers=_auth(viewer, org.id))
        assert r.status_code == 200
        body = r.json()
        assert body["items"] == []
        assert body["degraded"] is True
        assert body["last_error"]
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_siem_idor_cross_org(db_session: AsyncSession, siem_ws):
    outsider = siem_ws["outsider"]
    org = siem_ws["org"]
    transport = await _client(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/siem/events", headers=_auth(outsider, org.id))
        assert r.status_code in (401, 404)
    app.dependency_overrides.clear()
