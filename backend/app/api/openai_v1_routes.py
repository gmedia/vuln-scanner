from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.ai_gateway import AiApiKey
from app.services.ai_keys import authenticate_customer_key
from app.services.ai_proxy import chat_completions, list_openai_models, openai_error

router = APIRouter(prefix="/v1", tags=["openai-v1"])


def _require_gateway() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


async def _customer_key(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_gateway),
) -> AiApiKey:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return await authenticate_customer_key(db, auth[7:].strip())


@router.get("/models")
async def v1_models(
    db: AsyncSession = Depends(get_db),
    key: AiApiKey = Depends(_customer_key),
) -> Any:
    return await list_openai_models(db, key)


@router.post("/chat/completions")
async def v1_chat(
    request: Request,
    db: AsyncSession = Depends(get_db),
    key: AiApiKey = Depends(_customer_key),
) -> Any:
    try:
        body = await request.json()
    except Exception:
        return openai_error(400, "Invalid JSON", err_type="invalid_request_error")
    if not isinstance(body, dict):
        return openai_error(400, "Invalid JSON", err_type="invalid_request_error")
    try:
        return await chat_completions(db, key=key, body=body)
    except HTTPException as exc:
        if exc.status_code == 402:
            return openai_error(402, str(exc.detail), err_type="insufficient_quota", code="insufficient_quota")
        if exc.status_code == 404:
            return openai_error(
                404, "The model does not exist", err_type="invalid_request_error", code="model_not_found"
            )
        if exc.status_code == 401:
            return openai_error(401, "Invalid API key", err_type="invalid_request_error", code="invalid_api_key")
        return openai_error(exc.status_code, str(exc.detail), err_type="invalid_request_error")
