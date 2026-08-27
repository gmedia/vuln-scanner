from __future__ import annotations

import hashlib
import ipaddress
import re
import secrets
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
_HTTP_METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH"})
_DNS_RECORDS = frozenset({"A", "AAAA", "CNAME", "MX", "TXT"})
_BLOCKED_HEADER_NAMES = frozenset({"host", "content-length", "transfer-encoding", "connection"})
MAX_HEADER_COUNT = 16
MAX_HEADER_VALUE = 1024
MAX_BODY_BYTES = 8 * 1024
HEARTBEAT_PLACEHOLDER = "heartbeat://pending"


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


def normalize_dns_target(raw: str) -> str:
    value = raw.strip().rstrip(".").lower()
    if not value or not _HOST_RE.match(value):
        raise ValueError("DNS target must be a hostname")
    assert_public_host(value)
    return value


def normalize_ping_target(raw: str) -> str:
    value = raw.strip().lower()
    if not value or not _HOST_RE.match(value):
        raise ValueError("ping target must be a hostname or IP")
    assert_public_host(value)
    return value


def hash_heartbeat_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def mint_heartbeat_token() -> tuple[str, str, str]:
    token = secrets.token_urlsafe(32)
    prefix = token[:8]
    return token, hash_heartbeat_token(token), prefix


def sanitize_headers(raw: dict[str, str] | None) -> dict[str, str] | None:
    if not raw:
        return None
    if len(raw) > MAX_HEADER_COUNT:
        raise ValueError("too many request headers")
    out: dict[str, str] = {}
    for key, value in raw.items():
        name = key.strip()
        if not name or name.lower() in _BLOCKED_HEADER_NAMES:
            raise ValueError("header name is not allowed")
        if len(value) > MAX_HEADER_VALUE:
            raise ValueError("header value too long")
        out[name] = value
    return out


class UptimeMonitorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    check_type: str = Field(..., pattern=r"^(http|tcp|heartbeat|dns|ping)$")
    target: str = Field(default="", max_length=2048)
    interval_seconds: int = Field(default=DEFAULT_INTERVAL_SECONDS, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS)
    timeout_seconds: int = Field(default=DEFAULT_TIMEOUT_SECONDS, ge=1, le=MAX_TIMEOUT_SECONDS)
    expect_status: int | None = Field(default=None, ge=100, le=599)
    keyword: str | None = Field(default=None, max_length=512)
    keyword_invert: bool = False
    http_method: str = Field(default="GET")
    request_headers: dict[str, str] | None = None
    request_body: str | None = Field(default=None, max_length=MAX_BODY_BYTES)
    dns_record: str | None = None
    expected_values: list[str] | None = None
    notify_email: str | None = Field(default=None, max_length=255)
    asset_id: uuid.UUID | None = None
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("http_method")
    @classmethod
    def upper_method(cls, v: str) -> str:
        method = v.strip().upper()
        if method not in _HTTP_METHODS:
            raise ValueError("unsupported HTTP method")
        return method

    @model_validator(mode="after")
    def normalize_target(self) -> UptimeMonitorCreate:
        if self.check_type != "http" and (
            self.expect_status is not None
            or self.keyword
            or self.request_headers
            or self.request_body
            or (self.http_method and self.http_method != "GET")
        ):
            raise ValueError("HTTP options apply to HTTP only")
        if self.check_type == "http":
            if not self.target.strip():
                raise ValueError("HTTP target is required")
            self.target = normalize_http_target(self.target)
            self.request_headers = sanitize_headers(self.request_headers)
            if self.http_method in ("GET", "HEAD") and self.request_body:
                raise ValueError("request body is not allowed for GET/HEAD")
        elif self.check_type == "tcp":
            self.target = normalize_tcp_target(self.target)
        elif self.check_type == "dns":
            self.target = normalize_dns_target(self.target)
            rec = (self.dns_record or "A").upper()
            if rec not in _DNS_RECORDS:
                raise ValueError("unsupported DNS record type")
            self.dns_record = rec
        elif self.check_type == "ping":
            self.target = normalize_ping_target(self.target)
        else:
            self.target = HEARTBEAT_PLACEHOLDER
        return self


class UptimeMonitorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    interval_seconds: int | None = Field(default=None, ge=MIN_INTERVAL_SECONDS, le=MAX_INTERVAL_SECONDS)
    timeout_seconds: int | None = Field(default=None, ge=1, le=MAX_TIMEOUT_SECONDS)
    expect_status: int | None = Field(default=None, ge=100, le=599)
    keyword: str | None = Field(default=None, max_length=512)
    keyword_invert: bool | None = None
    http_method: str | None = None
    request_headers: dict[str, str] | None = None
    request_body: str | None = Field(default=None, max_length=MAX_BODY_BYTES)
    dns_record: str | None = None
    expected_values: list[str] | None = None
    notify_email: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else v

    @field_validator("http_method")
    @classmethod
    def upper_method(cls, v: str | None) -> str | None:
        if v is None:
            return v
        method = v.strip().upper()
        if method not in _HTTP_METHODS:
            raise ValueError("unsupported HTTP method")
        return method

    @field_validator("request_headers")
    @classmethod
    def headers_ok(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return sanitize_headers(v)


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
    http_method: str = "GET"
    request_headers: dict[str, str] | None = None
    request_body: str | None = None
    heartbeat_token_prefix: str | None = None
    last_heartbeat_at: datetime | None = None
    dns_record: str | None = None
    expected_values: list[str] | None = None
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
    heartbeat_url: str | None = None
    heartbeat_token: str | None = None


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
