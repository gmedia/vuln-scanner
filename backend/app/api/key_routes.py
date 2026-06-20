import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.api_key import ApiKey
from app.schemas.api_key import (
    KeyCreateRequest,
    KeyListResponse,
    KeyResponse,
    KeyRevokeResponse,
)

router = APIRouter(prefix="/keys", tags=["keys"])

API_KEY_PREFIX = "sk_"


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _generate_key() -> str:
    return API_KEY_PREFIX + secrets.token_hex(32)


@router.post("/generate", response_model=KeyResponse, status_code=201)
async def generate_key(req: KeyCreateRequest, db: AsyncSession = Depends(get_db)):
    plain_key = _generate_key()
    key_hash = _hash_key(plain_key)

    api_key = ApiKey(
        key_hash=key_hash,
        name=req.name,
        is_active=True,
        rate_limit=req.rate_limit,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return KeyResponse(
        id=api_key.id,
        name=api_key.name,
        is_active=api_key.is_active,
        rate_limit=api_key.rate_limit,
        created_at=api_key.created_at,
        key=plain_key,
    )


@router.post("/revoke/{key_id}", response_model=KeyRevokeResponse)
async def revoke_key(key_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    await db.commit()
    await db.refresh(api_key)

    return KeyRevokeResponse(id=api_key.id, is_active=api_key.is_active)


@router.get("", response_model=KeyListResponse)
async def list_keys(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return KeyListResponse(
        keys=[
            KeyResponse(
                id=k.id,
                name=k.name,
                is_active=k.is_active,
                rate_limit=k.rate_limit,
                created_at=k.created_at,
            )
            for k in keys
        ]
    )


@router.delete("/{key_id}", status_code=204)
async def delete_key(key_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    await db.delete(api_key)
    await db.commit()
