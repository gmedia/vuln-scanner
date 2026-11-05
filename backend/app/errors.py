"""Stable machine-readable API error codes.

`detail` stays a human-readable string so existing clients and tests keep working;
`code` and `params` are additive fields the SPA can localize without parsing prose.
Contract: docs/specs/i18n-v1.md §6.2.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse


class ErrorCode(StrEnum):
    AUTH_MISSING_TOKEN = "auth_missing_token"
    AUTH_INVALID_TOKEN = "auth_invalid_token"
    AUTH_PASSWORD_MISMATCH = "auth_password_mismatch"
    GUARD_NOT_ENABLED = "guard_not_enabled"
    HOST_SITE_DUPLICATE = "host_site_duplicate"
    UPTIME_SEAT_LIMIT = "uptime_seat_limit"
    PROMO_APPROVAL_REQUIRED = "promo_approval_required"
    PROMO_SELF_APPROVAL = "promo_self_approval"
    PROMO_APPROVAL_NOT_REQUIRED = "promo_approval_not_required"
    PROMO_ALREADY_APPROVED = "promo_already_approved"


class ApiError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        detail: str,
        *,
        params: Mapping[str, str | int] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code: ErrorCode = code
        self.params: dict[str, str | int] = dict(params or {})


def api_error(
    status_code: int,
    code: ErrorCode,
    detail: str,
    *,
    params: Mapping[str, str | int] | None = None,
    headers: Mapping[str, str] | None = None,
) -> ApiError:
    return ApiError(status_code, code, detail, params=params, headers=headers)


async def api_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    # Starlette types the slot as Exception -> Response; the handler is only
    # registered for ApiError, so this narrows rather than re-checks reality.
    if not isinstance(exc, ApiError):
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "code": exc.code,
            "params": exc.params,
        },
        headers=exc.headers,
    )
