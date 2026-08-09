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
        from app.schemas.schedule import MAX_SCHEDULES_PER_USER

        for i in range(MAX_SCHEDULES_PER_USER):
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
        from app.schemas.schedule import MAX_SCHEDULES_PER_USER

        ids: list[str] = []
        for i in range(MAX_SCHEDULES_PER_USER):
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
