import contextlib
import logging
import uuid as _uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

import jwt
import redis as sync_redis
import redis.asyncio as redis
from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Redis connection (lazy, shared across module)
# ---------------------------------------------------------------------------
_redis: redis.Redis[str] | None = None
_sync_redis: sync_redis.Redis[str] | None = None

# TTL for revoked keys: max(access_token, refresh_token) in seconds
_REVOKE_TTL = max(settings.jwt_access_expire_minutes * 60, settings.jwt_refresh_expire_days * 86400)


async def _get_redis() -> redis.Redis[str]:
    """Lazy Redis connection using settings.redis_url."""
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _get_sync_redis() -> sync_redis.Redis[str]:
    """Lazy synchronous Redis connection for revocation checks.

    Uses the blocking redis.Redis client (not redis.asyncio.Redis) so that
    _check_redis_revocation_sync() can call .get() directly without nesting
    event loops via asyncio.run().
    """
    global _sync_redis
    if _sync_redis is None:
        _sync_redis = sync_redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _sync_redis


# ---------------------------------------------------------------------------
# Token revocation store (in-memory cache + Redis persistence)
# ---------------------------------------------------------------------------
_revoked_tokens: dict[str, str] = {}  # jti -> user_id (in-memory cache)
_revoked_users: set[str] = set()  # user_ids that have been logged out globally (in-memory cache)

JWT_SECRET = settings.jwt_secret or settings.secret_key
JWT_ALGORITHM = settings.jwt_algorithm
ACCESS_EXPIRE = settings.jwt_access_expire_minutes
REFRESH_EXPIRE = settings.jwt_refresh_expire_days


def hash_password(password: str) -> str:
    return str(pwd_context.hash(password))


def verify_password(plain: str, hashed: str) -> bool:
    return bool(pwd_context.verify(plain, hashed))


def create_access_token(user_id: str, email: str, is_admin: bool = False) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_EXPIRE)
    payload = {
        "sub": user_id,
        "email": email,
        "is_admin": is_admin,
        "type": "access",
        "exp": expire,
        "jti": _uuid.uuid4().hex,
    }
    return str(jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM))


def create_refresh_token(user_id: str) -> str:
    expire = datetime.now(UTC) + timedelta(days=REFRESH_EXPIRE)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "jti": _uuid.uuid4().hex,
    }
    return str(jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM))


def decode_token(token: str) -> dict[str, Any]:
    payload: dict[str, Any] = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    jti = payload.get("jti")
    if jti is not None and jti in _revoked_tokens:
        raise jwt.PyJWTError("Token has been revoked")
    sub = payload.get("sub")
    if sub is not None and sub in _revoked_users:
        raise jwt.PyJWTError("Token has been revoked (user logged out)")
    # Best-effort Redis check: populate caches on miss, detect revocations that
    # happened on another server instance (or before a restart).
    with contextlib.suppress(Exception):
        _check_redis_revocation_sync(jti, sub)
    return payload


def _check_redis_revocation_sync(jti: str | None, sub: str | None) -> None:
    """Synchronous Redis check for revoked tokens/users — best-effort.

    Uses the blocking sync Redis client so decode_token() stays sync without
    nesting event loops (which causes RuntimeWarning in async contexts).
    On Redis miss, caches the negative result in the in-memory structures.
    On Redis hit, raises jwt.PyJWTError.
    """
    try:
        r = _get_sync_redis()
        if jti is not None:
            user_id: str | None = r.get(f"revoked_tokens:{jti}")
            if user_id is not None:
                _revoked_tokens[jti] = user_id
                raise jwt.PyJWTError("Token has been revoked")
        if sub is not None:
            found = r.get(f"revoked_users:{sub}")
            if found is not None:
                _revoked_users.add(sub)
                raise jwt.PyJWTError("Token has been revoked (user logged out)")
    except jwt.PyJWTError:
        raise
    except redis.RedisError:
        pass


async def revoke_token(jti: str, user_id: str) -> None:
    """Record a token JTI as revoked so it can no longer be used."""
    _revoked_tokens[jti] = user_id
    try:
        r = await _get_redis()
        await r.set(f"revoked_tokens:{jti}", user_id, ex=_REVOKE_TTL)
    except redis.RedisError:
        logger = logging.getLogger(__name__)
        logger.warning("Failed to persist revoked token JTI to Redis: %s", jti)


def is_token_revoked(jti: str) -> bool:
    """Check whether a token JTI has been revoked."""
    return jti in _revoked_tokens


async def logout_all(user_id: str) -> int:
    """Revoke all tokens belonging to a user. Returns count of previously revoked tokens."""
    count = sum(1 for uid in _revoked_tokens.values() if uid == user_id)
    _revoked_users.add(user_id)
    try:
        r = await _get_redis()
        await r.set(f"revoked_users:{user_id}", "1", ex=_REVOKE_TTL)
    except redis.RedisError:
        logger = logging.getLogger(__name__)
        logger.warning("Failed to persist revoked user to Redis: %s", user_id)
    return count


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    authorization: str | None = request.headers.get("Authorization")
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header format. Expected: Bearer <token>",
        )

    try:
        payload = decode_token(token)
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from err

    token_type: str | None = cast(str | None, payload.get("type"))
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type: access token required",
        )

    user_id: str | None = cast(str | None, payload.get("sub"))
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    try:
        uid = UUID(user_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier in token",
        ) from err

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
