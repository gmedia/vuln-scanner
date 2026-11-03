from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sku_tier import SkuTier
from app.models.user import User
from app.schemas.sku_tier import SkuTierUpdate
from app.services.auth import hash_password
from app.services.sku_tier import SkuTierService


async def _make_admin(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=True,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _add_tier(
    db: AsyncSession,
    code: str,
    *,
    rank: int,
    active: bool = True,
    requestable: bool = True,
) -> None:
    db.add(
        SkuTier(
            code=code,
            label=code.replace("_", " ").title(),
            rank=rank,
            active=active,
            requestable=requestable,
            limit_scan=5,
            limit_host=5,
            limit_uptime=50,
            limit_guard=5,
        )
    )
    await db.commit()


async def _make_only_requestable(db: AsyncSession, code: str, *, rank: int = 20) -> None:
    tiers = (await db.execute(select(SkuTier))).scalars().all()
    for tier in tiers:
        tier.requestable = False
    await _add_tier(db, code, rank=rank)



@pytest_asyncio.fixture
async def admin(db_session: AsyncSession) -> User:
    return await _make_admin(db_session, "rails-admin@example.com")


@pytest.mark.asyncio
async def test_cannot_retire_the_last_requestable_tier(db_session: AsyncSession, admin: User) -> None:
    await _make_only_requestable(db_session, "solo")

    with pytest.raises(Exception) as caught:
        await SkuTierService(db_session).deactivate("solo", admin)

    assert getattr(caught.value, "status_code", None) == 409
    assert "last tier" in caught.value.detail


@pytest.mark.asyncio
async def test_can_retire_a_tier_when_another_stays_requestable(
    db_session: AsyncSession, admin: User
) -> None:
    await _add_tier(db_session, "duo", rank=21)

    retired = await SkuTierService(db_session).deactivate("duo", admin)

    assert retired.active is False


@pytest.mark.asyncio
async def test_cannot_clear_requestable_on_the_last_requestable_tier(
    db_session: AsyncSession, admin: User
) -> None:
    await _make_only_requestable(db_session, "solo")

    with pytest.raises(Exception) as caught:
        await SkuTierService(db_session).update(
            "solo", SkuTierUpdate(requestable=False), admin
        )

    assert getattr(caught.value, "status_code", None) == 409
    assert "last tier" in caught.value.detail


@pytest.mark.asyncio
async def test_cannot_deactivate_via_update_on_the_last_requestable_tier(
    db_session: AsyncSession, admin: User
) -> None:
    await _make_only_requestable(db_session, "solo")

    with pytest.raises(Exception) as caught:
        await SkuTierService(db_session).update("solo", SkuTierUpdate(active=False), admin)

    assert getattr(caught.value, "status_code", None) == 409


