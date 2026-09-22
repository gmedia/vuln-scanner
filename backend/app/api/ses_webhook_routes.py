"""Inbox S2 (bounce/SES) — public SNS webhook. No JWT; SNS signs the payload."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.services.ses_webhook import ingest_notification, verify_sns_signature
from app.utils.log_sanitizer import sanitize_for_log

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ses-webhook"])

ses_webhook_limiter = RateLimiter(
    max_requests=settings.jwt_rate_limit,
    window_seconds=settings.jwt_rate_limit_window,
    prefix="ratelimit:ses-webhook",
)


@router.post("/webhooks/ses", response_model=None)
async def ses_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    limit_response = await ses_webhook_limiter(request)
    if limit_response:
        return limit_response
    configured_token = (settings.ses_webhook_token or "").strip()
    if configured_token:
        query_token = request.query_params.get("token", "")
        if query_token != configured_token:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    try:
        envelope: Any = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    if not isinstance(envelope, dict):
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    msg_type = envelope.get("Type")
    if not isinstance(msg_type, str):
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    topic_arn = envelope.get("TopicArn")
    expected_topic = (settings.sns_topic_arn or "").strip()
    if not expected_topic or topic_arn != expected_topic:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    if msg_type == "SubscriptionConfirmation":
        subscribe_url = envelope.get("SubscribeURL")
        if not isinstance(subscribe_url, str) or not subscribe_url.startswith("https://"):
            return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
        try:
            resp = httpx.get(subscribe_url, timeout=10)
            resp.raise_for_status()
        except Exception:
            logger.warning("SNS subscribe confirmation fetch failed")
        return JSONResponse(status_code=200, content={"ok": True})
    if msg_type == "UnsubscribeConfirmation":
        return JSONResponse(status_code=200, content={"ok": True, "ignored": True})
    if msg_type != "Notification":
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    if not verify_sns_signature(dict(envelope)):
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    raw_message = envelope.get("Message")
    if not isinstance(raw_message, str):
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    try:
        inner: Any = json.loads(raw_message)
    except (json.JSONDecodeError, ValueError):
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    if not isinstance(inner, dict):
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    sns_message_id = envelope.get("MessageId")
    if not isinstance(sns_message_id, str) or not sns_message_id:
        return JSONResponse(status_code=400, content={"detail": "Invalid SNS envelope"})
    result = await ingest_notification(inner, sns_message_id, db)
    logger.debug(
        "SNS notification ingested sns_message_id=%s kind=%s matched=%s duplicate=%s",
        sanitize_for_log(sns_message_id),
        sanitize_for_log(str(result.get("kind", ""))),
        result.get("matched"),
        result.get("duplicate"),
    )
    return JSONResponse(
        status_code=202,
        content={"ok": True, "duplicate": bool(result.get("duplicate", False))},
    )
