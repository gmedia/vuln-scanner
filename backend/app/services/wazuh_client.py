from __future__ import annotations

import itertools
import logging
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TOKEN_TTL_SECONDS = 800
_HTTP_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class WazuhClientError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


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


def _parse_wazuh_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, int | float):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=UTC)
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s or s in ("n/a", "N/A", "never"):
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    except (TypeError, ValueError, IndexError):
        return None


def _manager_host_for_agents() -> str:
    if settings.wazuh_agent_manager_host:
        return settings.wazuh_agent_manager_host.strip()
    raw = (settings.wazuh_manager_url or "").strip()
    if not raw:
        return "manager.example.invalid"
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return parsed.hostname or raw


def _agent_from_manager_item(item: dict[str, Any], fallback_group: str) -> WazuhAgentInfo:
    agent_id = str(item.get("id") or item.get("agent_id") or "")
    name = str(item.get("name") or agent_id or "unknown")
    status = str(item.get("status") or "unknown").lower()
    ip_val = item.get("ip") or item.get("registerIP")
    ip = str(ip_val) if ip_val not in (None, "", "any", "0.0.0.0") else None
    version = item.get("version")
    version_s = str(version) if version else None
    groups_raw = item.get("group") or item.get("groups") or []
    groups = [groups_raw] if isinstance(groups_raw, str) else [str(g) for g in groups_raw]
    if not groups:
        groups = [fallback_group]
    return WazuhAgentInfo(
        agent_id=agent_id,
        name=name,
        status=status,
        ip=ip,
        version=version_s,
        last_keep_alive=_parse_wazuh_datetime(item.get("lastKeepAlive") or item.get("dateAdd")),
        groups=groups,
    )


def _alert_from_hit(hit: dict[str, Any]) -> WazuhAlertInfo | None:
    src = hit.get("_source") if isinstance(hit.get("_source"), dict) else hit
    if not isinstance(src, dict):
        return None
    rule_obj = src.get("rule")
    agent_obj = src.get("agent")
    rule: dict[str, Any] = rule_obj if isinstance(rule_obj, dict) else {}
    agent: dict[str, Any] = agent_obj if isinstance(agent_obj, dict) else {}
    level = rule.get("level")
    try:
        rule_level = int(level) if level is not None else 0
    except (TypeError, ValueError):
        rule_level = 0
    desc = str(rule.get("description") or "Wazuh alert")
    rule_id = rule.get("id")
    rule_id_s = str(rule_id) if rule_id is not None else None
    external = hit.get("_id") or src.get("id") or src.get("uuid")
    if external is None:
        external = f"{agent.get('id', 'x')}-{rule_id_s or '0'}-{src.get('timestamp') or uuid4().hex}"
    occurred = _parse_wazuh_datetime(src.get("timestamp") or src.get("@timestamp")) or datetime.now(UTC)
    agent_id = agent.get("id")
    agent_name = agent.get("name")
    return WazuhAlertInfo(
        external_id=str(external),
        rule_id=rule_id_s,
        rule_level=rule_level,
        rule_description=desc[:512],
        agent_wazuh_id=str(agent_id) if agent_id is not None else None,
        agent_name=str(agent_name) if agent_name is not None else None,
        occurred_at=occurred,
    )


class HttpWazuhClient(WazuhClient):
    def __init__(
        self,
        *,
        manager_url: str | None = None,
        manager_user: str | None = None,
        manager_password: str | None = None,
        indexer_url: str | None = None,
        indexer_user: str | None = None,
        indexer_password: str | None = None,
        verify_tls: bool | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._manager_url = (manager_url if manager_url is not None else settings.wazuh_manager_url).rstrip("/")
        self._manager_user = manager_user if manager_user is not None else settings.wazuh_manager_user
        self._manager_password = manager_password if manager_password is not None else settings.wazuh_manager_password
        self._indexer_url = (indexer_url if indexer_url is not None else settings.wazuh_indexer_url).rstrip("/")
        self._indexer_user = indexer_user if indexer_user is not None else settings.wazuh_indexer_user
        self._indexer_password = indexer_password if indexer_password is not None else settings.wazuh_indexer_password
        self._verify = settings.wazuh_verify_tls if verify_tls is None else verify_tls
        self._transport = transport
        self._token: str | None = None
        self._token_acquired_at: float | None = None
        if not self._manager_url:
            raise WazuhClientError("WAZUH_MANAGER_URL is required for live client")
        if not self._manager_user or not self._manager_password:
            raise WazuhClientError("WAZUH_MANAGER_USER and WAZUH_MANAGER_PASSWORD are required")

    def _client_kwargs(self) -> dict[str, Any]:
        kw: dict[str, Any] = {"timeout": _HTTP_TIMEOUT, "verify": self._verify}
        if self._transport is not None:
            kw["transport"] = self._transport
            kw["base_url"] = "https://wazuh.test"
        return kw

    async def _authenticate(self, client: httpx.AsyncClient) -> str:
        import time

        now = time.monotonic()
        if self._token and self._token_acquired_at is not None and (now - self._token_acquired_at) < _TOKEN_TTL_SECONDS:
            return self._token
        url = f"{self._manager_url}/security/user/authenticate"
        try:
            resp = await client.post(url, auth=(self._manager_user, self._manager_password))
        except httpx.RequestError as exc:
            logger.warning("Wazuh manager auth transport error: %s", type(exc).__name__)
            raise WazuhClientError("Wazuh manager unreachable") from exc
        if resp.status_code in (401, 403):
            raise WazuhClientError("Wazuh manager authentication failed", status_code=resp.status_code)
        if resp.status_code >= 400:
            raise WazuhClientError(
                f"Wazuh manager auth HTTP {resp.status_code}",
                status_code=resp.status_code,
            )
        try:
            body = resp.json()
        except ValueError as exc:
            raise WazuhClientError("Wazuh manager auth returned non-JSON") from exc
        token = None
        if isinstance(body, dict):
            data = body.get("data")
            if isinstance(data, dict):
                token = data.get("token")
            if not token:
                token = body.get("token")
        if not isinstance(token, str) or not token:
            raise WazuhClientError("Wazuh manager auth missing token")
        token_s: str = token
        self._token = token_s
        self._token_acquired_at = now
        return token_s

    async def _manager_request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        retry_auth: bool = True,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(**self._client_kwargs()) as client:
            token = await self._authenticate(client)
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
            url = f"{self._manager_url}{path}"
            try:
                resp = await client.request(method, url, headers=headers, params=params, json=json_body)
            except httpx.RequestError as exc:
                logger.warning("Wazuh manager request error %s %s: %s", method, path, type(exc).__name__)
                raise WazuhClientError("Wazuh manager unreachable") from exc
            if resp.status_code == 401 and retry_auth:
                self._token = None
                self._token_acquired_at = None
                return await self._manager_request(method, path, params=params, json_body=json_body, retry_auth=False)
            if resp.status_code >= 400:
                detail = f"Wazuh manager {method} {path} HTTP {resp.status_code}"
                raise WazuhClientError(detail, status_code=resp.status_code)
            if resp.status_code == 204 or not resp.content:
                return {}
            try:
                data = resp.json()
            except ValueError as exc:
                raise WazuhClientError("Wazuh manager returned non-JSON") from exc
            if not isinstance(data, dict):
                raise WazuhClientError("Wazuh manager returned unexpected JSON type")
            return data

    async def ensure_group(self, group_name: str) -> None:
        if not group_name or len(group_name) > 255:
            raise WazuhClientError("Invalid Wazuh group name")
        try:
            await self._manager_request("POST", "/groups", json_body={"group_id": group_name})
        except WazuhClientError as exc:
            # Wazuh 4.x has no `GET /groups/{name}` endpoint. A duplicate group is
            # reported as HTTP 400 ("The group already exists"), which means the
            # group is already present and usable — treat it as success.
            if exc.status_code == 400:
                return
            raise

    async def list_agents(self, group_name: str) -> list[WazuhAgentInfo]:
        select = "id,name,status,ip,version,lastKeepAlive,group,dateAdd,registerIP"
        limit = 500
        offset = 0
        out: list[WazuhAgentInfo] = []
        while True:
            body = await self._manager_request(
                "GET",
                "/agents",
                params={
                    "group": group_name,
                    "select": select,
                    "limit": limit,
                    "offset": offset,
                    "q": "id!=000",
                },
            )
            data = body.get("data") if isinstance(body.get("data"), dict) else {}
            items = data.get("affected_items") if isinstance(data, dict) else None
            if not isinstance(items, list):
                items = []
            for raw in items:
                if isinstance(raw, dict):
                    out.append(_agent_from_manager_item(raw, group_name))
            total = int(data.get("total_affected_items") or len(items)) if isinstance(data, dict) else len(items)
            offset += len(items)
            if offset >= total or not items:
                break
        return out

    async def enroll_agent(self, *, name: str, group_name: str) -> EnrollResult:
        await self.ensure_group(group_name)
        body = await self._manager_request(
            "POST",
            "/agents",
            json_body={"name": name, "ip": "any"},
        )
        data = body.get("data") if isinstance(body.get("data"), dict) else {}
        agent_id: str | None = None
        key: str | None = None
        if isinstance(data, dict):
            if data.get("id") is not None:
                agent_id = str(data["id"])
            if isinstance(data.get("key"), str):
                key = data["key"]
            items = data.get("affected_items")
            if (not agent_id or not key) and isinstance(items, list) and items:
                first = items[0]
                if isinstance(first, dict):
                    if not agent_id and first.get("id") is not None:
                        agent_id = str(first["id"])
                    if not key and isinstance(first.get("key"), str):
                        key = first["key"]
        if not agent_id:
            raise WazuhClientError("Wazuh enroll response missing agent id")

        try:
            await self._manager_request("PUT", f"/agents/{agent_id}/group/{group_name}")
        except WazuhClientError as exc:
            if exc.status_code not in (400, 409):
                logger.warning("Wazuh group assign failed for agent (sanitized status=%s)", exc.status_code)

        if not key:
            key_body = await self._manager_request("GET", f"/agents/{agent_id}/key")
            key_data = key_body.get("data") if isinstance(key_body.get("data"), dict) else {}
            key_items = key_data.get("affected_items") if isinstance(key_data, dict) else None
            if isinstance(key_items, list) and key_items and isinstance(key_items[0], dict):
                key = key_items[0].get("key")
            if not key and isinstance(key_data, dict):
                key = key_data.get("key") if isinstance(key_data.get("key"), str) else None
        if not key or not isinstance(key, str):
            raise WazuhClientError("Wazuh enroll response missing agent key")

        return EnrollResult(
            agent_id=agent_id,
            name=name,
            key=key,
            manager_host=_manager_host_for_agents(),
        )

    async def search_alerts(
        self,
        *,
        group_name: str,
        min_level: int,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[WazuhAlertInfo]:
        if not self._indexer_url:
            raise WazuhClientError("WAZUH_INDEXER_URL is required for alert search")
        size = max(1, min(int(limit), 500))
        filters: list[dict[str, Any]] = [
            {"term": {"agent.groups": group_name}},
            {"range": {"rule.level": {"gte": int(min_level)}}},
        ]
        if since is not None:
            since_utc = since if since.tzinfo else since.replace(tzinfo=UTC)
            filters.append({"range": {"timestamp": {"gte": since_utc.astimezone(UTC).isoformat()}}})
        query: dict[str, Any] = {
            "size": size,
            "sort": [{"timestamp": {"order": "desc"}}],
            "_source": [
                "timestamp",
                "rule.id",
                "rule.level",
                "rule.description",
                "agent.id",
                "agent.name",
                "agent.groups",
            ],
            "query": {"bool": {"filter": filters}},
        }
        url = f"{self._indexer_url}/wazuh-alerts-*/_search"
        post_kwargs: dict[str, Any] = {"json": query}
        if self._indexer_user:
            post_kwargs["auth"] = (self._indexer_user, self._indexer_password or "")
        async with httpx.AsyncClient(**self._client_kwargs()) as client:
            try:
                resp = await client.post(url, **post_kwargs)
            except httpx.RequestError as exc:
                logger.warning("Wazuh indexer request error: %s", type(exc).__name__)
                raise WazuhClientError("Wazuh indexer unreachable") from exc
            if resp.status_code >= 400:
                raise WazuhClientError(
                    f"Wazuh indexer search HTTP {resp.status_code}",
                    status_code=resp.status_code,
                )
            try:
                body = resp.json()
            except ValueError as exc:
                raise WazuhClientError("Wazuh indexer returned non-JSON") from exc
        hits_wrap = body.get("hits") if isinstance(body, dict) else None
        hits = hits_wrap.get("hits") if isinstance(hits_wrap, dict) else None
        if not isinstance(hits, list):
            return []
        out: list[WazuhAlertInfo] = []
        for hit in hits:
            if isinstance(hit, dict):
                parsed = _alert_from_hit(hit)
                if parsed is not None:
                    out.append(parsed)
        return out


def get_wazuh_client() -> WazuhClient:
    if settings.guard_mock_wazuh or not settings.wazuh_manager_url:
        return MockWazuhClient()
    return HttpWazuhClient()
