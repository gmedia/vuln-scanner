import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.services.schedule import advance_next_run, compute_next_run_at

HEADERS = {"X-API-Key": settings.api_key}


class TestScheduleCrud:
    def test_list_empty(self, client):
        resp = client.get("/api/schedules", headers=HEADERS)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_domain_weekly(self, client):
        resp = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "name": "Weekly example",
                "scan_type": "domain",
                "target": "example.com",
                "cadence": "weekly",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["scan_type"] == "domain"
        assert data["target"] == "example.com"
        assert data["cadence"] == "weekly"
        assert data["enabled"] is True
        assert data["next_run_at"]
        assert data["timezone"] == "Asia/Jakarta"

    def test_create_ip_monthly(self, client):
        resp = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "ip",
                "target": "8.8.8.8",
                "cadence": "monthly",
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["target"] == "8.8.8.8"

    def test_create_rejects_mobile_type(self, client):
        resp = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "apk",
                "target": "app.apk",
                "cadence": "weekly",
            },
        )
        assert resp.status_code == 422

    def test_create_rejects_bad_domain(self, client):
        resp = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "not a domain",
                "cadence": "weekly",
            },
        )
        assert resp.status_code == 422

    def test_get_patch_delete(self, client):
        create = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "patch-me.example.com",
                "cadence": "weekly",
            },
        )
        assert create.status_code == 201
        sid = create.json()["id"]

        got = client.get(f"/api/schedules/{sid}", headers=HEADERS)
        assert got.status_code == 200
        assert got.json()["id"] == sid

        patched = client.patch(
            f"/api/schedules/{sid}",
            headers=HEADERS,
            json={"enabled": False, "name": "Paused"},
        )
        assert patched.status_code == 200
        assert patched.json()["enabled"] is False
        assert patched.json()["name"] == "Paused"

        deleted = client.delete(f"/api/schedules/{sid}", headers=HEADERS)
        assert deleted.status_code == 204

        missing = client.get(f"/api/schedules/{sid}", headers=HEADERS)
        assert missing.status_code == 404

    @pytest.mark.asyncio
    async def test_authz_isolation(self, client, db_session):
        me = User(
            id=uuid.uuid4(),
            email="test@example.com",
            password_hash="fake-hash",
            is_verified=True,
            credits=100,
        )
        other_id = uuid.uuid4()
        other = User(
            id=other_id,
            email="other-sched@example.com",
            password_hash="x",
            is_verified=True,
            credits=50,
        )
        db_session.add(me)
        db_session.add(other)
        await db_session.commit()
        sid = uuid.uuid4()
        sched = ScanSchedule(
            id=sid,
            user_id=other_id,
            scan_type="domain",
            target="other.example.com",
            cadence="weekly",
            timezone="Asia/Jakarta",
            next_run_at=datetime.now(UTC) + timedelta(days=1),
            enabled=True,
        )
        db_session.add(sched)
        await db_session.commit()

        resp = client.get(f"/api/schedules/{sid}", headers=HEADERS)
        assert resp.status_code == 404

        listed = client.get("/api/schedules", headers=HEADERS)
        assert listed.status_code == 200
        assert all(item["id"] != str(sid) for item in listed.json())

    def test_list_runs_empty(self, client):
        create = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "runs.example.com",
                "cadence": "weekly",
            },
        )
        sid = create.json()["id"]
        resp = client.get(f"/api/schedules/{sid}/runs", headers=HEADERS)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_rejects_over_enabled_cap(self, client):
        from app.schemas.schedule import MAX_SCHEDULES_PER_ORG

        for i in range(MAX_SCHEDULES_PER_ORG):
            resp = client.post(
                "/api/schedules",
                headers=HEADERS,
                json={
                    "scan_type": "domain",
                    "target": f"cap{i}.example.com",
                    "cadence": "weekly",
                },
            )
            assert resp.status_code == 201, resp.text

        over = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "over-cap.example.com",
                "cadence": "weekly",
            },
        )
        assert over.status_code == 400
        assert "Maximum" in over.json()["detail"]

    def test_reenable_rejects_over_enabled_cap(self, client):
        from app.schemas.schedule import MAX_SCHEDULES_PER_ORG

        ids: list[str] = []
        for i in range(MAX_SCHEDULES_PER_ORG):
            resp = client.post(
                "/api/schedules",
                headers=HEADERS,
                json={
                    "scan_type": "domain",
                    "target": f"re{i}.example.com",
                    "cadence": "weekly",
                    "enabled": True,
                },
            )
            assert resp.status_code == 201, resp.text
            ids.append(resp.json()["id"])

        paused = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "paused-extra.example.com",
                "cadence": "weekly",
                "enabled": False,
            },
        )
        assert paused.status_code == 201, paused.text
        extra_id = paused.json()["id"]

        bad = client.patch(
            f"/api/schedules/{extra_id}",
            headers=HEADERS,
            json={"enabled": True},
        )
        assert bad.status_code == 400
        assert "Maximum" in bad.json()["detail"]

        ok_pause = client.patch(
            f"/api/schedules/{ids[0]}",
            headers=HEADERS,
            json={"enabled": False},
        )
        assert ok_pause.status_code == 200

        ok_enable = client.patch(
            f"/api/schedules/{extra_id}",
            headers=HEADERS,
            json={"enabled": True},
        )
        assert ok_enable.status_code == 200
        assert ok_enable.json()["enabled"] is True


@pytest.mark.asyncio
async def test_cap_is_shared_within_organization(db_session):
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models.organization import Organization, OrganizationMembership
    from app.schemas.schedule import MAX_SCHEDULES_PER_ORG
    from app.services.auth import create_access_token

    org_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    member_id = uuid.uuid4()
    member_email = f"member-{member_id.hex[:8]}@example.com"
    db_session.add(
        Organization(
            id=org_id,
            name="Cap Co",
            slug=f"cap-co-{org_id.hex[:8]}",
            kind="company",
        )
    )
    db_session.add(
        User(
            id=owner_id,
            email=f"owner-{owner_id.hex[:8]}@example.com",
            password_hash="x",
            is_verified=True,
            credits=100,
        )
    )
    db_session.add(
        User(
            id=member_id,
            email=member_email,
            password_hash="x",
            is_verified=True,
            credits=100,
        )
    )
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=owner_id,
            role="owner",
        )
    )
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org_id,
            user_id=member_id,
            role="member",
        )
    )
    for i in range(MAX_SCHEDULES_PER_ORG):
        db_session.add(
            ScanSchedule(
                id=uuid.uuid4(),
                user_id=owner_id,
                organization_id=org_id,
                scan_type="domain",
                target=f"shared-cap{i}.example.com",
                cadence="weekly",
                timezone="Asia/Jakarta",
                next_run_at=datetime.now(UTC) + timedelta(days=1),
                enabled=True,
            )
        )
    await db_session.commit()

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    app.middleware_stack = None
    try:
        token = create_access_token(
            str(member_id),
            member_email,
            is_admin=False,
            org_id=str(org_id),
        )
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            over = await ac.post(
                "/api/schedules",
                headers={"Authorization": f"Bearer {token}", "X-E2E-Test": "1"},
                json={
                    "scan_type": "domain",
                    "target": "member-over-cap.example.com",
                    "cadence": "weekly",
                },
            )
        assert over.status_code == 400, over.text
        assert "Maximum" in over.json()["detail"]
        assert "organization" in over.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cap_isolated_across_organizations(db_session):
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models.organization import Organization, OrganizationMembership
    from app.schemas.schedule import MAX_SCHEDULES_PER_ORG
    from app.services.auth import create_access_token

    user_id = uuid.uuid4()
    org_a = uuid.uuid4()
    org_b = uuid.uuid4()
    email = f"multi-{user_id.hex[:8]}@example.com"
    db_session.add(
        User(
            id=user_id,
            email=email,
            password_hash="x",
            is_verified=True,
            credits=100,
        )
    )
    for oid, name, slug in (
        (org_a, "Org A", f"org-a-{org_a.hex[:8]}"),
        (org_b, "Org B", f"org-b-{org_b.hex[:8]}"),
    ):
        db_session.add(Organization(id=oid, name=name, slug=slug, kind="company"))
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=oid,
                user_id=user_id,
                role="owner",
            )
        )
    for i in range(MAX_SCHEDULES_PER_ORG):
        db_session.add(
            ScanSchedule(
                id=uuid.uuid4(),
                user_id=user_id,
                organization_id=org_a,
                scan_type="domain",
                target=f"orga-cap{i}.example.com",
                cadence="weekly",
                timezone="Asia/Jakarta",
                next_run_at=datetime.now(UTC) + timedelta(days=1),
                enabled=True,
            )
        )
    await db_session.commit()

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    app.middleware_stack = None
    try:
        token_b = create_access_token(
            str(user_id),
            email,
            is_admin=False,
            org_id=str(org_b),
        )
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ok = await ac.post(
                "/api/schedules",
                headers={"Authorization": f"Bearer {token_b}", "X-E2E-Test": "1"},
                json={
                    "scan_type": "domain",
                    "target": "orgb-ok.example.com",
                    "cadence": "weekly",
                },
            )
        assert ok.status_code == 201, ok.text
    finally:
        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_reenable_clears_last_error(self, client, db_session):
        create = client.post(
            "/api/schedules",
            headers=HEADERS,
            json={
                "scan_type": "domain",
                "target": "clear-error.example.com",
                "cadence": "weekly",
            },
        )
        assert create.status_code == 201, create.text
        sid = create.json()["id"]

        paused = client.patch(
            f"/api/schedules/{sid}",
            headers=HEADERS,
            json={"enabled": False},
        )
        assert paused.status_code == 200

        sched = await db_session.get(ScanSchedule, uuid.UUID(sid))
        assert sched is not None
        sched.last_error = "Insufficient credits"
        await db_session.commit()

        stuck = client.get(f"/api/schedules/{sid}", headers=HEADERS)
        assert stuck.status_code == 200
        assert stuck.json()["last_error"] == "Insufficient credits"
        assert stuck.json()["enabled"] is False

        reenabled = client.patch(
            f"/api/schedules/{sid}",
            headers=HEADERS,
            json={"enabled": True},
        )
        assert reenabled.status_code == 200, reenabled.text
        assert reenabled.json()["enabled"] is True
        assert reenabled.json()["last_error"] is None


class TestNextRunHelpers:
    def test_compute_weekly_in_future(self):
        nxt = compute_next_run_at("weekly", "Asia/Jakarta")
        assert nxt.tzinfo is not None
        assert nxt > datetime.now(UTC)

    def test_advance_weekly(self):
        base = datetime(2026, 8, 10, 2, 0, tzinfo=UTC)
        nxt = advance_next_run("weekly", "UTC", base)
        assert nxt == base + timedelta(days=7)

    def test_advance_monthly(self):
        base = datetime(2026, 1, 15, 2, 0, tzinfo=UTC)
        nxt = advance_next_run("monthly", "UTC", base)
        assert nxt.month == 2
        assert nxt.year == 2026
