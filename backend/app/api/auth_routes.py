import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import jwt
from aiosmtplib.errors import SMTPException
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.credit_log import CreditLog
from app.models.email_verification import EmailVerificationToken
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    LogoutAllResponse,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    RevokeRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    logout_all,
    revoke_token,
    verify_password,
)
from app.services.email import send_password_reset_email, send_verification_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="ratelimit:login")
register_limiter = RateLimiter(max_requests=3, window_seconds=60, prefix="ratelimit:register")
refresh_limiter = RateLimiter(max_requests=10, window_seconds=60, prefix="ratelimit:refresh")
verify_email_limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="ratelimit:verify_email")
forgot_password_limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="ratelimit:forgot_password")
reset_password_limiter = RateLimiter(max_requests=5, window_seconds=60, prefix="ratelimit:reset_password")
resend_verification_limiter = RateLimiter(max_requests=3, window_seconds=60, prefix="ratelimit:resend_verification")
change_password_limiter = RateLimiter(max_requests=3, window_seconds=60, prefix="ratelimit:change_password")


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse | Response:
    limit_response = await register_limiter(request)
    if limit_response:
        return limit_response

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
        credits=settings.default_register_credits,
    )
    db.add(user)
    await db.flush()

    credit_log = CreditLog(
        user_id=user.id,
        amount=settings.default_register_credits,
        type="credit",
        description="Welcome bonus",
    )
    db.add(credit_log)

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
    except SMTPException:
        logger.exception("Failed to send verification email to %s", user.email)

    return MessageResponse(message="Registrasi berhasil. Periksa email Anda untuk verifikasi.")


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse | Response:
    limit_response = await login_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        logger.warning("Login failed for user")
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
    access_token = create_access_token(user_id=user_id_str, email=user.email, is_admin=user.is_admin)
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
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=access_minutes * 60,
        user=UserResponse.model_validate(user),
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    request: Request, body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse | Response:
    limit_response = await verify_email_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.token == body.token))
    verification_token = result.scalar_one_or_none()
    if verification_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token verifikasi tidak valid atau kadaluarsa",
        )

    expires_at = (
        verification_token.expires_at.replace(tzinfo=UTC)
        if verification_token.expires_at.tzinfo is None
        else verification_token.expires_at
    )
    if expires_at < datetime.now(UTC):
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


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(
    request: Request, body: ResendVerificationRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse | Response:
    limit_response = await resend_verification_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or user.is_verified is True:
        return MessageResponse(message="Email verifikasi telah dikirim. Silakan periksa kotak masuk Anda.")

    token_str = secrets.token_urlsafe(32)

    existing = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id))
    old_token = existing.scalar_one_or_none()
    if old_token is not None:
        await db.delete(old_token)
        await db.flush()

    verification_token = EmailVerificationToken(
        user_id=user.id,
        token=token_str,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(verification_token)
    await db.commit()

    try:
        await send_verification_email(email_to=user.email, token=token_str)
    except SMTPException:
        logger.exception("Failed to resend verification email to %s", user.email)

    return MessageResponse(message="Email verifikasi telah dikirim. Silakan periksa kotak masuk Anda.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: Request, body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse | Response:
    limit_response = await forgot_password_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is not None:
        token_str = secrets.token_urlsafe(32)

        existing = await db.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        old_token = existing.scalar_one_or_none()
        if old_token is not None:
            await db.delete(old_token)
            await db.flush()

        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token_str,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(reset_token)
        await db.commit()

        try:
            await send_password_reset_email(email_to=user.email, token=token_str)
        except SMTPException:
            logger.exception("Failed to send password reset email to %s", user.email)

    return MessageResponse(message="Jika email tersebut terdaftar, tautan reset telah dikirim")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: Request, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
) -> MessageResponse | Response:
    limit_response = await reset_password_limiter(request)
    if limit_response:
        return limit_response

    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi tidak cocok",
        )

    result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.token == body.token))
    reset_token = result.scalar_one_or_none()
    if reset_token is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token reset tidak valid atau kadaluarsa",
        )

    expires_at = (
        reset_token.expires_at.replace(tzinfo=UTC) if reset_token.expires_at.tzinfo is None else reset_token.expires_at
    )
    if expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token reset tidak valid atau kadaluarsa",
        )

    user_result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pengguna tidak ditemukan",
        )

    user.password_hash = hash_password(body.new_password)
    await db.delete(reset_token)
    await db.commit()

    return MessageResponse(message="Kata sandi berhasil direset")


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    body: RefreshRequest | None = None,
    response: Response = None,  # type: ignore[assignment]  # FastAPI injects Response, not a body field
    db: AsyncSession = Depends(get_db),
) -> TokenResponse | Response:
    limit_response = await refresh_limiter(request)
    if limit_response:
        return limit_response

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
    except jwt.PyJWTError as err:
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

    new_access_token = create_access_token(user_id=user_id_str, email=user.email, is_admin=user.is_admin)
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


@router.put("/profile", response_model=MessageResponse)
async def update_profile(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kata sandi saat ini salah",
        )

    if body.email != current_user.email:
        result = await db.execute(select(User).where(User.email == body.email))
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email sudah digunakan",
            )
        current_user.email = body.email
        await db.commit()

    return MessageResponse(message="Profil berhasil diperbarui")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse | Response:
    limit_response = await change_password_limiter(request)
    if limit_response:
        return limit_response

    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kata sandi saat ini salah",
        )

    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi tidak cocok",
        )

    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kata sandi baru tidak boleh sama dengan kata sandi saat ini",
        )

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()

    return MessageResponse(message="Kata sandi berhasil diubah")


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/revoke", response_model=MessageResponse)
async def revoke(
    body: RevokeRequest,
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    try:
        payload = decode_token(body.token)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token tidak valid atau kadaluarsa",
        ) from None

    jti = payload.get("jti")
    if jti is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token tidak memiliki JTI",
        )

    await revoke_token(jti, str(current_user.id))
    return MessageResponse(message="Token berhasil dicabut")


@router.post("/logout-all", response_model=LogoutAllResponse)
async def logout_all_endpoint(
    current_user: User = Depends(get_current_user),
) -> LogoutAllResponse:
    count = await logout_all(str(current_user.id))
    return LogoutAllResponse(
        message="Semua token telah dicabut",
        revoked_count=count,
    )
