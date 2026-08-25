from __future__ import annotations

import ipaddress
import re
import uuid
from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.uptime import (
    DEFAULT_INTERVAL_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    MAX_INTERVAL_SECONDS,
    MAX_TIMEOUT_SECONDS,
    MIN_INTERVAL_SECONDS,
)

_HOST_RE = re.compile(r"^[a-zA-Z0-9._\-]+$")


def _is_blocked_ip(host: str, *, allow_private: bool = False) -> bool:
    if allow_private:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return bool(
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def assert_public_host(host: str, *, allow_private: bool | None = None) -> None:
    from app.config import settings

    if allow_private is None:
        allow_private = settings.uptime_allow_private
    if not allow_private and host.lower() in ("localhost", "metadata.google.internal"):
        raise ValueError("target host is not allowed")
    if _is_blocked_ip(host, allow_private=allow_private):
        raise ValueError("private, loopback, and metadata addresses are not allowed")


def normalize_http_target(raw: str) -> str:
    value = raw.strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("HTTP target must be http:// or https:// URL")
    if not parsed.hostname:
        raise ValueError("HTTP target must include a host")
    if parsed.username or parsed.password:
        raise ValueError("URL credentials are not allowed")
    assert_public_host(parsed.hostname)
    return value


def normalize_tcp_target(raw: str) -> str:
    value = raw.strip()
    if value.count(":") != 1:
        raise ValueError("TCP target must be host:port")
    host, port_s = value.rsplit(":", 1)
    if not host or not _HOST_RE.match(host):
        raise ValueError("TCP host is invalid")
    try:
        port = int(port_s)
    except ValueError as exc:
        raise ValueError("TCP port must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("TCP port out of range")
    assert_public_host(host)
    return f"{host.lower()}:{port}"


class UptimeMonitorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    check_type: str = Field(..., pattern=r"^(http|tcp)$")
    target: str = Field(..., min_length=1, max_length=2048)
    interval_seconds: int = Field(default=DEFAULT_INTERVAL_SECONDS, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS)
    timeout_seconds: int = Field(default=DEFAULT_TIMEOUT_SECONDS, ge=1, le=MAX_TIMEOUT_SECONDS)
    expect_status: int | None = Field(default=None, ge=100, le=599)
    keyword: str | None = Field(default=None, max_length=512)
    keyword_invert: bool = False
    notify_email: str | None = Field(default=None, max_length=255)
    asset_id: uuid.UUID | None = None
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def normalize_target(self) -> UptimeMonitorCreate:
        if self.check_type == "http":
            self.target = normalize_http_target(self.target)
        else:
            self.target = normalize_tcp_target(self.target)
            if self.expect_status is not None or self.keyword:
                raise ValueError("expect_status and keyword apply to HTTP only")
        return self


class UptimeMonitorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    interval_seconds: int | None = Field(default=None, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS)
    timeout_seconds: int | None = Field(default=None, ge=1, le=MAX_TIMEOUT_SECONDS)
    expect_status: int | None = Field(default=None, ge=100, le=599)
    keyword: str | None = Field(default=None, max_length=512)
    keyword_invert: bool | None = None
    notify_email: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else v


class UptimeMonitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    check_type: str
    target: str
    interval_seconds: int
    timeout_seconds: int
    expect_status: int | None
    keyword: str | None
    keyword_invert: bool
    enabled: bool
    state: str
    consecutive_fails: int
    last_checked_at: datetime | None
    last_status_code: int | None
    last_latency_ms: int | None = None
    last_error: str | None
    next_check_at: datetime
    notify_email: str | None
    asset_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    sku: str | None = None
    sku_limit: int | None = None
    uptime_24h: float | None = None


class UptimeSampleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    checked_at: datetime
    ok: bool
    latency_ms: int | None
    status_code: int | None
    error: str | None


class UptimeEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    from_state: str
    to_state: str
    at: datetime
    notified: bool
    detail: str | None
