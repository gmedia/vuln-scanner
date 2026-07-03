from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254, description="Email address (RFC 5321 max 254 chars)")
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password must be at least 8 characters with uppercase, lowercase, and digit",
    )
    confirm_password: str = Field(..., max_length=128, description="Confirm password")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254, description="Email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 characters)")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    is_verified: bool
    is_admin: bool
    credits: int
    created_at: datetime


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., max_length=500, description="Email verification token")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254, description="Email address")


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., max_length=500, description="Password reset token")
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Password must be at least 8 characters with uppercase, lowercase, and digit",
    )
    confirm_password: str = Field(..., max_length=128, description="Confirm password")

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=500, description="Refresh token")


class MessageResponse(BaseModel):
    message: str


class RevokeRequest(BaseModel):
    token: str = Field(..., max_length=500, description="Token to revoke")


class LogoutAllResponse(BaseModel):
    message: str
    revoked_count: int


class UpdateProfileRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    current_password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )
    confirm_password: str = Field(..., max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v
