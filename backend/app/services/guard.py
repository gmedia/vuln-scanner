from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import (
    GuardAgent,
    GuardAlert,
    GuardEnrollToken,
    GuardOrgBinding,
    wazuh_group_for_org,
)
from app.models.user import User
from app.services.organization import require_membership
from app.services.wazuh_client import WazuhClient, get_wazuh_client

_AGENT_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,62}$")


def hash_enroll_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_enroll_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_enroll_token(raw)


def _sanitize_sync_error(exc: BaseException) -> str:
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


class GuardService:
    def __init__(self, db: AsyncSession, client: WazuhClient | None = None):
        self.db = db
        self.client = client or get_wazuh_client()

    def _require_feature(self) -> None:
        if not settings.guard_enabled:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Guard is disabled")

    async def _require_org(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        min_role: str = "viewer",
    ) -> UUID:
        if organization_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active organization required")
        await require_membership(self.db, organization_id, user.id, min_role=min_role)
        return organization_id

    async def get_binding(self, organization_id: UUID) -> GuardOrgBinding | None:
        result = await self.db.execute(
            select(GuardOrgBinding).where(GuardOrgBinding.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def status(self, user: User, organization_id: UUID | None) -> dict[str, object]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        binding = await self.get_binding(org_id)
        if binding is None:
            return {
                "enabled": False,
                "wazuh_group": None,
                "last_inventory_sync_at": None,
                "last_alert_sync_at": None,
                "last_sync_error": None,
                "degraded": False,
            }
        return {
            "enabled": binding.enabled,
            "wazuh_group": binding.wazuh_group,
            "last_inventory_sync_at": binding.last_inventory_sync_at,
            "last_alert_sync_at": binding.last_alert_sync_at,
            "last_sync_error": binding.last_sync_error,
            "degraded": bool(binding.last_sync_error),
        }

    async def enable(self, user: User, organization_id: UUID | None) -> GuardOrgBinding:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        binding = await self.get_binding(org_id)
        group = wazuh_group_for_org(org_id)
        try:
            await self.client.ensure_group(group)
            sync_error = None
        except Exception as exc:
            sync_error = _sanitize_sync_error(exc)
        if binding is None:
            binding = GuardOrgBinding(
                id=uuid.uuid4(),
                organization_id=org_id,
                wazuh_group=group,
                enabled=True,
                last_sync_error=sync_error,
            )
            self.db.add(binding)
        else:
            binding.enabled = True
            binding.wazuh_group = group
            binding.last_sync_error = sync_error
            binding.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(binding)
        return binding

    async def list_agents(self, user: User, organization_id: UUID | None) -> list[GuardAgent]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        result = await self.db.execute(
            select(GuardAgent).where(GuardAgent.organization_id == org_id).order_by(GuardAgent.name.asc())
        )
        return list(result.scalars().all())

    async def list_alerts(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        limit: int = 50,
    ) -> list[GuardAlert]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        capped = max(1, min(limit, 100))
        result = await self.db.execute(
            select(GuardAlert)
            .where(GuardAlert.organization_id == org_id)
            .order_by(GuardAlert.occurred_at.desc())
            .limit(capped)
        )
        return list(result.scalars().all())

    async def create_enroll_token(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        label: str | None = None,
    ) -> tuple[GuardEnrollToken, str]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        binding = await self.get_binding(org_id)
        if binding is None or not binding.enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enable Guard before creating enroll tokens",
            )
        raw, token_hash = generate_enroll_token()
        row = GuardEnrollToken(
            id=uuid.uuid4(),
            organization_id=org_id,
            token_hash=token_hash,
            label=(label or None),
            created_by_user_id=user.id,
            expires_at=datetime.now(UTC) + timedelta(hours=settings.guard_enroll_token_ttl_hours),
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row, raw

    async def list_enroll_tokens(self, user: User, organization_id: UUID | None) -> list[GuardEnrollToken]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        result = await self.db.execute(
            select(GuardEnrollToken)
            .where(GuardEnrollToken.organization_id == org_id)
            .order_by(GuardEnrollToken.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke_enroll_token(
        self,
        user: User,
        organization_id: UUID | None,
        token_id: UUID,
    ) -> None:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        result = await self.db.execute(
            select(GuardEnrollToken).where(
                GuardEnrollToken.id == token_id,
                GuardEnrollToken.organization_id == org_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enroll token not found")
        row.revoked_at = datetime.now(UTC)
        await self.db.commit()

    async def redeem_enroll(self, *, token: str, agent_name: str) -> dict[str, str]:
        self._require_feature()
        name = (agent_name or "").strip()
        if not _AGENT_NAME_RE.match(name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="agent_name must be 1-63 chars alphanumeric, dot, underscore, or hyphen",
            )
        token_hash = hash_enroll_token(token.strip())
        result = await self.db.execute(select(GuardEnrollToken).where(GuardEnrollToken.token_hash == token_hash))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid enroll token")
        now = datetime.now(UTC)
        if row.revoked_at is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Enroll token revoked")
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if exp < now:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Enroll token expired")

        binding = await self.get_binding(row.organization_id)
        if binding is None or not binding.enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Guard is not enabled for this organization",
            )

        try:
            enroll = await self.client.enroll_agent(name=name, group_name=binding.wazuh_group)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Enroll proxy failed: {_sanitize_sync_error(exc)}",
            ) from exc

        row.used_at = now
        agent = GuardAgent(
            id=uuid.uuid4(),
            organization_id=row.organization_id,
            wazuh_agent_id=enroll.agent_id,
            name=enroll.name,
            status="pending",
            synced_at=now,
        )
        self.db.add(agent)
        await self.db.commit()

        frontend = (settings.frontend_url or "").rstrip("/")
        install_hint = (
            f"# Register via SaaS then point agent at manager\n"
            f"# manager={enroll.manager_host} agent_id={enroll.agent_id}\n"
            f"# keep key secret; do not paste into public tickets"
        )
        return {
            "agent_id": enroll.agent_id,
            "agent_name": enroll.name,
            "agent_key": enroll.key,
            "manager_host": enroll.manager_host,
            "install_hint": install_hint,
            "organization_id": str(row.organization_id),
            "saas_base": frontend,
        }

    async def sync_org(self, organization_id: UUID) -> dict[str, object]:
        binding = await self.get_binding(organization_id)
        if binding is None or not binding.enabled:
            return {"ok": False, "reason": "not_enabled"}
        now = datetime.now(UTC)
        try:
            agents = await self.client.list_agents(binding.wazuh_group)
            for info in agents:
                existing = await self.db.execute(
                    select(GuardAgent).where(
                        GuardAgent.organization_id == organization_id,
                        GuardAgent.wazuh_agent_id == info.agent_id,
                    )
                )
                row = existing.scalar_one_or_none()
                status_val = (
                    info.status
                    if info.status
                    in (
                        "active",
                        "disconnected",
                        "pending",
                        "never_connected",
                        "unknown",
                    )
                    else "unknown"
                )
                if row is None:
                    self.db.add(
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

            alerts = await self.client.search_alerts(
                group_name=binding.wazuh_group,
                min_level=settings.guard_alert_min_level,
                since=binding.last_alert_sync_at,
                limit=200,
            )
            for a in alerts:
                existing_a = await self.db.execute(
                    select(GuardAlert).where(
                        GuardAlert.organization_id == organization_id,
                        GuardAlert.external_id == a.external_id,
                    )
                )
                if existing_a.scalar_one_or_none() is not None:
                    continue
                self.db.add(
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
            await self.db.commit()
            return {"ok": True, "agents": len(agents), "alerts": len(alerts)}
        except Exception as exc:
            binding.last_sync_error = _sanitize_sync_error(exc)
            binding.updated_at = now
            await self.db.commit()
            return {"ok": False, "error": binding.last_sync_error}

    async def sync_for_user(self, user: User, organization_id: UUID | None) -> dict[str, object]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        return await self.sync_org(org_id)

    async def sync_all_enabled(self) -> dict[str, object]:
        result = await self.db.execute(select(GuardOrgBinding).where(GuardOrgBinding.enabled.is_(True)))
        bindings = list(result.scalars().all())
        ok = 0
        failed = 0
        for b in bindings:
            out = await self.sync_org(b.organization_id)
            if out.get("ok"):
                ok += 1
            else:
                failed += 1
        return {"ok": ok, "failed": failed, "total": len(bindings)}
