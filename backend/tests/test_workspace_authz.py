from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.scan_job import ScanJob
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org


async def _make_user(db: AsyncSession, email: str, *, credits: int = 100) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=credits,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def _add_member(
    db: AsyncSession,
    org_id: uuid.UUID,
    user: User,
    role: str,
) -> OrganizationMembership:
    m = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org_id,
        user_id=user.id,
        role=role,
    )
    db.add(m)
    await db.commit()
    return m


def _auth_header(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-E2E-Test": "1",
    }


@pytest_asyncio.fixture
async def workspace(db_session: AsyncSession):
    owner = await _make_user(db_session, "owner@example.com")
    member = await _make_user(db_session, "member@example.com")
    viewer = await _make_user(db_session, "viewer@example.com")
    outsider = await _make_user(db_session, "outsider@example.com")

    company = Organization(
        id=uuid.uuid4(),
        name="Hotel Alpha",
        slug=f"hotel-alpha-{uuid.uuid4().hex[:6]}",
        kind="hotel",
        created_by_user_id=owner.id,
    )
    db_session.add(company)
    await db_session.flush()
    await _add_member(db_session, company.id, owner, "owner")
    await _add_member(db_session, company.id, member, "member")
    await _add_member(db_session, company.id, viewer, "viewer")

    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="203.0.113.10",
        status="completed",
        progress=100,
        user_id=owner.id,
        organization_id=company.id,
        completed_at=datetime.now(UTC),
    )
    db_session.add(job)

    schedule = ScanSchedule(
        id=uuid.uuid4(),
        user_id=owner.id,
        organization_id=company.id,
        name="Weekly edge",
        scan_type="ip",
        target="203.0.113.10",
        cadence="weekly",
        timezone="Asia/Jakarta",
        next_run_at=datetime.now(UTC) + timedelta(days=7),
        enabled=True,
    )
    db_session.add(schedule)
    await db_session.commit()

    return {
        "owner": owner,
        "member": member,
        "viewer": viewer,
        "outsider": outsider,
        "org": company,
        "job": job,
        "schedule": schedule,
    }


@pytest.mark.asyncio
async def test_member_can_read_org_job_outsider_cannot(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            org_id = workspace["org"].id
            job_id = str(workspace["job"].id)

            member_r = await client.get(
                f"/api/scan/{job_id}",
                headers=_auth_header(workspace["member"], org_id),
            )
            assert member_r.status_code == 200
            assert member_r.json()["target"] == "203.0.113.10"

            outsider_r = await client.get(
                f"/api/scan/{job_id}",
                headers=_auth_header(workspace["outsider"], workspace["outsider"].last_active_organization_id),
            )
            assert outsider_r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_create_schedule_member_can(db_session, workspace, mock_celery):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    body = {
        "name": "Nightly",
        "scan_type": "ip",
        "target": "203.0.113.20",
        "cadence": "weekly",
        "timezone": "Asia/Jakarta",
        "enabled": True,
    }
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            org_id = workspace["org"].id
            viewer_r = await client.post(
                "/api/schedules",
                headers=_auth_header(workspace["viewer"], org_id),
                json=body,
            )
            assert viewer_r.status_code == 403

            member_r = await client.post(
                "/api/schedules",
                headers=_auth_header(workspace["member"], org_id),
                json=body,
            )
            assert member_r.status_code == 201
            assert member_r.json()["target"] == "203.0.113.20"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_member_cannot_delete_others_schedule_owner_can(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    schedule_id = str(workspace["schedule"].id)
    org_id = workspace["org"].id
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            member_r = await client.delete(
                f"/api/schedules/{schedule_id}",
                headers=_auth_header(workspace["member"], org_id),
            )
            assert member_r.status_code == 403

            owner_r = await client.delete(
                f"/api/schedules/{schedule_id}",
                headers=_auth_header(workspace["owner"], org_id),
            )
            assert owner_r.status_code == 204
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invalid_org_claim_rejected(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    fake_org = uuid.uuid4()
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                "/api/auth/me",
                headers=_auth_header(workspace["owner"], fake_org),
            )
            assert r.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_history_lists_org_jobs_for_member(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            org_id = workspace["org"].id
            r = await client.get(
                "/api/scan/history",
                headers=_auth_header(workspace["member"], org_id),
            )
            assert r.status_code == 200
            items = r.json()["items"]
            assert any(i["id"] == str(workspace["job"].id) for i in items)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_orgs_and_switch(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            owner = workspace["owner"]
            personal_id = owner.last_active_organization_id
            list_r = await client.get(
                "/api/orgs",
                headers=_auth_header(owner, personal_id),
            )
            assert list_r.status_code == 200
            org_ids = {item["id"] for item in list_r.json()}
            assert str(workspace["org"].id) in org_ids

            switch_r = await client.post(
                "/api/orgs/switch",
                headers=_auth_header(owner, personal_id),
                json={"organization_id": str(workspace["org"].id)},
            )
            assert switch_r.status_code == 200
            data = switch_r.json()
            assert data["active_org_id"] == str(workspace["org"].id)
            assert data["access_token"]
    finally:
        app.dependency_overrides.clear()
