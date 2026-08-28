from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.uptime import UptimeMonitor
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
    owner = await _make_user(db_session, "sp-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Status Org",
        slug=f"sp-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="pro",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    mon = UptimeMonitor(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by=owner.id,
        name="web",
        check_type="http",
        target="https://example.com",
        interval_seconds=60,
        timeout_seconds=10,
        enabled=True,
        state="up",
        consecutive_fails=0,
        next_check_at=datetime.now(UTC),
    )
    db_session.add(mon)
    await db_session.commit()
    return {"owner": owner, "org": org, "monitor": mon}


def _bind_db(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest.mark.asyncio
async def test_status_page_crud_and_public_html(ctx, db_session: AsyncSession):
    _bind_db(db_session)
    owner, org, mon = ctx["owner"], ctx["org"], ctx["monitor"]
    headers = _auth(owner, org.id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.put(
            "/api/status-page",
            json={"slug": "acme-lab", "title": "Acme"},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        r = await client.post(
            "/api/status-page/components",
            json={"monitor_id": str(mon.id), "display_name": "Website"},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        r = await client.patch("/api/status-page", json={"published": True}, headers=headers)
        assert r.status_code == 200
        pub = await client.get("/status/acme-lab", headers={"X-E2E-Test": "1"})
        assert pub.status_code == 200
        assert "Acme" in pub.text
        assert "Website" in pub.text
        assert "example.com" not in pub.text
        assert "timeout" not in pub.text.lower()
        assert "Authorization" not in pub.text
        assert "All systems operational" in pub.text
        assert "SINEXIS" in pub.text.replace(" ", "") or "SINE" in pub.text
        assert "Components" in pub.text
        assert 'class="site-header"' in pub.text
        hidden = await client.get("/status/missing", headers={"X-E2E-Test": "1"})
        assert hidden.status_code == 404
        renamed = await client.patch(
            "/api/status-page",
            json={"slug": "acme-prod"},
            headers=headers,
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["slug"] == "acme-prod"
        assert renamed.json()["public_path"] == "/status/acme-prod"
        old = await client.get("/status/acme-lab", headers={"X-E2E-Test": "1"})
        assert old.status_code == 404
        fresh = await client.get("/status/acme-prod", headers={"X-E2E-Test": "1"})
        assert fresh.status_code == 200
        assert "Acme" in fresh.text


@pytest.mark.asyncio
async def test_basic_sku_cannot_publish(ctx, db_session: AsyncSession):
    _bind_db(db_session)
    org: Organization = ctx["org"]
    org.sku = "basic"
    await db_session.commit()
    headers = _auth(ctx["owner"], org.id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.put(
            "/api/status-page",
            json={"slug": "nope", "title": "Nope"},
            headers=headers,
        )
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_reserved_hostname(ctx, db_session: AsyncSession):
    _bind_db(db_session)
    org: Organization = ctx["org"]
    org.sku = "multi"
    await db_session.commit()
    headers = _auth(ctx["owner"], org.id)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.put(
            "/api/status-page",
            json={"slug": "ok-page", "title": "Ok"},
            headers=headers,
        )
        assert r.status_code == 200
        bad = await client.patch(
            "/api/status-page",
            json={"custom_hostname": "foo.sinexis.app"},
            headers=headers,
        )
        assert bad.status_code == 400
        apex = await client.patch(
            "/api/status-page",
            json={"custom_hostname": "vs.appmedia.id"},
            headers=headers,
        )
        assert apex.status_code == 400
        ok_host = await client.patch(
            "/api/status-page",
            json={"custom_hostname": "status-erp.appmedia.id"},
            headers=headers,
        )
        assert ok_host.status_code == 200, ok_host.text
        assert ok_host.json()["custom_hostname"] == "status-erp.appmedia.id"
