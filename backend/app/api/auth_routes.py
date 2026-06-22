import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.email_verification import EmailVerificationToken
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
)
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.services.email import send_verification_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if body.password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi tidak cocok",
        )

    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email sudah terdaftar",
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    token_str = secrets.token_urlsafe(32)
    verification_token = EmailVerificationToken(
        user_id=user.id,
        token=token_str,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(verification_token)
    await db.commit()

    try:
        await send_verification_email(email_to=user.email, token=token_str)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)

    return MessageResponse(message="Registrasi berhasil. Periksa email Anda untuk verifikasi.")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau kata sandi salah",
        )

    if user.is_verified is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email belum diverifikasi",
        )

    user_id_str = str(user.id)
    access_token = create_access_token(user_id=user_id_str, email=user.email)
    refresh_token = create_refresh_token(user_id=user_id_str)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.jwt_refresh_expire_days * 86400,
        path="/api/auth",
    )

    access_minutes = settings.jwt_access_expire_minutes
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=access_minutes * 60,
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmailVerificationToken).where(EmailVerificationToken.token == body.token)
    )
    verification_token = result.scalar_one_or_none()
    if verification_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token verifikasi tidak valid atau kadaluarsa",
        )

    if verification_token.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token verifikasi tidak valid atau kadaluarsa",
        )

    user_result = await db.execute(select(User).where(User.id == verification_token.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pengguna tidak ditemukan",
        )

    user.is_verified = True
    user.verified_at = datetime.now(UTC)
    await db.delete(verification_token)
    await db.commit()

    return MessageResponse(message="Email berhasil diverifikasi")


@router.post("/refresh", response_model=None)
async def refresh(
    request: Request,
    body: RefreshRequest | None = None,
    response: Response = None,  # type: ignore[assignment]
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    refresh_token_str: str | None = None

    if body is not None and body.refresh_token:
        refresh_token_str = body.refresh_token
    elif request.cookies:
        refresh_token_str = request.cookies.get("refresh_token")

    if refresh_token_str is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token diperlukan",
        )

    try:
        payload = decode_token(refresh_token_str)
    except JWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token tidak valid atau kadaluarsa",
        ) from err

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipe token tidak valid",
        )

    user_id_str = cast(str | None, payload.get("sub"))
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak memiliki subject",
        )

    try:
        uid = UUID(user_id_str)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifier pengguna dalam token tidak valid",
        ) from err

    user_result = await db.execute(select(User).where(User.id == uid))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pengguna tidak ditemukan",
        )

    new_access_token = create_access_token(user_id=user_id_str, email=user.email)
    new_refresh_token = create_refresh_token(user_id=user_id_str)

    refresh_days = settings.jwt_refresh_expire_days
    if response is not None:
        response.set_cookie(
            key="refresh_token",
            value=new_refresh_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="strict",
            max_age=refresh_days * 86400,
            path="/api/auth",
        )

    access_minutes = settings.jwt_access_expire_minutes
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=access_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
