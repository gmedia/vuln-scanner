from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.organization import Organization, OrganizationInvite, OrganizationMembership
from app.models.scan_job import ScanJob
from app.models.scan_schedule import ScanSchedule
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import OrganizationService, ensure_personal_org, hash_invite_token


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


async def _make_org(
    db: AsyncSession,
    owner: User,
    *,
    sku: str = "basic",
    name: str = "Seat Cap Co",
) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        slug=f"seat-cap-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku=sku,
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.flush()
    await _add_member(db, org.id, owner, "owner")
    return org


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
        sku="pro",
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


@pytest.mark.asyncio
async def test_invite_create_returns_token_and_accept_sets_org(db_session, workspace):
    from app.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            org_id = workspace["org"].id
            owner = workspace["owner"]
            invitee = workspace["outsider"]

            with patch(
                "app.api.org_routes.send_invite_email",
                new_callable=AsyncMock,
                return_value=True,
            ) as send_mock:
                create_r = await client.post(
                    f"/api/orgs/{org_id}/invites",
                    headers=_auth_header(owner, org_id),
                    json={"email": invitee.email, "role": "member"},
                )
            assert create_r.status_code == 201
            body = create_r.json()
            assert body["token"]
            assert body["email"] == invitee.email
            send_mock.assert_awaited_once()
            send_kwargs = send_mock.await_args.kwargs
            assert send_kwargs["email_to"] == invitee.email
            assert send_kwargs["token"] == body["token"]
            assert send_kwargs["org_name"] == workspace["org"].name
            assert send_kwargs["role"] == "member"
            assert send_kwargs["user_id"] == owner.id

            accept_r = await client.post(
                "/api/invites/accept",
                headers=_auth_header(invitee, invitee.last_active_organization_id),
                json={"token": body["token"]},
            )
            assert accept_r.status_code == 200
            accepted = accept_r.json()
            assert accepted["organization_id"] == str(org_id)
            assert accepted["role"] == "member"
            assert accepted["user_id"] == str(invitee.id)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invite_create_persists_when_smtp_fails(db_session, workspace):
    from app.database import get_db
    from app.models.organization import OrganizationInvite

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            org_id = workspace["org"].id
            owner = workspace["owner"]
            with patch(
                "app.api.org_routes.send_invite_email",
                new_callable=AsyncMock,
                side_effect=OSError("smtp down"),
            ) as send_mock:
                create_r = await client.post(
                    f"/api/orgs/{org_id}/invites",
                    headers=_auth_header(owner, org_id),
                    json={"email": "new.invitee@example.com", "role": "viewer"},
                )
            assert create_r.status_code == 201
            body = create_r.json()
            assert body["token"]
            assert body["email"] == "new.invitee@example.com"
            send_mock.assert_awaited_once()
            stored = await db_session.get(OrganizationInvite, uuid.UUID(body["id"]))
            assert stored is not None
            assert stored.status == "pending"
            assert stored.email == "new.invitee@example.com"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_basic_owner_plus_viewer_invite_ok(db_session):
    owner = await _make_user(db_session, "r5-a-owner@example.com")
    org = await _make_org(db_session, owner)
    svc = OrganizationService(db_session)

    invite, raw = await svc.create_invite(org.id, owner, email="r5-a-viewer@example.com", role="viewer")

    assert invite.role == "viewer"
    assert invite.status == "pending"
    assert raw


@pytest.mark.asyncio
async def test_basic_second_viewer_invite_forbidden(db_session):
    owner = await _make_user(db_session, "r5-b-owner@example.com")
    viewer = await _make_user(db_session, "r5-b-viewer@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, viewer, "viewer")
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.create_invite(org.id, owner, email="r5-b-viewer2@example.com", role="viewer")

    assert exc.value.status_code == 403
    assert "1 editor and 1 viewer" in exc.value.detail


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["admin", "member"])
async def test_basic_write_role_invite_forbidden(db_session, role):
    owner = await _make_user(db_session, f"r5-c-{role}-owner@example.com")
    org = await _make_org(db_session, owner)
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.create_invite(org.id, owner, email=f"r5-c-{role}@example.com", role=role)

    assert exc.value.status_code == 403
    assert "1 editor and 1 viewer" in exc.value.detail


@pytest.mark.asyncio
async def test_basic_grandfathered_owner_member_can_add_viewer(db_session):
    owner = await _make_user(db_session, "r5-d-owner@example.com")
    member = await _make_user(db_session, "r5-d-member@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, member, "member")
    svc = OrganizationService(db_session)

    invite, _ = await svc.create_invite(org.id, owner, email="r5-d-viewer@example.com", role="viewer")

    assert invite.role == "viewer"


@pytest.mark.asyncio
async def test_basic_full_org_blocks_further_membership(db_session):
    owner = await _make_user(db_session, "r5-e-owner@example.com")
    viewer = await _make_user(db_session, "r5-e-viewer@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, viewer, "viewer")
    svc = OrganizationService(db_session)

    for role in ("admin", "member", "viewer"):
        with pytest.raises(HTTPException) as exc:
            await svc.create_invite(org.id, owner, email=f"r5-e-new-{role}@example.com", role=role)
        assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("sku", ["pro", "multi"])
async def test_non_basic_skus_have_no_seat_cap(db_session, sku):
    owner = await _make_user(db_session, f"r5-f-{sku}-owner@example.com")
    org = await _make_org(db_session, owner, sku=sku)
    svc = OrganizationService(db_session)

    for index, role in enumerate(("admin", "member", "viewer", "viewer", "admin")):
        invite, _ = await svc.create_invite(
            org.id,
            owner,
            email=f"r5-f-{sku}-{index}@example.com",
            role=role,
        )
        assert invite.role == role


@pytest.mark.asyncio
async def test_basic_grandfathered_over_cap_blocks_new_additions_only(db_session):
    owner = await _make_user(db_session, "r5-g-owner@example.com")
    member = await _make_user(db_session, "r5-g-member@example.com")
    viewer = await _make_user(db_session, "r5-g-viewer@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, member, "member")
    await _add_member(db_session, org.id, viewer, "viewer")
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.create_invite(org.id, owner, email="r5-g-extra@example.com", role="viewer")
    assert exc.value.status_code == 403

    members = await svc.list_members(org.id, owner)
    assert {m.role for m in members} == {"owner", "member", "viewer"}


@pytest.mark.asyncio
async def test_basic_accept_viewer_invite_ok(db_session):
    owner = await _make_user(db_session, "r5-h-owner@example.com")
    invitee = await _make_user(db_session, "r5-h-viewer@example.com")
    org = await _make_org(db_session, owner)
    svc = OrganizationService(db_session)
    invite, raw = await svc.create_invite(org.id, owner, email=invitee.email, role="viewer")

    membership = await svc.accept_invite(invitee, raw)

    assert membership.role == "viewer"
    assert membership.organization_id == org.id


@pytest.mark.asyncio
async def test_basic_accept_rechecks_viewer_cap(db_session):
    owner = await _make_user(db_session, "r5-i-owner@example.com")
    invitee = await _make_user(db_session, "r5-i-viewer@example.com")
    other = await _make_user(db_session, "r5-i-other@example.com")
    org = await _make_org(db_session, owner)
    svc = OrganizationService(db_session)
    invite, raw = await svc.create_invite(org.id, owner, email=invitee.email, role="viewer")
    await _add_member(db_session, org.id, other, "viewer")

    with pytest.raises(HTTPException) as exc:
        await svc.accept_invite(invitee, raw)

    assert exc.value.status_code == 403
    assert "1 editor and 1 viewer" in exc.value.detail


@pytest.mark.asyncio
async def test_basic_accept_rechecks_write_cap(db_session):
    owner = await _make_user(db_session, "r5-j-owner@example.com")
    invitee = await _make_user(db_session, "r5-j-admin@example.com")
    org = await _make_org(db_session, owner)
    raw = "r5-j-raw-token-value"
    db_session.add(
        OrganizationInvite(
            id=uuid.uuid4(),
            organization_id=org.id,
            email=invitee.email,
            role="admin",
            token_hash=hash_invite_token(raw),
            invited_by_user_id=owner.id,
            status="pending",
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    await db_session.commit()
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.accept_invite(invitee, raw)

    assert exc.value.status_code == 403
    assert "1 editor and 1 viewer" in exc.value.detail


@pytest.mark.asyncio
async def test_basic_change_role_promote_viewer_to_member_forbidden(db_session):
    owner = await _make_user(db_session, "r5-k-owner@example.com")
    viewer = await _make_user(db_session, "r5-k-viewer@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, viewer, "viewer")
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.change_role(org.id, owner, viewer.id, "member")

    assert exc.value.status_code == 403
    assert "1 editor and 1 viewer" in exc.value.detail


@pytest.mark.asyncio
async def test_basic_change_role_demote_member_to_viewer_ok(db_session):
    owner = await _make_user(db_session, "r5-l-owner@example.com")
    member = await _make_user(db_session, "r5-l-member@example.com")
    org = await _make_org(db_session, owner)
    await _add_member(db_session, org.id, member, "member")
    svc = OrganizationService(db_session)

    changed = await svc.change_role(org.id, owner, member.id, "viewer")

    assert changed.role == "viewer"


@pytest.mark.asyncio
async def test_non_basic_change_role_unlimited(db_session):
    owner = await _make_user(db_session, "r5-m-owner@example.com")
    viewer = await _make_user(db_session, "r5-m-viewer@example.com")
    org = await _make_org(db_session, owner, sku="pro")
    await _add_member(db_session, org.id, viewer, "viewer")
    svc = OrganizationService(db_session)

    changed = await svc.change_role(org.id, owner, viewer.id, "member")

    assert changed.role == "member"


@pytest.mark.asyncio
async def test_basic_invite_http_403_detail(db_session):
    from app.database import get_db

    owner = await _make_user(db_session, "r5-n-owner@example.com")
    org = await _make_org(db_session, owner)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                f"/api/orgs/{org.id}/invites",
                headers=_auth_header(owner, org.id),
                json={"email": "r5-n-admin@example.com", "role": "admin"},
            )
            assert r.status_code == 403
            assert "1 editor and 1 viewer" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_can_set_enterprise_sku(db_session):
    admin = await _make_user(db_session, "r6-admin@example.com")
    admin.is_admin = True
    await db_session.commit()
    org = await _make_org(db_session, admin)
    svc = OrganizationService(db_session)

    updated = await svc.update_org(org.id, admin, sku="enterprise")

    assert updated.sku == "enterprise"


@pytest.mark.asyncio
async def test_non_admin_cannot_set_enterprise_sku(db_session):
    owner = await _make_user(db_session, "r6-owner@example.com")
    org = await _make_org(db_session, owner)
    svc = OrganizationService(db_session)

    with pytest.raises(HTTPException) as exc:
        await svc.update_org(org.id, owner, sku="enterprise")

    assert exc.value.status_code == 403
