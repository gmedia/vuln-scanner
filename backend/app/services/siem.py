from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent, GuardOrgBinding, wazuh_group_for_org
from app.models.user import User
from app.services.organization import require_membership
from app.services.siem_query import SiemQueryError, search_org_events
from app.services.wazuh_client import WazuhClient, WazuhClientError, get_wazuh_client


def _sanitize_error(exc: BaseException) -> str:
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


class SiemService:
    def __init__(self, db: AsyncSession, client: WazuhClient | None = None):
        self.db = db
        self.client = client or get_wazuh_client()

    def _require_feature(self) -> None:
        if not settings.siem_enabled:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

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

    async def _agent_ids(self, org_id: UUID) -> list[str]:
        result = await self.db.execute(select(GuardAgent.wazuh_agent_id).where(GuardAgent.organization_id == org_id))
        return [str(row[0]) for row in result.all()]

    async def _group_name(self, org_id: UUID) -> str:
        result = await self.db.execute(
            select(GuardOrgBinding.wazuh_group).where(GuardOrgBinding.organization_id == org_id)
        )
        group = result.scalar_one_or_none()
        return group or wazuh_group_for_org(org_id)

    async def status(self, user: User, organization_id: UUID | None) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        group = await self._group_name(org_id)
        reachable = True
        last_error: str | None = None
        try:
            await self.client.ensure_group(group)
        except (WazuhClientError, OSError, TimeoutError) as exc:
            reachable = False
            last_error = _sanitize_error(exc)
        except Exception as exc:
            reachable = False
            last_error = _sanitize_error(exc)
        return {
            "enabled": True,
            "indexer_reachable": reachable,
            "degraded": not reachable,
            "last_error": last_error,
            "search_min_level": settings.siem_search_min_level,
            "max_lookback_hours": settings.siem_max_lookback_hours,
            "max_page_size": settings.siem_max_page_size,
            "include_full_log": False,
            "wazuh_group": group,
        }

    async def list_events(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
        min_level: int | None = None,
        max_level: int | None = None,
        agent_id: str | None = None,
        q: str | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        allowed = await self._agent_ids(org_id)
        if agent_id:
            allowed = [a for a in allowed if a == agent_id]
        group = await self._group_name(org_id)
        try:
            hits = await search_org_events(
                self.client,
                group_name=group,
                allowed_agent_ids=allowed,
                min_level=min_level,
                max_level=max_level,
                since=since,
                until=until,
                q=q,
                limit=limit,
            )
        except SiemQueryError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except (WazuhClientError, OSError, TimeoutError) as exc:
            return {"items": [], "degraded": True, "last_error": _sanitize_error(exc)}
        except Exception as exc:
            return {"items": [], "degraded": True, "last_error": _sanitize_error(exc)}
        return {
            "items": [h.as_api_dict() for h in hits],
            "degraded": False,
            "last_error": None,
        }

    async def get_event(
        self,
        user: User,
        organization_id: UUID | None,
        external_id: str,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        allowed = await self._agent_ids(org_id)
        group = await self._group_name(org_id)
        try:
            hits = await search_org_events(
                self.client,
                group_name=group,
                allowed_agent_ids=allowed,
                since=datetime.now(UTC) - timedelta(hours=settings.siem_max_lookback_hours),
                limit=settings.siem_max_page_size,
            )
        except SiemQueryError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        except (WazuhClientError, OSError, TimeoutError):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found") from None
        for hit in hits:
            if hit.external_id == external_id:
                return hit.as_api_dict()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
