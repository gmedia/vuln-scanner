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
