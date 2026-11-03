from __future__ import annotations

from app.config import settings
from app.models.ai_gateway import AiModel, AiProvider


def provider_usable(provider: AiProvider) -> bool:
    return provider.enabled and provider.status != "disabled"


def has_usable_candidate(model: AiModel) -> bool:
    # With failover off, routing only tries the primary, so a fallback cannot make the model callable.
    if provider_usable(model.provider):
        return True
    if not settings.ai_upstream_failover_enabled:
        return False
    return any(row.enabled and provider_usable(row.provider) for row in model.upstreams)
