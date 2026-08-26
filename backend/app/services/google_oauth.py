from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings

_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"


async def verify_google_id_token(id_token: str) -> dict[str, Any]:
    client_id = settings.google_client_id.strip()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_TOKENINFO, params={"id_token": id_token})
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not verify Google token",
        ) from exc
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )
    payload = resp.json()
    aud = payload.get("aud")
    if aud != client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token audience",
        )
    iss = str(payload.get("iss") or "")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token issuer",
        )
    email = str(payload.get("email") or "").strip().lower()
    sub = str(payload.get("sub") or "").strip()
    verified = payload.get("email_verified")
    email_verified = verified in (True, "true", "1")
    if not email or not sub or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )
    return {"sub": sub, "email": email}
