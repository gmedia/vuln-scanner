from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.bootstrap_users import credentials_usable, upsert_from_settings, upsert_privileged_user


def test_credentials_usable() -> None:
    assert credentials_usable("admin@example.com", "str0ngPass!")
    assert not credentials_usable("", "str0ngPass!")
    assert not credentials_usable("no-at", "str0ngPass!")
    assert not credentials_usable("a@b.c", "short")
    assert not credentials_usable("a@b.c", "changeme")
    assert not credentials_usable("a@b.c", "<your-admin-password>")


@pytest.mark.asyncio
async def test_upsert_creates_when_missing() -> None:
    session = AsyncMock()
    empty = MagicMock()
    empty.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=empty)
    session.commit = AsyncMock()
    session.add = MagicMock()

    with patch("app.services.bootstrap_users.hash_password", return_value="hashed"):
        action = await upsert_privileged_user(session, email="Admin@Example.com", password="str0ngPass!", is_admin=True)
    assert action == "CREATED"
    session.add.assert_called_once()
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_upsert_updates_existing() -> None:
    session = AsyncMock()
    user = MagicMock()
    user.verified_at = None
    user.credits = 1
    found = MagicMock()
    found.scalar_one_or_none.return_value = user
    session.execute = AsyncMock(return_value=found)
    session.commit = AsyncMock()

    with patch("app.services.bootstrap_users.hash_password", return_value="newhash"):
        action = await upsert_privileged_user(
            session, email="e2e@example.com", password="newPassword1", is_admin=True, min_credits=100
        )
    assert action == "UPDATED"
    assert user.password_hash == "newhash"
    assert user.is_admin is True
    assert user.is_verified is True
    assert user.credits == 100
    session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_upsert_from_settings_dedupes_same_email() -> None:
    session = AsyncMock()
    settings = SimpleNamespace(
        admin_email="ops@example.com",
        admin_password="str0ngAdmin1",
        e2e_email="OPS@example.com",
        e2e_password="otherPass99",
    )
    with patch(
        "app.services.bootstrap_users.upsert_privileged_user", new_callable=AsyncMock, return_value="UPDATED"
    ) as up:
        actions = await upsert_from_settings(session, settings)
    assert actions == ["admin+e2e:UPDATED"]
    up.assert_awaited_once()


@pytest.mark.asyncio
async def test_upsert_from_settings_skips_weak() -> None:
    session = AsyncMock()
    settings = SimpleNamespace(
        admin_email="ops@example.com",
        admin_password="changeme",
        e2e_email="",
        e2e_password="",
    )
    with patch("app.services.bootstrap_users.upsert_privileged_user", new_callable=AsyncMock) as up:
        actions = await upsert_from_settings(session, settings)
    assert actions == []
    up.assert_not_called()
