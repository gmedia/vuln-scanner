from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.api import admin_ai_fx_routes
from app.config import settings
from app.services import ai_fx

API_HEADERS = {"X-API-Key": settings.api_key, "X-E2E-Test": "1"}
BASE = "/api/admin/ai/fx"


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


def test_fx_routes_404_when_gateway_disabled(client) -> None:
    assert client.get(BASE, headers=API_HEADERS).status_code == 404
    assert client.post(f"{BASE}/refresh", headers=API_HEADERS).status_code == 404
    assert client.put(f"{BASE}/manual", headers=API_HEADERS, json={"rate": 16500}).status_code == 404


def test_get_fx_status_uses_env_fallback_when_no_stored_rate(client, ai_on) -> None:
    response = client.get(BASE, headers=API_HEADERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["using_env_fallback"] is True
    assert body["rate"] == settings.ai_usd_idr
    assert body["source"] == "env"
    assert body["effective_date"] is None
    assert body["fetched_at"] is None
    assert body["env_rate"] == settings.ai_usd_idr
    assert body["history"] == []
    assert body["auto_fetch_enabled"] == settings.ai_fx_auto_fetch


def test_put_manual_stores_rate_and_get_reports_it(client, ai_on) -> None:
    stored = client.put(f"{BASE}/manual", headers=API_HEADERS, json={"rate": 16500})

    assert stored.status_code == 200, stored.text
    body = stored.json()
    assert body["source"] == "manual"
    assert body["rate"] == 16500
    assert body["base"] == "USD"
    assert body["quote"] == "IDR"

    status = client.get(BASE, headers=API_HEADERS)
    assert status.status_code == 200, status.text
    data = status.json()
    assert data["using_env_fallback"] is False
    assert data["source"] == "manual"
    assert data["rate"] == 16500
    assert len(data["history"]) == 1
    assert data["history"][0]["rate"] == 16500
    assert data["history"][0]["source"] == "manual"
    assert data["history"][0]["effective_date"] is not None


@pytest.mark.parametrize("rate", [0, -1])
def test_put_manual_rejects_non_positive_rate(client, ai_on, rate: int) -> None:
    response = client.put(f"{BASE}/manual", headers=API_HEADERS, json={"rate": rate})

    assert response.status_code == 422


def test_refresh_returns_502_without_leaking_upstream_message(client, ai_on, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        admin_ai_fx_routes.ai_fx,
        "fetch_rate",
        AsyncMock(side_effect=ai_fx.FxFetchError("boom")),
    )

    response = client.post(f"{BASE}/refresh", headers=API_HEADERS)

    assert response.status_code == 502, response.text
    assert response.json()["detail"] == "FX source unavailable"
    assert "boom" not in response.text


def test_refresh_stores_fetched_rate_and_get_reports_it(client, ai_on, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_fx_source_url", "https://fx.example.test/latest?from=USD&to=IDR")
    monkeypatch.setattr(
        admin_ai_fx_routes.ai_fx,
        "fetch_rate",
        AsyncMock(return_value=(Decimal("16350.25"), date(2026, 10, 30))),
    )

    response = client.post(f"{BASE}/refresh", headers=API_HEADERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rate"] == 16350.25
    assert body["source"] == "fx.example.test"
    assert body["effective_date"] == "2026-10-30"

    data = client.get(BASE, headers=API_HEADERS).json()
    assert data["using_env_fallback"] is False
    assert data["rate"] == 16350.25
    assert data["source"] == "fx.example.test"
    assert data["effective_date"] == "2026-10-30"
    assert len(data["history"]) == 1
