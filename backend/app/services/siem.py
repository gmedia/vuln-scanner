from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent, GuardOrgBinding, wazuh_group_for_org
from app.models.siem import CASE_STATUSES, SiemCase, SiemCaseEvent, SiemCaseNote
from app.models.user import User
from app.services.organization import get_membership, require_membership
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

    def _case_dict(self, case: SiemCase, events: list[SiemCaseEvent], notes: list[SiemCaseNote]) -> dict[str, Any]:
        return {
            "id": case.id,
            "organization_id": case.organization_id,
            "title": case.title,
            "status": case.status,
            "severity": case.severity,
            "created_by_user_id": case.created_by_user_id,
            "assignee_user_id": case.assignee_user_id,
            "created_at": case.created_at,
            "updated_at": case.updated_at,
            "closed_at": case.closed_at,
            "events": [
                {
                    "id": ev.id,
                    "external_id": ev.external_id,
                    "rule_id": ev.rule_id,
                    "rule_level": ev.rule_level,
                    "rule_description": ev.rule_description,
                    "agent_wazuh_id": ev.agent_wazuh_id,
                    "agent_name": ev.agent_name,
                    "occurred_at": ev.occurred_at,
                }
                for ev in events
            ],
            "notes": [
                {
                    "id": note.id,
                    "author_user_id": note.author_user_id,
                    "body": note.body,
                    "created_at": note.created_at,
                }
                for note in notes
            ],
        }

    async def _load_case(self, org_id: UUID, case_id: UUID) -> SiemCase:
        result = await self.db.execute(
            select(SiemCase).where(SiemCase.id == case_id, SiemCase.organization_id == org_id)
        )
        case = result.scalar_one_or_none()
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        return case

    async def _case_events(self, case_id: UUID) -> list[SiemCaseEvent]:
        result = await self.db.execute(
            select(SiemCaseEvent).where(SiemCaseEvent.case_id == case_id).order_by(SiemCaseEvent.created_at.asc())
        )
        return list(result.scalars().all())

    async def _case_notes(self, case_id: UUID) -> list[SiemCaseNote]:
        result = await self.db.execute(
            select(SiemCaseNote).where(SiemCaseNote.case_id == case_id).order_by(SiemCaseNote.created_at.asc())
        )
        return list(result.scalars().all())

    def _require_title(self, title: str) -> str:
        cleaned = title.strip()
        if not cleaned:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="title is required")
        return cleaned

    async def _require_assignee(self, org_id: UUID, assignee_user_id: UUID) -> None:
        membership = await get_membership(self.db, org_id, assignee_user_id)
        if membership is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="assignee must be an organization member"
            )

    async def _projected_hit(self, user: User, org_id: UUID, external_id: str) -> dict[str, Any]:
        return await self.get_event(user, org_id, external_id)

    async def list_cases(self, user: User, organization_id: UUID | None) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        result = await self.db.execute(
            select(SiemCase).where(SiemCase.organization_id == org_id).order_by(SiemCase.created_at.desc())
        )
        cases = list(result.scalars().all())
        items = []
        for case in cases:
            events = await self._case_events(case.id)
            notes = await self._case_notes(case.id)
            items.append(self._case_dict(case, events, notes))
        return {"items": items}

    async def create_case(
        self,
        user: User,
        organization_id: UUID | None,
        *,
        title: str,
        external_id: str | None = None,
        assignee_user_id: UUID | None = None,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="member")
        cleaned_title = self._require_title(title)
        if assignee_user_id is not None:
            await self._require_assignee(org_id, assignee_user_id)
        hit: dict[str, Any] | None = None
        if external_id:
            hit = await self._projected_hit(user, org_id, external_id)
        case = SiemCase(
            organization_id=org_id,
            title=cleaned_title,
            status="open",
            created_by_user_id=user.id,
            assignee_user_id=assignee_user_id,
        )
        self.db.add(case)
        await self.db.flush()
        events: list[SiemCaseEvent] = []
        if hit is not None:
            ev = SiemCaseEvent(
                case_id=case.id,
                organization_id=org_id,
                external_id=hit["external_id"],
                rule_id=hit.get("rule_id"),
                rule_level=int(hit["rule_level"]),
                rule_description=hit["rule_description"],
                agent_wazuh_id=hit.get("agent_wazuh_id"),
                agent_name=hit.get("agent_name"),
                occurred_at=datetime.fromisoformat(hit["occurred_at"])
                if isinstance(hit["occurred_at"], str)
                else hit["occurred_at"],
            )
            case.severity = ev.rule_level
            self.db.add(ev)
            events.append(ev)
        await self.db.commit()
        await self.db.refresh(case)
        return self._case_dict(case, events, [])

    async def get_case(self, user: User, organization_id: UUID | None, case_id: UUID) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="viewer")
        case = await self._load_case(org_id, case_id)
        return self._case_dict(case, await self._case_events(case.id), await self._case_notes(case.id))

    async def patch_case(
        self,
        user: User,
        organization_id: UUID | None,
        case_id: UUID,
        *,
        title: str | None = None,
        status_value: str | None = None,
        assignee_user_id: UUID | None = None,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="admin")
        case = await self._load_case(org_id, case_id)
        if title is not None:
            case.title = self._require_title(title)
        if status_value is not None:
            if status_value not in CASE_STATUSES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid status")
            case.status = status_value
            case.closed_at = datetime.now(UTC) if status_value == "closed" else None
        if assignee_user_id is not None:
            await self._require_assignee(org_id, assignee_user_id)
            case.assignee_user_id = assignee_user_id
        case.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(case)
        return self._case_dict(case, await self._case_events(case.id), await self._case_notes(case.id))

    async def attach_event(
        self,
        user: User,
        organization_id: UUID | None,
        case_id: UUID,
        external_id: str,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="member")
        case = await self._load_case(org_id, case_id)
        existing = await self.db.execute(
            select(SiemCaseEvent).where(
                SiemCaseEvent.case_id == case.id,
                SiemCaseEvent.external_id == external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            return self._case_dict(case, await self._case_events(case.id), await self._case_notes(case.id))
        hit = await self._projected_hit(user, org_id, external_id)
        ev = SiemCaseEvent(
            case_id=case.id,
            organization_id=org_id,
            external_id=hit["external_id"],
            rule_id=hit.get("rule_id"),
            rule_level=int(hit["rule_level"]),
            rule_description=hit["rule_description"],
            agent_wazuh_id=hit.get("agent_wazuh_id"),
            agent_name=hit.get("agent_name"),
            occurred_at=datetime.fromisoformat(hit["occurred_at"])
            if isinstance(hit["occurred_at"], str)
            else hit["occurred_at"],
        )
        if case.severity is None or ev.rule_level > case.severity:
            case.severity = ev.rule_level
        self.db.add(ev)
        await self.db.commit()
        await self.db.refresh(case)
        return self._case_dict(case, await self._case_events(case.id), await self._case_notes(case.id))

    async def add_note(
        self,
        user: User,
        organization_id: UUID | None,
        case_id: UUID,
        body: str,
    ) -> dict[str, Any]:
        self._require_feature()
        org_id = await self._require_org(user, organization_id, min_role="member")
        case = await self._load_case(org_id, case_id)
        note = SiemCaseNote(case_id=case.id, author_user_id=user.id, body=body)
        self.db.add(note)
        case.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(case)
        return self._case_dict(case, await self._case_events(case.id), await self._case_notes(case.id))
