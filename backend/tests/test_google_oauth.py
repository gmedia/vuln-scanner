from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.config import settings
from app.services.google_oauth import verify_google_id_token


@pytest.mark.asyncio
async def test_verify_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    with pytest.raises(HTTPException) as exc:
        await verify_google_id_token("token-value-long-enough")
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_verify_success(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "aud": "cid.apps.googleusercontent.com",
        "iss": "accounts.google.com",
        "email": "User@Example.com",
        "sub": "sub-1",
        "email_verified": "true",
    }

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False

    with patch("app.services.google_oauth.httpx.AsyncClient", return_value=mock_client):
        claims = await verify_google_id_token("id-token-value-xxxxx")
    assert claims == {"sub": "sub-1", "email": "user@example.com"}


@pytest.mark.asyncio
async def test_verify_unverified_email(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "aud": "cid.apps.googleusercontent.com",
        "iss": "https://accounts.google.com",
        "email": "u@example.com",
        "sub": "sub-1",
        "email_verified": False,
    }
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    with (
        patch("app.services.google_oauth.httpx.AsyncClient", return_value=mock_client),
        pytest.raises(HTTPException) as exc,
    ):
        await verify_google_id_token("id-token-value-xxxxx")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_http_error(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid.apps.googleusercontent.com")
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=httpx.ConnectError("fail"))
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    with (
        patch("app.services.google_oauth.httpx.AsyncClient", return_value=mock_client),
        pytest.raises(HTTPException) as exc,
    ):
        await verify_google_id_token("id-token-value-xxxxx")
    assert exc.value.status_code == 502
