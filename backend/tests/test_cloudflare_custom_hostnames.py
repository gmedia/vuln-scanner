from __future__ import annotations

import httpx
import pytest

from app.services.cloudflare_custom_hostnames import (
    CloudflareCustomHostnames,
    CloudflareHostnameError,
    map_hostname_status,
)


def test_map_hostname_status() -> None:
    assert map_hostname_status("active", "pending") == "active"
    assert map_hostname_status("pending_validation", "pending") == "pending_txt"
    assert map_hostname_status("pending_validation", "active") == "pending_txt"
    assert map_hostname_status("expired", "active") == "failed"
    assert map_hostname_status("validation_timed_out", "blocked") == "failed"


@pytest.mark.asyncio
async def test_create_parses_txt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_api_token", "tok")
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_zone_id", "zone1")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert "custom_hostnames" in str(request.url)
        return httpx.Response(
            200,
            json={
                "success": True,
                "result": {
                    "id": "cf-abc",
                    "hostname": "status.example.com",
                    "status": "pending",
                    "ownership_verification": {
                        "type": "txt",
                        "name": "_cf-custom-hostname.status.example.com",
                        "value": "uuid-token",
                    },
                    "ssl": {"status": "pending_validation", "method": "txt"},
                },
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as raw:
        client = CloudflareCustomHostnames(client=raw)
        cf = await client.create("status.example.com")
    assert cf.id == "cf-abc"
    assert cf.txt_name == "_cf-custom-hostname.status.example.com"
    assert cf.txt_value == "uuid-token"
    assert cf.ssl_status == "pending_validation"


@pytest.mark.asyncio
async def test_delete_404_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_api_token", "tok")
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_zone_id", "zone1")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"success": False, "errors": [{"message": "not found"}]})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as raw:
        client = CloudflareCustomHostnames(client=raw)
        await client.delete("missing")


@pytest.mark.asyncio
async def test_create_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_api_token", "tok")
    monkeypatch.setattr("app.services.cloudflare_custom_hostnames.settings.status_page_cf_zone_id", "zone1")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"success": False, "errors": [{"message": "bad hostname"}]})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as raw:
        client = CloudflareCustomHostnames(client=raw)
        with pytest.raises(CloudflareHostnameError, match="bad hostname"):
            await client.create("status.example.com")
