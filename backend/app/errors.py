"""Stable machine-readable API error codes.

`detail` stays a human-readable string so existing clients and tests keep working;
`code` and `params` are additive fields the SPA can localize without parsing prose.
Contract: docs/specs/i18n-v1.md §6.2.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
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


_SOURCE_PREFIXES = frozenset({"body", "query", "path", "header", "cookie"})

# Pydantic error `ctx` values can be arbitrary objects (including a ValueError
# instance). Only primitives are safe and useful to ship to the client.
_Scalar = str | int | float | bool


def _field_path(loc: Sequence[str | int] | None) -> str:
    """Turn ``["body", "findings", 0, "class"]`` into ``findings[0].class``."""
    parts: list[str | int] = list(loc or [])
    if parts and str(parts[0]) in _SOURCE_PREFIXES:
        parts = parts[1:]

    path = ""
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        else:
            path = f"{path}.{part}" if path else str(part)
    return path


def _clean_message(raw: object) -> str:
    message = raw if isinstance(raw, str) else str(raw or "")
    message = message.strip()
    prefix = "Value error, "
    return message[len(prefix) :].strip() if message.startswith(prefix) else message


def _safe_params(ctx: object) -> dict[str, _Scalar]:
    if not isinstance(ctx, dict):
        return {}
    return {
        str(key): value
        for key, value in ctx.items()
        if isinstance(value, str | int | float | bool)
    }


def _validation_issue(raw: dict[str, Any]) -> dict[str, Any]:
    field = _field_path(raw.get("loc"))
    issue: dict[str, Any] = {
        "field": field,
        "msg": _clean_message(raw.get("msg")) or "Invalid value",
        "type": str(raw.get("type") or "value_error"),
    }
    params = _safe_params(raw.get("ctx"))
    if params:
        issue["params"] = params
    return issue


async def validation_exception_handler(
    _request: Request, exc: Exception
) -> JSONResponse:
    """Keep ``detail`` a string (so every existing reader works) and add the
    per-field map the SPA needs for inline errors.

    ``input`` is deliberately dropped: Pydantic echoes the submitted value, and
    for a rejected password that would write the secret into the response body
    and every access log between here and the browser.
    """
    if not isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    issues = [_validation_issue(dict(raw)) for raw in exc.errors()]
    fields: dict[str, str] = {}
    for issue in issues:
        field = issue["field"]
        if field and field not in fields:
            fields[field] = issue["msg"]

    detail = "; ".join(dict.fromkeys(issue["msg"] for issue in issues))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": detail or "Invalid request",
            "code": "validation_error",
            "params": {},
            "fields": fields,
            "errors": issues,
        },
    )
