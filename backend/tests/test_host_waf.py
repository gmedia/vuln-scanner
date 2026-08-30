from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.guard import GuardAgent
from app.models.host_protect import HostSite
from app.models.organization import Organization, OrganizationMembership
from app.models.siem import SiemCase, SiemCaseNote
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
    monkeypatch.setattr(settings, "host_waf_enabled", True)
    owner = await _make_user(db_session, "waf-owner@example.com")
    member = await _make_user(db_session, "waf-member@example.com")
    viewer = await _make_user(db_session, "waf-viewer@example.com")
    outsider = await _make_user(db_session, "waf-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Waf Org",
        slug=f"waf-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="multi",
        created_by_user_id=owner.id,
    )
    other = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"waf-other-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="multi",
        created_by_user_id=outsider.id,
    )
    db_session.add_all([org, other])
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
        wazuh_agent_id="waf-001",
        name="vps-waf",
        status="active",
        synced_at=datetime.now(UTC),
    )
    db_session.add(agent)
    await db_session.flush()
    site = HostSite(
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="web",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    other_site = HostSite(
        organization_id=other.id,
        guard_agent_id=agent.id,
        name="other-web",
        root_path="/var/www/other",
        created_by=outsider.id,
    )
    db_session.add_all([site, other_site])
    await db_session.commit()
    await db_session.refresh(site)
    await db_session.refresh(other_site)
    return {
        "owner": owner,
        "member": member,
        "viewer": viewer,
        "outsider": outsider,
        "org": org,
        "other": other,
        "site": site,
        "other_site": other_site,
    }


@pytest.mark.asyncio
async def test_flag_off_404(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "host_waf_enabled", False)
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/host/waf/policies", headers=_auth(owner, org.id))
            assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_upsert_simulate_and_list(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    member: User = ctx["member"]
    site: HostSite = ctx["site"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            put = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "mock", "paranoia": 1},
            )
            assert put.status_code == 200, put.text
            assert put.json()["mode"] == "detect"
            sim = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert sim.status_code == 201, sim.text
            body = sim.json()
            assert body["action"] == "log"
            assert "?" not in body["path"]
            events = await client.get("/api/host/waf/events", headers=_auth(owner, org.id))
            assert events.status_code == 200
            assert len(events.json()) == 1
            listed = await client.get("/api/host/waf/policies", headers=_auth(owner, org.id))
            assert listed.status_code == 200
            assert len(listed.json()) == 1
            again = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "mock", "paranoia": 2},
            )
            assert again.status_code == 200
            assert again.json()["mode"] == "protect"
            blocked = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert blocked.status_code == 201
            assert blocked.json()["action"] == "block"
            filtered = await client.get(
                f"/api/host/waf/events?site_id={site.id}",
                headers=_auth(owner, org.id),
            )
            assert filtered.status_code == 200
            assert len(filtered.json()) == 2
            off = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "off", "engine": "mock", "paranoia": 1},
            )
            assert off.status_code == 200
            no_sim = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert no_sim.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_upsert_outsider_idor(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    viewer: User = ctx["viewer"]
    outsider: User = ctx["outsider"]
    site: HostSite = ctx["site"]
    other_site: HostSite = ctx["other_site"]
    owner: User = ctx["owner"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(viewer, org.id),
                json={"mode": "detect", "engine": "mock", "paranoia": 1},
            )
            assert denied.status_code == 403
            idor = await client.put(
                f"/api/host/waf/sites/{other_site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "mock", "paranoia": 1},
            )
            assert idor.status_code == 404
            out = await client.get("/api/host/waf/policies", headers=_auth(outsider, org.id))
            assert out.status_code in (401, 403, 404)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_simulate_without_policy(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    member: User = ctx["member"]
    site: HostSite = ctx["site"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_engine_coraza_snippet(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    viewer: User = ctx["viewer"]
    site: HostSite = ctx["site"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "coraza", "paranoia": 1},
            )
            assert r.status_code == 200
            assert r.json()["engine"] == "coraza"
            denied = await client.get(
                f"/api/host/waf/sites/{site.id}/snippet",
                headers=_auth(viewer, org.id),
            )
            assert denied.status_code == 403
            snip = await client.get(
                f"/api/host/waf/sites/{site.id}/snippet",
                headers=_auth(owner, org.id),
            )
            assert snip.status_code == 200
            body = snip.json()
            assert body["filename"] == "sinexis-host-waf-coraza.conf"
            assert "do not paste onto sinexis.app" in body["content"]
            assert "listen" not in body["content"].lower()
            assert "SecRequestBodyAccess Off" in body["content"]
            assert "mock.sqli.1" in body["content"]
            missing = await client.get(
                f"/api/host/waf/sites/{ctx['other_site'].id}/snippet",
                headers=_auth(owner, org.id),
            )
            assert missing.status_code == 404
            nginx_put = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "nginx_modsec", "paranoia": 1},
            )
            assert nginx_put.status_code == 200
            nginx_snip = await client.get(
                f"/api/host/waf/sites/{site.id}/snippet",
                headers=_auth(owner, org.id),
            )
            assert nginx_snip.status_code == 200
            assert nginx_snip.json()["filename"] == "sinexis-host-waf-modsec.conf"
            assert "SecRuleEngine On" in nginx_snip.json()["content"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_protect_simulate_opens_siem_case(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", True)
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    member: User = ctx["member"]
    site: HostSite = ctx["site"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "mock", "paranoia": 1},
            )
            blocked = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert blocked.status_code == 201
            assert blocked.json()["action"] == "block"
            assert "full_log" not in blocked.json()
        cases = (await db_session.execute(select(SiemCase).where(SiemCase.organization_id == org.id))).scalars().all()
        assert len(cases) == 1
        assert "Host WAF block" in cases[0].title
        notes = (
            (await db_session.execute(select(SiemCaseNote).where(SiemCaseNote.case_id == cases[0].id))).scalars().all()
        )
        assert notes
        assert "full_log" not in notes[0].body
        assert "No request body" in notes[0].body
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_detect_simulate_skips_siem(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", True)
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    member: User = ctx["member"]
    site: HostSite = ctx["site"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "mock", "paranoia": 1},
            )
            sim = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert sim.status_code == 201
            assert sim.json()["action"] == "log"
        cases = (await db_session.execute(select(SiemCase).where(SiemCase.organization_id == org.id))).scalars().all()
        assert cases == []
    finally:
        app.dependency_overrides.clear()
