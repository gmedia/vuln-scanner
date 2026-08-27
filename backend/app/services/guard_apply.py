"""Guard inventory/alert sync used by API and Celery workers (no FastAPI import)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent, GuardAlert, GuardOrgBinding
from app.services.wazuh_client import WazuhClient, get_wazuh_client

_AGENT_STATUSES = frozenset({"active", "disconnected", "pending", "never_connected", "unknown"})


def sanitize_sync_error(exc: BaseException) -> str:
    msg = str(exc)[:400]
    for secret in (
        settings.wazuh_manager_password,
        settings.wazuh_indexer_password,
        settings.wazuh_manager_user,
        settings.wazuh_indexer_user,
    ):
        if secret and secret in msg:
            msg = msg.replace(secret, "[redacted]")
    return msg


async def get_binding(db: AsyncSession, organization_id: UUID) -> GuardOrgBinding | None:
    result = await db.execute(select(GuardOrgBinding).where(GuardOrgBinding.organization_id == organization_id))
    return result.scalar_one_or_none()


async def sync_org(
    db: AsyncSession,
    organization_id: UUID,
    *,
    client: WazuhClient | None = None,
) -> dict[str, object]:
    wazuh = client or get_wazuh_client()
    binding = await get_binding(db, organization_id)
    if binding is None or not binding.enabled:
        return {"ok": False, "reason": "not_enabled"}
    now = datetime.now(UTC)
    try:
        agents = await wazuh.list_agents(binding.wazuh_group)
        for info in agents:
            existing = await db.execute(
                select(GuardAgent).where(
                    GuardAgent.organization_id == organization_id,
                    GuardAgent.wazuh_agent_id == info.agent_id,
                )
            )
            row = existing.scalar_one_or_none()
            status_val = info.status if info.status in _AGENT_STATUSES else "unknown"
            if row is None:
                db.add(
                    GuardAgent(
                        id=uuid.uuid4(),
                        organization_id=organization_id,
                        wazuh_agent_id=info.agent_id,
                        name=info.name,
                        status=status_val,
                        ip=info.ip,
                        version=info.version,
                        last_keep_alive=info.last_keep_alive,
                        synced_at=now,
                    )
                )
            else:
                row.name = info.name
                row.status = status_val
                row.ip = info.ip
                row.version = info.version
                row.last_keep_alive = info.last_keep_alive
                row.synced_at = now
                row.updated_at = now
        binding.last_inventory_sync_at = now

        alerts = await wazuh.search_alerts(
            group_name=binding.wazuh_group,
            min_level=settings.guard_alert_min_level,
            since=binding.last_alert_sync_at,
            limit=200,
        )
        for a in alerts:
            existing_a = await db.execute(
                select(GuardAlert).where(
                    GuardAlert.organization_id == organization_id,
                    GuardAlert.external_id == a.external_id,
                )
            )
            if existing_a.scalar_one_or_none() is not None:
                continue
            db.add(
                GuardAlert(
                    id=uuid.uuid4(),
                    organization_id=organization_id,
                    external_id=a.external_id,
                    rule_id=a.rule_id,
                    rule_level=a.rule_level,
                    rule_description=(a.rule_description or "")[:512],
                    agent_wazuh_id=a.agent_wazuh_id,
                    agent_name=a.agent_name,
                    occurred_at=a.occurred_at,
                    synced_at=now,
                )
            )
        binding.last_alert_sync_at = now
        binding.last_sync_error = None
        binding.updated_at = now
        await db.commit()
        return {"ok": True, "agents": len(agents), "alerts": len(alerts)}
    except Exception as exc:
        binding.last_sync_error = sanitize_sync_error(exc)
        binding.updated_at = now
        await db.commit()
        return {"ok": False, "error": binding.last_sync_error}


async def sync_all_enabled(db: AsyncSession, *, client: WazuhClient | None = None) -> dict[str, Any]:
    result = await db.execute(select(GuardOrgBinding).where(GuardOrgBinding.enabled.is_(True)))
    bindings = list(result.scalars().all())
    ok = 0
    failed = 0
    for b in bindings:
        out = await sync_org(db, b.organization_id, client=client)
        if out.get("ok"):
            ok += 1
        else:
            failed += 1
    return {"ok": ok, "failed": failed, "total": len(bindings)}
