"""SIEM search: structured Indexer query + tenant predicate (no raw DSL from clients)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.config import settings
from app.services.wazuh_client import WazuhAlertInfo, WazuhClient

_FORBIDDEN_Q = re.compile(
    r"(\bOR\b|\bAND\b|\bNOT\b|[(){}\[\]\\]|\*|\"|query|dsl|bool)",
    re.IGNORECASE,
)
_SAFE_Q = re.compile(r"^[a-zA-Z0-9._\-: /]{1,128}$")


class SiemQueryError(ValueError):
    pass


@dataclass(frozen=True)
class SiemEventHit:
    external_id: str
    rule_id: str | None
    rule_level: int
    rule_description: str
    agent_wazuh_id: str | None
    agent_name: str | None
    occurred_at: datetime

    def as_api_dict(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "rule_id": self.rule_id,
            "rule_level": self.rule_level,
            "rule_description": self.rule_description,
            "agent_wazuh_id": self.agent_wazuh_id,
            "agent_name": self.agent_name,
            "occurred_at": self.occurred_at.isoformat(),
        }


def sanitize_q(q: str | None) -> str | None:
    if q is None:
        return None
    text = q.strip()
    if not text:
        return None
    if _FORBIDDEN_Q.search(text) or not _SAFE_Q.match(text):
        raise SiemQueryError("q must be a simple phrase on whitelisted fields")
    return text


def clamp_window(
    *,
    since: datetime | None,
    until: datetime | None,
    now: datetime | None = None,
    max_lookback_hours: int | None = None,
) -> tuple[datetime, datetime]:
    clock = now or datetime.now(UTC)
    hours = max_lookback_hours if max_lookback_hours is not None else settings.siem_max_lookback_hours
    floor = clock - timedelta(hours=max(1, hours))
    end = until or clock
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    start = since or floor
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if start < floor:
        start = floor
    if end > clock:
        end = clock
    if start >= end:
        raise SiemQueryError("since must be before until")
    return start, end


def build_indexer_query(
    *,
    group_name: str,
    allowed_agent_ids: list[str],
    min_level: int,
    max_level: int | None,
    start: datetime,
    end: datetime,
    q: str | None,
    size: int,
) -> dict[str, Any]:
    """Server-built OpenSearch body. Never accept a client DSL."""
    if not allowed_agent_ids:
        return {"size": 0, "query": {"match_none": {}}}
    filters: list[dict[str, Any]] = [
        {"terms": {"agent.id": allowed_agent_ids}},
        {"term": {"agent.groups": group_name}},
        {"range": {"rule.level": {"gte": min_level}}},
        {"range": {"timestamp": {"gte": start.isoformat(), "lte": end.isoformat()}}},
    ]
    if max_level is not None:
        filters[2] = {"range": {"rule.level": {"gte": min_level, "lte": max_level}}}
    must: list[dict[str, Any]] = []
    if q:
        must.append(
            {
                "multi_match": {
                    "query": q,
                    "fields": ["rule.description", "rule.id", "agent.name"],
                    "type": "phrase_prefix",
                }
            }
        )
    return {
        "size": size,
        "_source": [
            "rule.id",
            "rule.level",
            "rule.description",
            "agent.id",
            "agent.name",
            "timestamp",
        ],
        "query": {"bool": {"filter": filters, "must": must}},
        "sort": [{"timestamp": "desc"}],
    }


def project_hit(alert: WazuhAlertInfo) -> SiemEventHit:
    return SiemEventHit(
        external_id=alert.external_id,
        rule_id=alert.rule_id,
        rule_level=alert.rule_level,
        rule_description=alert.rule_description,
        agent_wazuh_id=alert.agent_wazuh_id,
        agent_name=alert.agent_name,
        occurred_at=alert.occurred_at,
    )


async def search_org_events(
    client: WazuhClient,
    *,
    group_name: str,
    allowed_agent_ids: list[str],
    min_level: int | None = None,
    max_level: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    q: str | None = None,
    limit: int | None = None,
) -> list[SiemEventHit]:
    if not allowed_agent_ids:
        return []
    allowed = {str(a) for a in allowed_agent_ids}
    floor_level = min_level if min_level is not None else settings.siem_search_min_level
    page = limit if limit is not None else settings.siem_max_page_size
    page = max(1, min(page, settings.siem_max_page_size))
    phrase = sanitize_q(q)
    start, end = clamp_window(since=since, until=until)
    raw = await client.search_alerts(
        group_name=group_name,
        min_level=floor_level,
        since=start,
        limit=page * 4,
    )
    out: list[SiemEventHit] = []
    for alert in raw:
        if alert.occurred_at > end:
            continue
        if alert.agent_wazuh_id is None or str(alert.agent_wazuh_id) not in allowed:
            continue
        if max_level is not None and alert.rule_level > max_level:
            continue
        if phrase:
            blob = " ".join(
                x
                for x in (
                    alert.rule_description,
                    alert.rule_id or "",
                    alert.agent_name or "",
                )
                if x
            )
            if phrase.lower() not in blob.lower():
                continue
        out.append(project_hit(alert))
        if len(out) >= page:
            break
    return out
