from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization
from app.models.sku_tier_history import SkuTierHistory
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.sku_tier import SkuTierService, record_tier_assignment


async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = True) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=None,
    )
    # Repo-wide rate-limit bypass; without it the suite's shared budget yields 429.
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "true"}


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


async def _make_org(db: AsyncSession, owner: User, name: str) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


def _assigned(
    *,
    org: Organization,
    actor: User,
    sku_code: str,
    created_at: datetime,
    previous: str = "basic",
) -> SkuTierHistory:
    return SkuTierHistory(
        id=uuid.uuid4(),
        sku_code=sku_code,
        action="assigned",
        organization_id=org.id,
        actor_user_id=actor.id,
        changes={"tier": {"from": previous, "to": sku_code}},
        created_at=created_at,
    )


@pytest_asyncio.fixture
async def admin(db_session: AsyncSession) -> User:
    return await _make_user(db_session, "org-history-admin@example.com")


@pytest.mark.asyncio
async def test_history_for_org_returns_only_selected_org_newest_first(
    db_session: AsyncSession, admin: User
) -> None:
    org = await _make_org(db_session, admin, "Acme")
    other = await _make_org(db_session, admin, "Globex")
    now = datetime.now(UTC)
    older = _assigned(
        org=org, actor=admin, sku_code="pro", created_at=now - timedelta(minutes=5)
    )
    newer = _assigned(
        org=org, actor=admin, sku_code="multi", created_at=now, previous="pro"
    )
    db_session.add_all(
        [
            older,
            newer,
            _assigned(
                org=other, actor=admin, sku_code="pro", created_at=now - timedelta(minutes=1)
            ),
        ]
    )
    await db_session.commit()

    rows, total = await SkuTierService(db_session).history_for_org(org.id)

    assert total == 2
    assert [row.id for row, _, _ in rows] == [newer.id, older.id]
    assert all(email == admin.email for _, email, _ in rows)
    assert all(name == "Acme" for _, _, name in rows)


@pytest.mark.asyncio
async def test_history_for_org_excludes_other_organizations(
    db_session: AsyncSession, admin: User
) -> None:
    org = await _make_org(db_session, admin, "Acme")
    other = await _make_org(db_session, admin, "Globex")
    now = datetime.now(UTC)
    own = _assigned(org=org, actor=admin, sku_code="pro", created_at=now)
    foreign = _assigned(
        org=other, actor=admin, sku_code="pro", created_at=now - timedelta(minutes=1)
    )
    db_session.add_all([own, foreign])
    await db_session.commit()

    rows, total = await SkuTierService(db_session).history_for_org(org.id)

    assert total == 1
    assert [row.id for row, _, _ in rows] == [own.id]


@pytest.mark.asyncio
async def test_org_history_endpoint_returns_empty_for_unknown_org(
    db_session: AsyncSession, admin: User
) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/admin/orgs/{uuid.uuid4()}/tier-history",
                headers=_auth(admin),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_history_for_org_paginates(db_session: AsyncSession, admin: User) -> None:
    org = await _make_org(db_session, admin, "Acme")
    now = datetime.now(UTC)
    db_session.add_all(
        [
            _assigned(
                org=org,
                actor=admin,
                sku_code="pro",
                created_at=now - timedelta(minutes=index),
            )
            for index in range(3)
        ]
    )
    await db_session.commit()

    service = SkuTierService(db_session)
    first_page, total = await service.history_for_org(org.id, page=1, page_size=2)
    second_page, second_total = await service.history_for_org(org.id, page=2, page_size=2)

    assert total == 3
    assert second_total == 3
    assert len(first_page) == 2
    assert len(second_page) == 1


@pytest.mark.asyncio
async def test_org_history_endpoint_rejects_non_admin_and_anonymous(
    db_session: AsyncSession,
) -> None:
    regular = await _make_user(
        db_session, "org-history-regular@example.com", is_admin=False
    )
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            anonymous = await client.get(
                f"/api/admin/orgs/{uuid.uuid4()}/tier-history"
            )
            forbidden = await client.get(
                f"/api/admin/orgs/{uuid.uuid4()}/tier-history",
                headers=_auth(regular),
            )
    finally:
        app.dependency_overrides.clear()

    assert anonymous.status_code == 401
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_org_and_tier_history_endpoints_read_the_same_rows(
    db_session: AsyncSession, admin: User
) -> None:
    org = await _make_org(db_session, admin, "Acme")
    record_tier_assignment(
        db_session,
        organization_id=org.id,
        sku_code="pro",
        previous="basic",
        actor_id=admin.id,
        source="admin_update",
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            tier_response = await client.get(
                "/api/admin/sku-tiers/pro/history", headers=_auth(admin)
            )
            org_response = await client.get(
                f"/api/admin/orgs/{org.id}/tier-history", headers=_auth(admin)
            )
    finally:
        app.dependency_overrides.clear()

    assert tier_response.status_code == 200, tier_response.text
    assert org_response.status_code == 200, org_response.text
    tier_items = tier_response.json()["items"]
    org_items = org_response.json()["items"]
    assert len(tier_items) == 1
    assert len(org_items) == 1
    assert tier_items[0]["id"] == org_items[0]["id"]
    assert org_items[0]["organization_id"] == str(org.id)
    assert org_items[0]["organization_name"] == "Acme"
    assert org_items[0]["actor_email"] == admin.email
