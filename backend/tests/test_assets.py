from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=100,
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


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    owner = await _make_user(db_session, "asset-owner@example.com")
    member = await _make_user(db_session, "asset-member@example.com")
    viewer = await _make_user(db_session, "asset-viewer@example.com")
    outsider = await _make_user(db_session, "asset-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Asset Org",
        slug=f"asset-org-{uuid.uuid4().hex[:6]}",
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
    await db_session.commit()
    return {"owner": owner, "member": member, "viewer": viewer, "outsider": outsider, "org": org}


def _bind_db(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest.mark.asyncio
async def test_asset_crud_and_sku_cap(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    transport = ASGITransport(app=app)
    org = ctx["org"]
    owner: User = ctx["owner"]
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/assets",
                headers=_auth(owner, org.id),
                json={"name": "Edge", "scan_type": "domain", "target": "example.com"},
            )
            assert created.status_code == 201, created.text
            aid = created.json()["id"]
            listed = await client.get("/api/assets", headers=_auth(owner, org.id))
            assert listed.status_code == 200
            assert len(listed.json()) == 1
            assert listed.json()[0]["guard_agent_id"] is None
            assert listed.json()[0]["guard_agent_name"] is None
            patched = await client.patch(
                f"/api/assets/{aid}",
                headers=_auth(owner, org.id),
                json={"name": "Edge 2"},
            )
            assert patched.status_code == 200
            assert patched.json()["name"] == "Edge 2"
            tagged = await client.post(
                "/api/assets",
                headers=_auth(owner, org.id),
                json={
                    "name": "Prod web",
                    "scan_type": "domain",
                    "target": "prod.example",
                    "tags": ["Prod", "hotel", "prod"],
                },
            )
            assert tagged.status_code == 201, tagged.text
            assert tagged.json()["tags"] == ["prod", "hotel"]
            filtered = await client.get(
                "/api/assets",
                params={"tag": "hotel"},
                headers=_auth(owner, org.id),
            )
            assert filtered.status_code == 200
            assert [row["target"] for row in filtered.json()] == ["prod.example"]
            patched_tags = await client.patch(
                f"/api/assets/{tagged.json()['id']}",
                headers=_auth(owner, org.id),
                json={"tags": ["staging"]},
            )
            assert patched_tags.status_code == 200
            assert patched_tags.json()["tags"] == ["staging"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_cannot_create_outsider_idor(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    transport = ASGITransport(app=app)
    org = ctx["org"]
    owner: User = ctx["owner"]
    viewer: User = ctx["viewer"]
    outsider: User = ctx["outsider"]
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            denied = await client.post(
                "/api/assets",
                headers=_auth(viewer, org.id),
                json={"name": "Nope", "scan_type": "ip", "target": "203.0.113.9"},
            )
            assert denied.status_code == 403
            created = await client.post(
                "/api/assets",
                headers=_auth(owner, org.id),
                json={"name": "Pub", "scan_type": "domain", "target": "pub.example"},
            )
            aid = created.json()["id"]
            steal = await client.get(
                f"/api/assets/{aid}",
                headers=_auth(outsider, outsider.last_active_organization_id),
            )
            assert steal.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_basic_sku_hard_cap(db_session: AsyncSession, ctx):
    org: Organization = ctx["org"]
    org.sku = "basic"
    await db_session.commit()
    owner: User = ctx["owner"]
    _bind_db(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/assets",
                headers=_auth(owner, org.id),
                json={"name": "One", "scan_type": "domain", "target": "one.example"},
            )
            assert first.status_code == 201
            second = await client.post(
                "/api/assets",
                headers=_auth(owner, org.id),
                json={"name": "Two", "scan_type": "domain", "target": "two.example"},
            )
            assert second.status_code == 400
            assert "limit" in second.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_schedule_one_to_one(db_session: AsyncSession, ctx, mock_celery):
    _bind_db(db_session)
    org = ctx["org"]
    member: User = ctx["member"]
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/assets",
                headers=_auth(member, org.id),
                json={"name": "Sched", "scan_type": "domain", "target": "sched.example"},
            )
            aid = created.json()["id"]
            s1 = await client.post(
                f"/api/assets/{aid}/schedules",
                headers=_auth(member, org.id),
                json={"cadence": "weekly"},
            )
            assert s1.status_code == 201, s1.text
            s2 = await client.post(
                f"/api/assets/{aid}/schedules",
                headers=_auth(member, org.id),
                json={"cadence": "monthly"},
            )
            assert s2.status_code == 409
            pack = await client.get("/api/assets/pack", headers=_auth(member, org.id))
            assert pack.status_code == 200, pack.text
            body = pack.json()
            assert body["count"] == 1
            assert body["assets"][0]["schedule_id"] == s1.json()["id"]
            html_pack = await client.get(
                "/api/assets/pack",
                params={"format": "html", "lang": "en"},
                headers=_auth(member, org.id),
            )
            assert html_pack.status_code == 200, html_pack.text
            assert "text/html" in html_pack.headers.get("content-type", "")
            assert "Asset pack" in html_pack.text
            assert "sched.example" in html_pack.text
            assert "SINE" in html_pack.text
            bad = await client.get(
                "/api/assets/pack",
                params={"format": "pdf"},
                headers=_auth(member, org.id),
            )
            assert bad.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_tag_colors_member_patch_viewer_forbidden(db_session: AsyncSession, ctx):
    _bind_db(db_session)
    transport = ASGITransport(app=app)
    org = ctx["org"]
    owner: User = ctx["owner"]
    viewer: User = ctx["viewer"]
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            empty = await client.get("/api/assets/tag-colors", headers=_auth(owner, org.id))
            assert empty.status_code == 200
            assert empty.json()["colors"] == {}
            patched = await client.patch(
                "/api/assets/tag-colors",
                headers=_auth(owner, org.id),
                json={"colors": {"prod": "green", "hotel": "blue"}},
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["colors"] == {"prod": "green", "hotel": "blue"}
            merge = await client.patch(
                "/api/assets/tag-colors",
                headers=_auth(owner, org.id),
                json={"colors": {"prod": "red"}},
            )
            assert merge.json()["colors"]["prod"] == "red"
            assert merge.json()["colors"]["hotel"] == "blue"
            denied = await client.patch(
                "/api/assets/tag-colors",
                headers=_auth(viewer, org.id),
                json={"colors": {"prod": "amber"}},
            )
            assert denied.status_code == 403
            hexed = await client.patch(
                "/api/assets/tag-colors",
                headers=_auth(owner, org.id),
                json={"colors": {"prod": "#ff00aa"}},
            )
            assert hexed.status_code == 200, hexed.text
            assert hexed.json()["colors"]["prod"] == "#ff00aa"
            bad = await client.patch(
                "/api/assets/tag-colors",
                headers=_auth(owner, org.id),
                json={"colors": {"prod": "not-a-color"}},
            )
            assert bad.status_code == 422
    finally:
        app.dependency_overrides.clear()
