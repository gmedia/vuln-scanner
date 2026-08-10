from __future__ import annotations

import itertools
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.config import settings


@dataclass
class WazuhAgentInfo:
    agent_id: str
    name: str
    status: str
    ip: str | None = None
    version: str | None = None
    last_keep_alive: datetime | None = None
    groups: list[str] = field(default_factory=list)


@dataclass
class WazuhAlertInfo:
    external_id: str
    rule_id: str | None
    rule_level: int
    rule_description: str
    agent_wazuh_id: str | None
    agent_name: str | None
    occurred_at: datetime


@dataclass
class EnrollResult:
    agent_id: str
    name: str
    key: str
    manager_host: str


class WazuhClient(ABC):
    @abstractmethod
    async def ensure_group(self, group_name: str) -> None: ...

    @abstractmethod
    async def list_agents(self, group_name: str) -> list[WazuhAgentInfo]: ...

    @abstractmethod
    async def enroll_agent(self, *, name: str, group_name: str) -> EnrollResult: ...

    @abstractmethod
    async def search_alerts(
        self,
        *,
        group_name: str,
        min_level: int,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[WazuhAlertInfo]: ...


class MockWazuhClient(WazuhClient):
    _lock = threading.Lock()
    _groups: set[str] = set()
    _agents: dict[str, list[dict[str, Any]]] = {}
    _alerts: dict[str, list[dict[str, Any]]] = {}
    _id_seq = itertools.count(1)

    @classmethod
    def reset(cls) -> None:
        with cls._lock:
            cls._groups.clear()
            cls._agents.clear()
            cls._alerts.clear()
            cls._id_seq = itertools.count(1)

    @classmethod
    def seed_agent(cls, group_name: str, **kwargs: Any) -> dict[str, Any]:
        with cls._lock:
            cls._groups.add(group_name)
            agent_id = kwargs.get("agent_id") or f"{next(cls._id_seq):03d}"
            row = {
                "agent_id": agent_id,
                "name": kwargs.get("name") or f"agent-{agent_id}",
                "status": kwargs.get("status") or "active",
                "ip": kwargs.get("ip"),
                "version": kwargs.get("version") or "4.8.0",
                "last_keep_alive": kwargs.get("last_keep_alive") or datetime.now(UTC),
                "groups": [group_name],
            }
            cls._agents.setdefault(group_name, []).append(row)
            return row

    @classmethod
    def seed_alert(cls, group_name: str, **kwargs: Any) -> dict[str, Any]:
        with cls._lock:
            cls._groups.add(group_name)
            row = {
                "external_id": kwargs.get("external_id") or str(uuid4()),
                "rule_id": kwargs.get("rule_id") or "550",
                "rule_level": int(kwargs.get("rule_level") or 12),
                "rule_description": kwargs.get("rule_description") or "Critical integrity change",
                "agent_wazuh_id": kwargs.get("agent_wazuh_id"),
                "agent_name": kwargs.get("agent_name"),
                "occurred_at": kwargs.get("occurred_at") or datetime.now(UTC),
            }
            cls._alerts.setdefault(group_name, []).append(row)
            return row

    async def ensure_group(self, group_name: str) -> None:
        with self._lock:
            self._groups.add(group_name)
            self._agents.setdefault(group_name, [])
            self._alerts.setdefault(group_name, [])

    async def list_agents(self, group_name: str) -> list[WazuhAgentInfo]:
        with self._lock:
            rows = list(self._agents.get(group_name, []))
        return [
            WazuhAgentInfo(
                agent_id=r["agent_id"],
                name=r["name"],
                status=r["status"],
                ip=r.get("ip"),
                version=r.get("version"),
                last_keep_alive=r.get("last_keep_alive"),
                groups=list(r.get("groups") or [group_name]),
            )
            for r in rows
        ]

    async def enroll_agent(self, *, name: str, group_name: str) -> EnrollResult:
        await self.ensure_group(group_name)
        with self._lock:
            agent_id = f"{next(self._id_seq):03d}"
            row = {
                "agent_id": agent_id,
                "name": name,
                "status": "pending",
                "ip": None,
                "version": None,
                "last_keep_alive": None,
                "groups": [group_name],
            }
            self._agents.setdefault(group_name, []).append(row)
        host = settings.wazuh_agent_manager_host or "manager.example.invalid"
        return EnrollResult(
            agent_id=agent_id,
            name=name,
            key=f"MOCKKEY-{agent_id}-{uuid4().hex[:8]}",
            manager_host=host,
        )

    async def search_alerts(
        self,
        *,
        group_name: str,
        min_level: int,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[WazuhAlertInfo]:
        with self._lock:
            rows = list(self._alerts.get(group_name, []))
        out: list[WazuhAlertInfo] = []
        for r in rows:
            if int(r["rule_level"]) < min_level:
                continue
            occurred = r["occurred_at"]
            if since is not None and occurred is not None and occurred < since:
                continue
            out.append(
                WazuhAlertInfo(
                    external_id=r["external_id"],
                    rule_id=r.get("rule_id"),
                    rule_level=int(r["rule_level"]),
                    rule_description=r["rule_description"],
                    agent_wazuh_id=r.get("agent_wazuh_id"),
                    agent_name=r.get("agent_name"),
                    occurred_at=occurred,
                )
            )
        out.sort(key=lambda a: a.occurred_at, reverse=True)
        return out[:limit]


class HttpWazuhClient(WazuhClient):
    async def ensure_group(self, group_name: str) -> None:
        raise NotImplementedError("Live Wazuh manager not configured; set GUARD_MOCK_WAZUH=true")

    async def list_agents(self, group_name: str) -> list[WazuhAgentInfo]:
        raise NotImplementedError("Live Wazuh manager not configured; set GUARD_MOCK_WAZUH=true")

    async def enroll_agent(self, *, name: str, group_name: str) -> EnrollResult:
        raise NotImplementedError("Live Wazuh manager not configured; set GUARD_MOCK_WAZUH=true")

    async def search_alerts(
        self,
        *,
        group_name: str,
        min_level: int,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[WazuhAlertInfo]:
        raise NotImplementedError("Live Wazuh indexer not configured; set GUARD_MOCK_WAZUH=true")


def get_wazuh_client() -> WazuhClient:
    if settings.guard_mock_wazuh or not settings.wazuh_manager_url:
        return MockWazuhClient()
    return HttpWazuhClient()
