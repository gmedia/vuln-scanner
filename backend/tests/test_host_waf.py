from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock

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
from app.models.host_waf import HostWafEvent
from app.models.organization import Organization, OrganizationMembership
from app.models.siem import SiemCase, SiemCaseNote
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
    monkeypatch.setattr(settings, "host_waf_enabled", True)
    monkeypatch.setattr(settings, "host_protect_enabled", True)
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
        "agent": agent,
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
            prod_sim = await client.post(
                f"/api/host/waf/sites/{site.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert prod_sim.status_code == 400
            lab = HostSite(
                organization_id=org.id,
                guard_agent_id=ctx["agent"].id,
                name="lab-host-waf-tc5",
                root_path="/var/www/host-waf-fixture",
                created_by=owner.id,
            )
            db_session.add(lab)
            await db_session.commit()
            await db_session.refresh(lab)
            lab_put = await client.put(
                f"/api/host/waf/sites/{lab.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "mock", "paranoia": 1},
            )
            assert lab_put.status_code == 200, lab_put.text
            sim = await client.post(
                f"/api/host/waf/sites/{lab.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert sim.status_code == 201, sim.text
            body = sim.json()
            assert body["action"] == "log"
            assert body["rule_id"] == "mock.sqli.1"
            assert body["path"] == "/sinexis-waf-lab"
            assert "?" not in body["path"]
            events = await client.get("/api/host/waf/events", headers=_auth(owner, org.id))
            assert events.status_code == 200
            assert events.json() == []
            listed = await client.get("/api/host/waf/policies", headers=_auth(owner, org.id))
            assert listed.status_code == 200
            assert len(listed.json()) == 2
            again = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "mock", "paranoia": 2},
            )
            assert again.status_code == 200
            assert again.json()["mode"] == "protect"
            lab_protect = await client.put(
                f"/api/host/waf/sites/{lab.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "mock", "paranoia": 2},
            )
            assert lab_protect.status_code == 200
            blocked = await client.post(
                f"/api/host/waf/sites/{lab.id}/simulate",
                headers=_auth(member, org.id),
            )
            assert blocked.status_code == 201
            assert blocked.json()["action"] == "block"
            filtered = await client.get(
                f"/api/host/waf/events?site_id={lab.id}",
                headers=_auth(owner, org.id),
            )
            assert filtered.status_code == 200
            assert filtered.json() == []
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
            assert "sinexis.sqli" in body["content"]
            assert "sinexis.wplogin.payload" in body["content"]
            assert "sinexis.php.wrapper" in body["content"]
            assert "id:1005" in body["content"]
            assert "id:1006" in body["content"]
            assert "wp-admin" not in body["content"]
            assert "mock.sqli.1" not in body["content"]
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
            assert "customer VPS" in nginx_snip.json()["content"]
            assert "/sinexis-waf-lab" not in nginx_snip.json()["content"]
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
    site.name = "lab-host-waf-siem"
    site.root_path = "/var/www/host-waf-fixture"
    await db_session.commit()
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
    site.name = "lab-host-waf-detect"
    site.root_path = "/var/www/host-waf-fixture"
    await db_session.commit()
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


@pytest.mark.asyncio
async def test_protect_requires_multi_sku(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    site: HostSite = ctx["site"]
    org.sku = "pro"
    await db_session.commit()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "nginx_modsec", "paranoia": 1},
            )
            assert denied.status_code == 403
            detect = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "detect", "engine": "nginx_modsec", "paranoia": 1},
            )
            assert detect.status_code == 200
            org.sku = "multi"
            await db_session.commit()
            ok = await client.put(
                f"/api/host/waf/sites/{site.id}/policy",
                headers=_auth(owner, org.id),
                json={"mode": "protect", "engine": "nginx_modsec", "paranoia": 1},
            )
            assert ok.status_code == 200
            assert ok.json()["mode"] == "protect"
            assert ok.json()["engine"] == "nginx_modsec"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_waf_ingest_persists_and_strips_query(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr("app.services.host_handoff.send_host_waf_email", AsyncMock(return_value=True))
    agent: GuardAgent = ctx["agent"]
    site: HostSite = ctx["site"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [
                        {
                            "action": "block",
                            "rule_id": "1001",
                            "method": "get",
                            "path": "/xmlrpc.php?user=1",
                            "http_status": 403,
                        }
                    ],
                },
            )
            assert r.status_code == 200, r.text
            assert r.json()["accepted"] == 1
    finally:
        app.dependency_overrides.clear()
    rows = (await db_session.execute(select(HostWafEvent).where(HostWafEvent.site_id == site.id))).scalars().all()
    assert len(rows) == 1
    assert rows[0].path == "/xmlrpc.php"
    assert rows[0].method == "GET"
    assert rows[0].action == "block"
    assert rows[0].http_status == 403
    await db_session.refresh(agent)
    assert agent.last_helper_poll_at is not None
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            again = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [
                        {
                            "action": "block",
                            "rule_id": "1001",
                            "method": "GET",
                            "path": "/xmlrpc.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1001",
                            "method": "GET",
                            "path": "/xmlrpc.php",
                            "http_status": 403,
                        },
                    ],
                },
            )
            assert again.status_code == 200
            assert again.json()["accepted"] == 0
    finally:
        app.dependency_overrides.clear()
    rows2 = (await db_session.execute(select(HostWafEvent).where(HostWafEvent.site_id == site.id))).scalars().all()
    assert len(rows2) == 1


@pytest.mark.asyncio
async def test_agent_waf_ingest_block_emails_owner(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    sent: list[dict[str, object]] = []

    async def _capture(email_to: str, **kwargs: object) -> bool:
        sent.append({"to": email_to, **kwargs})
        return True

    monkeypatch.setattr("app.services.host_handoff.send_host_waf_email", _capture)
    agent: GuardAgent = ctx["agent"]
    site: HostSite = ctx["site"]
    owner: User = ctx["owner"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [
                        {
                            "action": "block",
                            "rule_id": "1001",
                            "method": "POST",
                            "path": "/xmlrpc.php",
                            "http_status": 403,
                        },
                        {
                            "action": "log",
                            "rule_id": "1001",
                            "method": "GET",
                            "path": "/xmlrpc.php",
                            "http_status": 200,
                        },
                    ],
                },
            )
            assert r.status_code == 200, r.text
            assert r.json()["accepted"] == 2
    finally:
        app.dependency_overrides.clear()
    assert len(sent) == 1
    assert sent[0]["to"] == owner.email
    assert sent[0]["rule_id"] == "1001"
    assert sent[0]["action"] == "block"


@pytest.mark.asyncio
async def test_protect_simulate_does_not_email(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", False)
    emailed = AsyncMock(return_value=True)
    monkeypatch.setattr("app.services.host_handoff.send_host_waf_email", emailed)
    _bind_db(db_session)
    org = ctx["org"]
    owner: User = ctx["owner"]
    member: User = ctx["member"]
    site: HostSite = ctx["site"]
    site.name = "lab-host-waf-no-mail"
    site.root_path = "/var/www/host-waf-fixture"
    await db_session.commit()
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
    finally:
        app.dependency_overrides.clear()
    emailed.assert_not_awaited()


@pytest.mark.asyncio
async def test_agent_waf_ingest_drops_vendor_rule_ids(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.host_handoff.send_host_waf_email", AsyncMock(return_value=True))
    agent: GuardAgent = ctx["agent"]
    site: HostSite = ctx["site"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [
                        {
                            "action": "log",
                            "rule_id": "77350396",
                            "method": "GET",
                            "path": "/libraries/axios/axios.min.js",
                            "http_status": 200,
                        },
                        {
                            "action": "log",
                            "rule_id": "mock.sqli.1",
                            "method": "GET",
                            "path": "/sinexis-waf-lab",
                            "http_status": 200,
                        },
                        {
                            "action": "log",
                            "rule_id": "1001",
                            "method": "GET",
                            "path": "/xmlrpc.php",
                            "http_status": 404,
                        },
                        {
                            "action": "block",
                            "rule_id": "1005",
                            "method": "POST",
                            "path": "/wp-login.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1006",
                            "method": "GET",
                            "path": "/index.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1007",
                            "method": "GET",
                            "path": "/wp-cron.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1008",
                            "method": "GET",
                            "path": "/index.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1009",
                            "method": "GET",
                            "path": "/.env",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1010",
                            "method": "GET",
                            "path": "/phpinfo.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1011",
                            "method": "GET",
                            "path": "/wp-config.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1012",
                            "method": "GET",
                            "path": "/.htaccess",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1013",
                            "method": "GET",
                            "path": "/composer.json",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1014",
                            "method": "GET",
                            "path": "/dump.sql",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1015",
                            "method": "GET",
                            "path": "/uploads/x.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1016",
                            "method": "PUT",
                            "path": "/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1017",
                            "method": "GET",
                            "path": "/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1018",
                            "method": "GET",
                            "path": "/phpmyadmin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1019",
                            "method": "GET",
                            "path": "/cgi-bin/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1020",
                            "method": "GET",
                            "path": "/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1021",
                            "method": "GET",
                            "path": "/wp-content/debug.log",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1022",
                            "method": "GET",
                            "path": "/server-status",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1023",
                            "method": "GET",
                            "path": "/vendor/phpunit",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1024",
                            "method": "GET",
                            "path": "/timthumb.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1025",
                            "method": "GET",
                            "path": "/actuator",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1026",
                            "method": "GET",
                            "path": "/telescope",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1027",
                            "method": "GET",
                            "path": "/.DS_Store",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1028",
                            "method": "GET",
                            "path": "/wlwmanifest.xml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1029",
                            "method": "GET",
                            "path": "/wp-json/wp/v2/users",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1030",
                            "method": "GET",
                            "path": "/adminer.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1031",
                            "method": "GET",
                            "path": "/elmah.axd",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1032",
                            "method": "GET",
                            "path": "/manager/html",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1033",
                            "method": "GET",
                            "path": "/solr/admin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1034",
                            "method": "GET",
                            "path": "/jenkins",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1035",
                            "method": "GET",
                            "path": "/jmx-console",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1036",
                            "method": "GET",
                            "path": "/trace.axd",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1037",
                            "method": "GET",
                            "path": "/.svn/entries",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1038",
                            "method": "GET",
                            "path": "/invoker/JMXInvokerServlet",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1039",
                            "method": "GET",
                            "path": "/web.config",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1040",
                            "method": "GET",
                            "path": "/server-info",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1041",
                            "method": "GET",
                            "path": "/axis2/axis2-admin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1042",
                            "method": "GET",
                            "path": "/console",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1043",
                            "method": "GET",
                            "path": "/CFIDE/administrator",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1044",
                            "method": "GET",
                            "path": "/_profiler",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1045",
                            "method": "GET",
                            "path": "/crossdomain.xml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1046",
                            "method": "GET",
                            "path": "/clientaccesspolicy.xml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1047",
                            "method": "GET",
                            "path": "/debug/default/view",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1048",
                            "method": "GET",
                            "path": "/actuator/heapdump",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1049",
                            "method": "GET",
                            "path": "/elmah.axd",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1050",
                            "method": "GET",
                            "path": "/trace.axd",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1051",
                            "method": "GET",
                            "path": "/.hg/store",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1052",
                            "method": "GET",
                            "path": "/.bzr/branch",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1053",
                            "method": "GET",
                            "path": "/web.config.bak",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1054",
                            "method": "GET",
                            "path": "/backup.zip",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1055",
                            "method": "GET",
                            "path": "/wp-config.php.bak",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1056",
                            "method": "GET",
                            "path": "/pma",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1057",
                            "method": "GET",
                            "path": "/myadmin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1058",
                            "method": "GET",
                            "path": "/administrator",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1059",
                            "method": "GET",
                            "path": "/user/login",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1060",
                            "method": "GET",
                            "path": "/__debug__/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1061",
                            "method": "GET",
                            "path": "/rails/info/properties",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1062",
                            "method": "GET",
                            "path": "/_ignition",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1063",
                            "method": "GET",
                            "path": "/horizon",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1064",
                            "method": "GET",
                            "path": "/nova",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1065",
                            "method": "GET",
                            "path": "/jolokia",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1066",
                            "method": "GET",
                            "path": "/hawtio",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1067",
                            "method": "GET",
                            "path": "/web-console",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1068",
                            "method": "GET",
                            "path": "/.aws/credentials",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1069",
                            "method": "GET",
                            "path": "/id_rsa",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1070",
                            "method": "GET",
                            "path": "/.ssh/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1071",
                            "method": "GET",
                            "path": "/aspnet_client/",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1072",
                            "method": "GET",
                            "path": "/php.ini",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1073",
                            "method": "GET",
                            "path": "/config.php.bak",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1074",
                            "method": "GET",
                            "path": "/backup.tar.gz",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1075",
                            "method": "GET",
                            "path": "/sftp-config.json",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1076",
                            "method": "GET",
                            "path": "/Thumbs.db",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1077",
                            "method": "GET",
                            "path": "/CVS/Root",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1078",
                            "method": "GET",
                            "path": "/WEB-INF/web.xml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1079",
                            "method": "GET",
                            "path": "/META-INF/context.xml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1080",
                            "method": "GET",
                            "path": "/struts2-rest-showcase",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1081",
                            "method": "GET",
                            "path": "/resin-admin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1082",
                            "method": "GET",
                            "path": "/_debugbar",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1083",
                            "method": "GET",
                            "path": "/phpminiadmin",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1084",
                            "method": "GET",
                            "path": "/sqlbuddy",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1085",
                            "method": "GET",
                            "path": "/docker-compose.yml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1086",
                            "method": "GET",
                            "path": "/.dockerignore",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1087",
                            "method": "GET",
                            "path": "/id_dsa",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1088",
                            "method": "GET",
                            "path": "/authorized_keys",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1089",
                            "method": "GET",
                            "path": "/wp-config.php.old",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1090",
                            "method": "GET",
                            "path": "/settings.py",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1091",
                            "method": "GET",
                            "path": "/application.yml",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1092",
                            "method": "GET",
                            "path": "/localsettings.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1093",
                            "method": "GET",
                            "path": "/sites/default/settings.php",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1094",
                            "method": "GET",
                            "path": "/.hgignore",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1095",
                            "method": "GET",
                            "path": "/glassfish",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1096",
                            "method": "GET",
                            "path": "/solr/select",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1140",
                            "method": "GET",
                            "path": "/solr/update",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1141",
                            "method": "GET",
                            "path": "/.env.local",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1142",
                            "method": "GET",
                            "path": "/web.config",
                            "http_status": 403,
                        },
                        {
                            "action": "block",
                            "rule_id": "1143",
                            "method": "GET",
                            "path": "/configuration.php",
                            "http_status": 403,
                        },
                    ],
                },
            )
            assert r.status_code == 200, r.text
            assert r.json()["accepted"] == 97
    finally:
        app.dependency_overrides.clear()
    rows = (await db_session.execute(select(HostWafEvent).where(HostWafEvent.site_id == site.id))).scalars().all()
    assert {row.rule_id for row in rows} == {
        "1001",
        "1005",
        "1006",
        "1007",
        "1008",
        "1009",
        "1010",
        "1011",
        "1012",
        "1013",
        "1014",
        "1015",
        "1016",
        "1017",
        "1018",
        "1019",
        "1020",
        "1021",
        "1022",
        "1023",
        "1024",
        "1025",
        "1026",
        "1027",
        "1028",
        "1029",
        "1030",
        "1031",
        "1032",
        "1033",
        "1034",
        "1035",
        "1036",
        "1037",
        "1038",
        "1039",
        "1040",
        "1041",
        "1042",
        "1043",
        "1044",
        "1045",
        "1046",
        "1047",
        "1048",
        "1049",
        "1050",
        "1051",
        "1052",
        "1053",
        "1054",
        "1055",
        "1056",
        "1057",
        "1058",
        "1059",
        "1060",
        "1061",
        "1062",
        "1063",
        "1064",
        "1065",
        "1066",
        "1067",
        "1068",
        "1069",
        "1070",
        "1071",
        "1072",
        "1073",
        "1074",
        "1075",
        "1076",
        "1077",
        "1078",
        "1079",
        "1080",
        "1081",
        "1082",
        "1083",
        "1084",
        "1085",
        "1086",
        "1087",
        "1088",
        "1089",
        "1090",
        "1091",
        "1092",
        "1093",
        "1094",
        "1095",
        "1096",
        "1140",
        "1141",
        "1142",
        "1143",
    }


@pytest.mark.asyncio
async def test_agent_waf_ingest_401_without_token(db_session: AsyncSession, ctx):
    agent: GuardAgent = ctx["agent"]
    site: HostSite = ctx["site"]
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [{"action": "log", "rule_id": "1", "method": "GET", "path": "/"}],
                },
            )
            assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_waf_ingest_401_site_org_mismatch(db_session: AsyncSession, ctx):
    agent: GuardAgent = ctx["agent"]
    other_site: HostSite = ctx["other_site"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(other_site.id),
                    "events": [{"action": "log", "rule_id": "1", "method": "GET", "path": "/x"}],
                },
            )
            assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_waf_ingest_413_too_many_events(db_session: AsyncSession, ctx):
    agent: GuardAgent = ctx["agent"]
    site: HostSite = ctx["site"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    await db_session.commit()
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/waf-events",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "agent_id": str(agent.id),
                    "site_id": str(site.id),
                    "events": [
                        {"action": "log", "rule_id": "1", "method": "GET", "path": f"/p{i}"} for i in range(101)
                    ],
                },
            )
            assert r.status_code == 413
    finally:
        app.dependency_overrides.clear()
