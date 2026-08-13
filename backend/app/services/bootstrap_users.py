"""Upsert privileged users from env (ADMIN_* / E2E_*).

Used after deploy so GitHub Secrets become login credentials in the live DB.
Does not wipe scans or other users. Same email + new password overwrites hash.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.auth import hash_password

logger = logging.getLogger(__name__)

_WEAK_PASSWORDS = frozenset(
    {
        "change_me",
        "changeme",
        "admin",
        "password",
        "123456",
        "<your-admin-password>",
    }
)


def is_template_placeholder(value: str) -> bool:
    text = (value or "").strip()
    return bool(text) and text.startswith("<") and text.endswith(">")


def credentials_usable(email: str, password: str) -> bool:
    email = (email or "").strip()
    password = password or ""
    if not email or "@" not in email:
        return False
    if is_template_placeholder(email):
        return False
    if not password or len(password) < 8:
        return False
    if password.lower() in _WEAK_PASSWORDS:
        return False
    return not is_template_placeholder(password)


async def upsert_privileged_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    is_admin: bool,
    min_credits: int = 100,
) -> str:
    """Create or update user by email. Returns CREATED or UPDATED."""
    email = email.strip().lower()
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(password),
            is_verified=True,
            is_admin=is_admin,
            verified_at=now,
            credits=min_credits,
        )
        session.add(user)
        await session.commit()
        logger.info("privileged_user CREATED email=%s admin=%s", email, is_admin)
        return "CREATED"

    user.password_hash = hash_password(password)
    user.is_admin = is_admin
    user.is_verified = True
    user.verified_at = user.verified_at or now
    if (user.credits or 0) < min_credits:
        user.credits = min_credits
    await session.commit()
    logger.info("privileged_user UPDATED email=%s admin=%s", email, is_admin)
    return "UPDATED"


async def upsert_from_settings(session: AsyncSession, settings: Any) -> list[str]:
    """Apply ADMIN_* then E2E_* from settings/env-like object.

    If both emails match (case-insensitive), one upsert with admin=True.
    """
    actions: list[str] = []
    admin_email = (getattr(settings, "admin_email", None) or "").strip()
    admin_password = getattr(settings, "admin_password", None) or ""
    e2e_email = (getattr(settings, "e2e_email", None) or "").strip()
    e2e_password = getattr(settings, "e2e_password", None) or ""

    admin_ok = credentials_usable(admin_email, admin_password)
    e2e_ok = credentials_usable(e2e_email, e2e_password)

    if admin_ok and e2e_ok and admin_email.lower() == e2e_email.lower():
        action = await upsert_privileged_user(
            session,
            email=admin_email,
            password=admin_password,
            is_admin=True,
        )
        actions.append(f"admin+e2e:{action}")
        return actions

    if admin_ok:
        action = await upsert_privileged_user(
            session,
            email=admin_email,
            password=admin_password,
            is_admin=True,
        )
        actions.append(f"admin:{action}")
    else:
        logger.warning("ADMIN_EMAIL/ADMIN_PASSWORD missing or unusable — skip admin upsert")

    if e2e_ok:
        action = await upsert_privileged_user(
            session,
            email=e2e_email,
            password=e2e_password,
            is_admin=True,
        )
        actions.append(f"e2e:{action}")
    else:
        logger.warning("E2E_EMAIL/E2E_PASSWORD missing or unusable — skip e2e upsert")

    return actions
