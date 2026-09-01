from __future__ import annotations

import uuid
from datetime import UTC, datetime
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
from app.models.host_protect import HostHit, HostQuarantineEvent, HostScan, HostSite
from app.models.organization import Organization, OrganizationMembership
from app.models.siem import SiemCase
from app.models.user import User
from app.schemas.host_protect import MAX_AGENT_FINDINGS
from app.services.auth import create_access_token, hash_password
from app.services.host_agent_ingest import generate_results_token
from app.services.host_scan_runner import run_host_scan_job, run_mock_host_scan
from app.services.organization import ensure_personal_org


async def _async_ok(*_a: object, **_k: object) -> bool:
    return True


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
async def test_site_crud_and_scan_enqueue(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
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
            mock_result = MagicMock()
            mock_result.id = "hp-task"
            monkeypatch.setattr("app.services.host_protect._celery.send_task", MagicMock(return_value=mock_result))
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


@pytest.mark.asyncio
async def test_mock_scan_writes_hit(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Mock",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    out = await run_mock_host_scan(db_session, scan.id)
    assert out["ok"] is True
    assert out["hit_count"] == 1
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            hits = await client.get("/api/host/hits", headers=_auth(owner, org.id))
            assert hits.status_code == 200
            assert hits.json() == []
            stored = await db_session.execute(select(HostHit).where(HostHit.site_id == site.id))
            row = stored.scalar_one()
            assert row.engine == "mock"
            assert row.hit_class == "webshell"
            assert row.rel_path == "wp-content/uploads/cache.php"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_critical_hit_creates_siem_case_when_enabled(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "siem_enabled", True)
    monkeypatch.setattr("app.services.host_handoff.send_host_protect_email", _async_ok)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Mock",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    out = await run_mock_host_scan(db_session, scan.id)
    assert out["ok"] is True
    cases = (await db_session.execute(select(SiemCase).where(SiemCase.organization_id == org.id))).scalars().all()
    assert len(cases) == 1
    assert "webshell" in cases[0].title
    assert "full_log" not in (cases[0].title or "")


@pytest.mark.asyncio
async def test_siem_off_does_not_fail_scan(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "siem_enabled", False)
    monkeypatch.setattr("app.services.host_handoff.send_host_protect_email", _async_ok)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Mock",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    out = await run_mock_host_scan(db_session, scan.id)
    assert out["ok"] is True
    cases = (await db_session.execute(select(SiemCase).where(SiemCase.organization_id == org.id))).scalars().all()
    assert cases == []


@pytest.mark.asyncio
async def test_new_webshell_emails_owner_once(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    sent: list[dict[str, object]] = []

    async def _capture(email_to: str, **kwargs: object) -> bool:
        sent.append({"to": email_to, **kwargs})
        return True

    monkeypatch.setattr("app.services.host_handoff.send_host_protect_email", _capture)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Notify",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    await run_mock_host_scan(db_session, scan.id)
    assert len(sent) == 1
    assert sent[0]["to"] == owner.email
    assert sent[0]["hit_class"] == "webshell"
    assert sent[0]["site_name"] == "Notify"
    scan2 = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(scan2)
    await db_session.commit()
    await run_mock_host_scan(db_session, scan2.id)
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_malware_class_does_not_email(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    sent: list[object] = []

    async def _capture(*_a: object, **_k: object) -> bool:
        sent.append(1)
        return True

    monkeypatch.setattr("app.services.host_handoff.send_host_protect_email", _capture)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Mal",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    from app.services.host_scan_runner import _persist_hits

    await _persist_hits(
        db_session,
        scan,
        site,
        [{"rel_path": "wp-content/uploads/x.bin", "hit_class": "malware", "rule_id": "mock.malware"}],
        "mock",
    )
    await db_session.commit()
    assert sent == []


@pytest.mark.asyncio
async def test_quarantine_restore_ignore_roles(
    db_session: AsyncSession, ctx, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    from app.services import host_path as hp

    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    viewer: User = ctx["viewer"]
    outsider: User = ctx["outsider"]
    agent: GuardAgent = ctx["agent"]
    web = tmp_path / "www"
    qroot = tmp_path / "q"
    uploads = web / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "cache.php").write_text("<?php eval($_POST['x']); ?>", encoding="utf-8")
    (uploads / "other.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    monkeypatch.setattr(hp, "ALLOWED_PREFIXES", (str(web),))
    monkeypatch.setattr(settings, "host_protect_quarantine_root", str(qroot))
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Q",
        root_path=str(web),
        created_by=owner.id,
    )
    hit = HostHit(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        rel_path="wp-content/uploads/cache.php",
        hit_class="webshell",
        engine="mock",
        rule_id="mock.webshell.php",
        status="open",
    )
    db_session.add(site)
    db_session.add(hit)
    await db_session.commit()
    hid = str(hit.id)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.post(f"/api/host/hits/{hid}/quarantine", headers=_auth(viewer, org.id))
            assert denied.status_code == 403
            steal = await client.post(
                f"/api/host/hits/{hid}/quarantine",
                headers=_auth(outsider, outsider.last_active_organization_id),
            )
            assert steal.status_code == 404
            ok = await client.post(
                f"/api/host/hits/{hid}/quarantine",
                headers=_auth(owner, org.id),
            )
            assert ok.status_code == 200, ok.text
            assert ok.json()["status"] == "quarantined"
            assert not (uploads / "cache.php").exists()
            qfiles = list(qroot.rglob("*_cache.php"))
            assert len(qfiles) == 1
            restored = await client.post(f"/api/host/hits/{hid}/restore", headers=_auth(owner, org.id))
            assert restored.status_code == 200
            assert restored.json()["status"] == "restored"
            assert (uploads / "cache.php").is_file()
            hit2 = HostHit(
                id=uuid.uuid4(),
                organization_id=org.id,
                site_id=site.id,
                rel_path="wp-content/uploads/other.php",
                hit_class="malware",
                engine="mock",
                rule_id="mock.other",
                status="open",
            )
            db_session.add(hit2)
            await db_session.commit()
            ign = await client.post(f"/api/host/hits/{hit2.id}/ignore", headers=_auth(owner, org.id))
            assert ign.status_code == 200
            assert ign.json()["status"] == "ignored"
    finally:
        app.dependency_overrides.clear()
    events = (
        (await db_session.execute(select(HostQuarantineEvent).where(HostQuarantineEvent.hit_id == hit.id)))
        .scalars()
        .all()
    )
    assert len(events) == 2
    assert all("/" not in (e.dest_basename or "") for e in events)


@pytest.mark.asyncio
async def test_quarantine_missing_file_keeps_open(
    db_session: AsyncSession, ctx, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    from app.services import host_path as hp

    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    web = tmp_path / "www"
    web.mkdir()
    monkeypatch.setattr(hp, "ALLOWED_PREFIXES", (str(web),))
    monkeypatch.setattr(settings, "host_protect_quarantine_root", str(tmp_path / "q"))
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Q2",
        root_path=str(web),
        created_by=owner.id,
    )
    hit = HostHit(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        rel_path="missing.php",
        hit_class="webshell",
        engine="needles",
        rule_id="r1",
        status="open",
    )
    db_session.add(site)
    db_session.add(hit)
    await db_session.commit()
    hid = str(hit.id)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            bad = await client.post(f"/api/host/hits/{hid}/quarantine", headers=_auth(owner, org.id))
            assert bad.status_code == 400
    finally:
        app.dependency_overrides.clear()
    await db_session.refresh(hit)
    assert hit.status == "open"
    events = (
        (await db_session.execute(select(HostQuarantineEvent).where(HostQuarantineEvent.hit_id == hit.id)))
        .scalars()
        .all()
    )
    assert events == []


@pytest.mark.asyncio
async def test_auto_quarantine_skips_suspicious(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.host_handoff.send_host_protect_email", _async_ok)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Auto",
        root_path="/var/www/html",
        auto_quarantine=True,
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    await run_mock_host_scan(db_session, scan.id)
    hits = (await db_session.execute(select(HostHit).where(HostHit.site_id == site.id))).scalars().all()
    assert len(hits) == 1
    assert hits[0].status == "quarantined"
    assert hits[0].hit_class == "webshell"


def test_jail_rel_path_rejects_traversal():
    from app.services.host_path import jail_rel_path

    with pytest.raises(ValueError):
        jail_rel_path("/var/www/html", "../etc/passwd")
    with pytest.raises(ValueError):
        jail_rel_path("/var/www/html", "ok/../../etc/passwd")
    assert jail_rel_path("/var/www/html", "wp-content/uploads/cache.php").endswith("cache.php")


@pytest.mark.asyncio
async def test_host_scan_job_mock_when_root_missing(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="MissingRoot",
        root_path="/var/www/host-protect-not-on-worker",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()
    out = await run_host_scan_job(db_session, scan.id)
    assert out["ok"] is True
    assert out.get("pending_agent") is True
    assert out["hit_count"] == 0
    await db_session.refresh(scan)
    assert scan.status == "queued"
    assert scan.error is None
    hits = (await db_session.execute(select(HostHit).where(HostHit.site_id == site.id))).scalars().all()
    assert hits == []


@pytest.mark.asyncio
async def test_host_scan_job_skips_local_walk_when_flag_off(
    db_session: AsyncSession, ctx, tmp_path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(settings, "host_protect_allow_local_walk", False)
    root = tmp_path / "www"
    root.mkdir()
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="LocalWalkOff",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(scan)
    await db_session.commit()

    def _boom(_p: str) -> list[dict[str, str]]:
        raise AssertionError("local walk must not run")

    monkeypatch.setattr("app.services.host_scan_runner.validate_root_path", lambda _p: str(root))
    monkeypatch.setattr("app.services.host_scan_runner.scan_local_root", _boom)
    out = await run_host_scan_job(db_session, scan.id)
    assert out.get("pending_agent") is True
    await db_session.refresh(scan)
    assert scan.status == "queued"


@pytest.mark.asyncio
async def test_host_scan_job_ignores_stale_mock_when_root_missing(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="MissingRootMock",
        root_path="/var/www/host-protect-not-on-worker",
        created_by=owner.id,
    )
    stale = HostHit(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        rel_path="wp-content/uploads/cache.php",
        hit_class="webshell",
        engine="mock",
        rule_id="mock.webshell.php",
        status="open",
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db_session.add(site)
    db_session.add(stale)
    db_session.add(scan)
    await db_session.commit()
    out = await run_host_scan_job(db_session, scan.id)
    assert out["ok"] is True
    assert out.get("pending_agent") is True
    assert out["hit_count"] == 0
    await db_session.refresh(stale)
    assert stale.status == "ignored"


async def _queued_scan(
    db: AsyncSession, org: Organization, owner: User, agent: GuardAgent
) -> tuple[HostSite, HostScan]:
    site = HostSite(
        id=uuid.uuid4(),
        organization_id=org.id,
        guard_agent_id=agent.id,
        name="Ingest",
        root_path="/var/www/html",
        created_by=owner.id,
    )
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=org.id,
        site_id=site.id,
        status="queued",
        trigger="manual",
    )
    db.add(site)
    db.add(scan)
    await db.commit()
    return site, scan


def _finding(**overrides: str) -> dict[str, str]:
    row = {
        "rel_path": "wp-content/uploads/cache.php",
        "class": "webshell",
        "rule_id": "needles.php.webshell",
        "sha256": "a" * 64,
    }
    row.update(overrides)
    return row


@pytest.mark.asyncio
async def test_agent_ingest_persists_hits(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "needles",
                    "findings": [_finding()],
                },
            )
            assert r.status_code == 200, r.text
            assert r.json()["hit_count"] == 1
            assert r.json()["engine"] == "needles"
    finally:
        app.dependency_overrides.clear()
    hits = (await db_session.execute(select(HostHit).where(HostHit.scan_id == scan.id))).scalars().all()
    assert len(hits) == 1
    assert hits[0].engine == "needles"
    assert hits[0].sha256 == "a" * 64
    await db_session.refresh(scan)
    assert scan.status == "completed"


@pytest.mark.asyncio
async def test_agent_ingest_accepts_clam_engine(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "clam",
                    "findings": [_finding(rule_id="clam.Eicar-Test-Signature")],
                },
            )
            assert r.status_code == 200, r.text
            assert r.json()["engine"] == "clam"
    finally:
        app.dependency_overrides.clear()
    hits = (await db_session.execute(select(HostHit).where(HostHit.scan_id == scan.id))).scalars().all()
    assert hits[0].engine == "clam"


@pytest.mark.asyncio
async def test_agent_ingest_bad_token_401(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    _, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": "not-the-token"},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "yara",
                    "findings": [],
                },
            )
            assert r.status_code == 401
            missing = await client.post(
                "/api/host/agent/results",
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "yara",
                    "findings": [],
                },
            )
            assert missing.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_ingest_revoked_token_401(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    agent.results_token_revoked_at = datetime.now(UTC)
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "yara",
                    "findings": [],
                },
            )
            assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_ingest_idor_other_org_401(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    outsider: User = ctx["outsider"]
    other_org = Organization(
        id=uuid.uuid4(),
        name="Other Host Org",
        slug=f"other-host-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="multi",
        created_by_user_id=outsider.id,
    )
    db_session.add(other_org)
    await db_session.flush()
    other_agent = GuardAgent(
        id=uuid.uuid4(),
        organization_id=other_org.id,
        wazuh_agent_id="002",
        name="vps-other",
        status="active",
        synced_at=datetime.now(UTC),
    )
    raw_a, hash_a = generate_results_token()
    agent.results_token_hash = hash_a
    raw_b, hash_b = generate_results_token()
    other_agent.results_token_hash = hash_b
    db_session.add(other_agent)
    _, scan_a = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw_b},
                json={
                    "scan_id": str(scan_a.id),
                    "agent_id": str(other_agent.id),
                    "engine": "needles",
                    "findings": [_finding()],
                },
            )
            assert r.status_code == 401
            mismatch = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw_a},
                json={
                    "scan_id": str(scan_a.id),
                    "agent_id": str(other_agent.id),
                    "engine": "needles",
                    "findings": [_finding()],
                },
            )
            assert mismatch.status_code == 401
    finally:
        app.dependency_overrides.clear()
    hits = (await db_session.execute(select(HostHit).where(HostHit.scan_id == scan_a.id))).scalars().all()
    assert hits == []


@pytest.mark.asyncio
async def test_agent_ingest_oversize_413(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    findings = [_finding() | {"rule_id": f"rule-{i}"} for i in range(MAX_AGENT_FINDINGS + 1)]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "needles",
                    "findings": findings,
                },
            )
            assert r.status_code == 413
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_ingest_flag_off_404(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "host_protect_enabled", False)
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    _, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/host/agent/results",
                headers={"X-Host-Agent-Token": raw},
                json={
                    "scan_id": str(scan.id),
                    "agent_id": str(agent.id),
                    "engine": "yara",
                    "findings": [],
                },
            )
            assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_agent_poll_returns_queued_jobs(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    owner: User = ctx["owner"]
    agent: GuardAgent = ctx["agent"]
    raw, token_hash = generate_results_token()
    agent.results_token_hash = token_hash
    site, scan = await _queued_scan(db_session, org, owner, agent)
    _bind_db(db_session)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(
                "/api/host/agent/jobs",
                params={"agent_id": str(agent.id)},
                headers={"X-Host-Agent-Token": raw},
            )
            assert r.status_code == 200, r.text
            jobs = r.json()["jobs"]
            assert len(jobs) == 1
            assert jobs[0]["scan_id"] == str(scan.id)
            assert jobs[0]["root_path"] == site.root_path
            bad = await client.get(
                "/api/host/agent/jobs",
                params={"agent_id": str(agent.id)},
                headers={"X-Host-Agent-Token": "wrong"},
            )
            assert bad.status_code == 401
    finally:
        app.dependency_overrides.clear()
