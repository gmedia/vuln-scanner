from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_CF_API = "https://api.cloudflare.com/client/v4"
_TIMEOUT = httpx.Timeout(20.0, connect=8.0)


class CloudflareHostnameError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class CfHostname:
    id: str
    hostname: str
    status: str
    ssl_status: str | None
    txt_name: str | None
    txt_value: str | None


def cf_configured() -> bool:
    return bool(settings.status_page_cf_api_token.strip() and settings.status_page_cf_zone_id.strip())


def map_hostname_status(ssl_status: str | None, hostname_status: str | None) -> str:
    ssl = (ssl_status or "").lower()
    host = (hostname_status or "").lower()
    if ssl in {"expired", "deleted"} or host in {"deleted", "moved", "blocked"}:
        return "failed"
    if "error" in ssl or "timed_out" in ssl:
        return "failed"
    if ssl == "active":
        return "active"
    return "pending_txt"


def _txt_from_result(result: dict[str, Any]) -> tuple[str | None, str | None]:
    own = result.get("ownership_verification")
    if isinstance(own, dict):
        name = own.get("name")
        value = own.get("value")
        if isinstance(name, str) and isinstance(value, str) and name and value:
            return name, value
    ssl = result.get("ssl")
    if isinstance(ssl, dict):
        records = ssl.get("validation_records")
        if isinstance(records, list):
            for rec in records:
                if not isinstance(rec, dict):
                    continue
                name = rec.get("txt_name") or rec.get("name")
                value = rec.get("txt_value") or rec.get("value")
                if isinstance(name, str) and isinstance(value, str) and name and value:
                    return name, value
    return None, None


def _parse(result: dict[str, Any]) -> CfHostname:
    ssl = result.get("ssl") if isinstance(result.get("ssl"), dict) else {}
    ssl_status = ssl.get("status") if isinstance(ssl, dict) else None
    txt_name, txt_value = _txt_from_result(result)
    hid = result.get("id")
    host = result.get("hostname")
    if not isinstance(hid, str) or not hid:
        raise CloudflareHostnameError("Cloudflare response missing id")
    if not isinstance(host, str) or not host:
        raise CloudflareHostnameError("Cloudflare response missing hostname")
    return CfHostname(
        id=hid,
        hostname=host.lower().rstrip("."),
        status=str(result.get("status") or ""),
        ssl_status=str(ssl_status) if ssl_status else None,
        txt_name=txt_name,
        txt_value=txt_value,
    )


class CloudflareCustomHostnames:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._own_client = client is None
        self._client = client or httpx.AsyncClient(timeout=_TIMEOUT)

    async def aclose(self) -> None:
        if self._own_client:
            await self._client.aclose()

    def _headers(self) -> dict[str, str]:
        token = settings.status_page_cf_api_token.strip()
        if not token:
            raise CloudflareHostnameError("Cloudflare API token not configured")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def _zone(self) -> str:
        zone = settings.status_page_cf_zone_id.strip()
        if not zone:
            raise CloudflareHostnameError("Cloudflare zone id not configured")
        return zone

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{_CF_API}{path}"
        try:
            resp = await self._client.request(method, url, headers=self._headers(), **kwargs)
        except httpx.HTTPError as exc:
            logger.warning("cloudflare custom hostname request failed")
            raise CloudflareHostnameError("Cloudflare request failed") from exc
        try:
            payload = resp.json()
        except ValueError as exc:
            raise CloudflareHostnameError("Cloudflare returned non-JSON", status_code=resp.status_code) from exc
        if not isinstance(payload, dict):
            raise CloudflareHostnameError("Cloudflare returned unexpected payload", status_code=resp.status_code)
        if resp.status_code >= 400 or payload.get("success") is False:
            errors = payload.get("errors")
            msg = "Cloudflare custom hostname error"
            if isinstance(errors, list) and errors:
                first = errors[0]
                if isinstance(first, dict) and isinstance(first.get("message"), str):
                    msg = first["message"]
            logger.warning("cloudflare custom hostname http %s", resp.status_code)
            raise CloudflareHostnameError(msg, status_code=resp.status_code)
        result = payload.get("result")
        if result is None:
            raise CloudflareHostnameError("Cloudflare response missing result")
        if not isinstance(result, dict) and not isinstance(result, list):
            raise CloudflareHostnameError("Cloudflare result type unexpected")
        return payload

    async def create(self, hostname: str) -> CfHostname:
        payload = await self._request(
            "POST",
            f"/zones/{self._zone()}/custom_hostnames",
            json={"hostname": hostname, "ssl": {"method": "txt", "type": "dv"}},
        )
        result = payload["result"]
        if not isinstance(result, dict):
            raise CloudflareHostnameError("Cloudflare create result unexpected")
        return _parse(result)

    async def get(self, custom_hostname_id: str) -> CfHostname:
        payload = await self._request(
            "GET",
            f"/zones/{self._zone()}/custom_hostnames/{custom_hostname_id}",
        )
        result = payload["result"]
        if not isinstance(result, dict):
            raise CloudflareHostnameError("Cloudflare get result unexpected")
        return _parse(result)

    async def find_by_hostname(self, hostname: str) -> CfHostname | None:
        payload = await self._request(
            "GET",
            f"/zones/{self._zone()}/custom_hostnames",
            params={"hostname": hostname},
        )
        result = payload["result"]
        if not isinstance(result, list) or not result:
            return None
        first = result[0]
        if not isinstance(first, dict):
            return None
        return _parse(first)

    async def ensure(self, hostname: str) -> CfHostname:
        try:
            return await self.create(hostname)
        except CloudflareHostnameError as exc:
            if exc.status_code not in {409, 400}:
                raise
            existing = await self.find_by_hostname(hostname)
            if existing is None:
                raise
            return existing

    async def delete(self, custom_hostname_id: str) -> None:
        try:
            await self._request(
                "DELETE",
                f"/zones/{self._zone()}/custom_hostnames/{custom_hostname_id}",
            )
        except CloudflareHostnameError as exc:
            if exc.status_code == 404:
                return
            raise
