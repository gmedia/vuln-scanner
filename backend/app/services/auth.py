import uuid as _uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Token revocation store (in-memory only — does NOT survive restarts).
# TODO: persist revoked JTI set in Redis for durability across restarts.
# ---------------------------------------------------------------------------
_revoked_tokens: dict[str, str] = {}  # jti -> user_id
_revoked_users: set[str] = set()  # user_ids that have been logged out globally

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
    payload: dict[str, Any] = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])  # type: ignore[no-any-return]
    jti = payload.get("jti")
    if jti is not None and jti in _revoked_tokens:
        raise jwt.PyJWTError("Token has been revoked")
    sub = payload.get("sub")
    if sub is not None and sub in _revoked_users:
        raise jwt.PyJWTError("Token has been revoked (user logged out)")
    return payload


def revoke_token(jti: str, user_id: str) -> None:
    """Record a token JTI as revoked so it can no longer be used."""
    _revoked_tokens[jti] = user_id


def is_token_revoked(jti: str) -> bool:
    """Check whether a token JTI has been revoked."""
    return jti in _revoked_tokens


def logout_all(user_id: str) -> int:
    """Revoke all tokens belonging to a user. Returns count of previously revoked tokens."""
    count = sum(1 for uid in _revoked_tokens.values() if uid == user_id)
    _revoked_users.add(user_id)
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
