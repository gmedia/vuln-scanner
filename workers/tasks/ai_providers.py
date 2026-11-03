"""Probe enabled AI upstream providers on a beat schedule.

Writes ``ai_providers.status`` and ``ai_providers.last_probed_at`` for every provider
it probes: 2xx is ``ok``, auth failures / 5xx / transport errors are ``degraded``, and
any other 4xx stays unverified so a vendor without ``/models`` is never punished.
``disabled`` is a human decision that this task never writes.

The circuit breaker belongs to traffic alone. This task used to record a breaker
success on every 2xx, which deleted the open key every five minutes and left the
breaker unable to contain a provider whose ``/models`` answers while
``/chat/completions`` fails.
"""

import os
import sys
from datetime import UTC, datetime
from typing import Any

import httpx
from celery import shared_task
from loguru import logger
from sqlalchemy import select

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.config import settings  # noqa: E402
from app.models.ai_gateway import AiProvider  # noqa: E402
from app.services.ai_crypto import decrypt_credential  # noqa: E402


def _probe_headers(provider: AiProvider) -> dict[str, str]:
    credential = decrypt_credential(provider.credential_enc)
    header_name = provider.auth_header or "Authorization"
    if header_name.lower() == "authorization" and not credential.lower().startswith("bearer "):
        credential = f"Bearer {credential}"
    return {header_name: credential}


@shared_task(name="ai_providers.probe")  # type: ignore[misc]
def probe_ai_providers() -> dict[str, Any]:
    if not settings.ai_gateway_enabled:
        return {"skipped": "ai_gateway_disabled"}
    if not settings.ai_provider_probe_enabled:
        return {"skipped": "probe_disabled"}

    counts = {"probed": 0, "ok": 0, "degraded": 0, "unverified": 0, "errors": 0}
    session = get_sync_session()
    client: httpx.Client | None = None
    try:
        client = httpx.Client(timeout=settings.ai_provider_probe_timeout_seconds)
        providers: list[AiProvider] = list(
            session.execute(
                select(AiProvider).where(
                    AiProvider.enabled.is_(True),
                    AiProvider.status != "disabled",
                )
            )
            .scalars()
            .all()
        )
        for provider in providers:
            counts["probed"] += 1
            provider.last_probed_at = datetime.now(UTC)
            try:
                response = client.get(
                    provider.base_url.rstrip("/") + "/models",
                    headers=_probe_headers(provider),
                )
                code = response.status_code
                if 200 <= code < 300:
                    provider.status = "ok"
                    counts["ok"] += 1
                elif code in (401, 403) or code >= 500:
                    provider.status = "degraded"
                    counts["degraded"] += 1
                else:
                    counts["unverified"] += 1
            except httpx.HTTPError:
                provider.status = "degraded"
                counts["degraded"] += 1
            except Exception as exc:
                logger.warning("ai provider probe failed for {}: {}", provider.name, exc)
                counts["errors"] += 1
        session.commit()
        return counts
    except Exception as exc:
        session.rollback()
        logger.warning("ai provider probe failed: {}", exc)
        counts["errors"] += 1
        return counts
    finally:
        if client is not None:
            client.close()
        session.close()
