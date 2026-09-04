from __future__ import annotations

import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import AiApiKey
from app.utils import hash_key

KEY_PREFIX = "sk-sx-"


def mint_plaintext() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def prefix_of(plain: str) -> str:
    return plain[:16]


async def create_key(
    db: AsyncSession,
    *,
    organization_id: UUID,
    user_id: UUID,
    name: str,
) -> tuple[AiApiKey, str]:
    plain = mint_plaintext()
    row = AiApiKey(
        organization_id=organization_id,
        created_by_user_id=user_id,
        name=name,
        prefix=prefix_of(plain),
        key_hash=hash_key(plain),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row, plain


async def list_keys(db: AsyncSession, organization_id: UUID) -> list[AiApiKey]:
    return list(
        (
            await db.execute(
                select(AiApiKey)
                .where(AiApiKey.organization_id == organization_id)
                .order_by(AiApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def revoke_key(db: AsyncSession, *, organization_id: UUID, key_id: UUID) -> AiApiKey:
    row = (
        await db.execute(
            select(AiApiKey).where(AiApiKey.id == key_id, AiApiKey.organization_id == organization_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.is_active = False
    await db.commit()
    await db.refresh(row)
    return row


async def authenticate_customer_key(db: AsyncSession, bearer: str) -> AiApiKey:
    if not bearer.startswith(KEY_PREFIX):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    row = (
        await db.execute(select(AiApiKey).where(AiApiKey.key_hash == hash_key(bearer)))
    ).scalar_one_or_none()
    if row is None or not row.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    row.last_used_at = datetime.now(UTC)
    await db.flush()
    return row
