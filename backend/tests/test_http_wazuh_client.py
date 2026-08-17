from __future__ import annotations

import json
from datetime import UTC, datetime

import httpx
import pytest

from app.services.wazuh_client import HttpWazuhClient, WazuhClientError


def _manager_router(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    method = request.method.upper()

    if path.endswith("/security/user/authenticate") and method == "POST":
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("basic "):
            return httpx.Response(401, json={"title": "Unauthorized", "detail": "no basic"})
        return httpx.Response(200, json={"data": {"token": "jwt-test-token"}, "error": 0})

    authz = request.headers.get("authorization", "")
    if not authz.startswith("Bearer "):
        return httpx.Response(401, json={"title": "Unauthorized", "detail": "no token"})

    if path.endswith("/groups") and method == "POST":
        body = json.loads(request.content.decode() or "{}")
        if body.get("group_id") == "org_exists":
            return httpx.Response(400, json={"title": "Bad Request", "detail": "The group already exists: org_exists"})
        return httpx.Response(200, json={"message": "created", "error": 0})

    if path.startswith("/groups/") and method == "GET":
        return httpx.Response(404, json={"title": "Not Found", "detail": path})

    if path.endswith("/agents") and method == "GET":
        group = request.url.params.get("group")
        return httpx.Response(
            200,
            json={
                "data": {
                    "affected_items": [
                        {
                            "id": "001",
                            "name": "web-1",
                            "status": "active",
                            "ip": "10.0.0.5",
                            "version": "Wazuh v4.9.0",
                            "lastKeepAlive": "2026-08-10T12:00:00Z",
                            "group": [group or "default"],
                        }
                    ],
                    "total_affected_items": 1,
                    "total_failed_items": 0,
                    "failed_items": [],
                },
                "error": 0,
            },
        )

    if path.endswith("/agents") and method == "POST":
        body = json.loads(request.content.decode() or "{}")
        return httpx.Response(
            200,
            json={
                "data": {
                    "id": "009",
                    "key": "MDA5LW1vY2sta2V5",
                },
                "error": 0,
                "message": f"Agent {body.get('name')} added",
            },
        )

    if "/agents/" in path and "/group/" in path and method == "PUT":
        return httpx.Response(
            200,
            json={
                "data": {
                    "affected_items": ["009"],
                    "total_affected_items": 1,
                    "total_failed_items": 0,
                    "failed_items": [],
                },
                "error": 0,
            },
        )

    if path.endswith("/key") and method == "GET":
        return httpx.Response(
            200,
            json={
                "data": {
                    "affected_items": [{"id": "009", "key": "MDA5LW1vY2sta2V5"}],
                    "total_affected_items": 1,
                    "total_failed_items": 0,
                    "failed_items": [],
                },
                "error": 0,
            },
        )

    return httpx.Response(404, json={"title": "Not Found", "detail": path})


def _indexer_router(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/_search") and request.method.upper() == "POST":
        return httpx.Response(
            200,
            json={
                "hits": {
                    "hits": [
                        {
                            "_id": "alert-1",
                            "_source": {
                                "timestamp": "2026-08-10T11:00:00.000Z",
                                "rule": {
                                    "id": "550",
                                    "level": 12,
                                    "description": "Integrity checksum changed",
                                },
                                "agent": {"id": "001", "name": "web-1", "groups": ["org_abc"]},
                            },
                        }
                    ]
                }
            },
        )
    return httpx.Response(404, json={"error": "not found"})


def _combined_transport(request: httpx.Request) -> httpx.Response:
    host = request.url.host or ""
    if "indexer" in host or "/_search" in request.url.path:
        return _indexer_router(request)
    return _manager_router(request)


@pytest.fixture
def http_client() -> HttpWazuhClient:
    transport = httpx.MockTransport(_combined_transport)
    return HttpWazuhClient(
        manager_url="https://manager.test:55000",
        manager_user="wazuh",
        manager_password="secret",
        indexer_url="https://indexer.test:9200",
        indexer_user="admin",
        indexer_password="secret",
        verify_tls=False,
        transport=transport,
    )


@pytest.mark.asyncio
async def test_ensure_group_create(http_client: HttpWazuhClient) -> None:
    await http_client.ensure_group("org_new")


@pytest.mark.asyncio
async def test_ensure_group_already_exists(http_client: HttpWazuhClient) -> None:
    await http_client.ensure_group("org_exists")


@pytest.mark.asyncio
async def test_list_agents(http_client: HttpWazuhClient) -> None:
    agents = await http_client.list_agents("org_abc")
    assert len(agents) == 1
    assert agents[0].agent_id == "001"
    assert agents[0].name == "web-1"
    assert agents[0].status == "active"
    assert agents[0].ip == "10.0.0.5"
    assert agents[0].last_keep_alive is not None


@pytest.mark.asyncio
async def test_enroll_agent(http_client: HttpWazuhClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "wazuh_agent_manager_host", "mgr.example.invalid")
    result = await http_client.enroll_agent(name="vps-1", group_name="org_abc")
    assert result.agent_id == "009"
    assert result.key == "MDA5LW1vY2sta2V5"
    assert result.manager_host == "mgr.example.invalid"
    assert result.name == "vps-1"


@pytest.mark.asyncio
async def test_search_alerts_by_agent_ids_skips_group_term() -> None:
    captured: list[dict] = []

    def capture(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/_search"):
            captured.append(json.loads(request.content.decode()))
        return _indexer_router(request)

    client = HttpWazuhClient(
        manager_url="https://manager.test:55000",
        manager_user="wazuh",
        manager_password="secret",
        indexer_url="https://indexer.test:9200",
        indexer_user="admin",
        indexer_password="secret",
        verify_tls=False,
        transport=httpx.MockTransport(capture),
    )
    alerts = await client.search_alerts(
        group_name="org_abc",
        min_level=7,
        agent_ids=["009"],
        limit=10,
    )
    assert len(alerts) == 1
    assert captured
    filters = captured[0]["query"]["bool"]["filter"]
    assert {"terms": {"agent.id": ["009"]}} in filters
    assert not any("agent.groups" in str(item) for item in filters)


@pytest.mark.asyncio
async def test_search_alerts_empty_agent_ids_returns_none() -> None:
    client = HttpWazuhClient(
        manager_url="https://manager.test:55000",
        manager_user="wazuh",
        manager_password="secret",
        indexer_url="https://indexer.test:9200",
        indexer_user="admin",
        indexer_password="secret",
        verify_tls=False,
        transport=httpx.MockTransport(_indexer_router),
    )
    alerts = await client.search_alerts(group_name="org_abc", min_level=7, agent_ids=[])
    assert alerts == []


@pytest.mark.asyncio
async def test_search_alerts(http_client: HttpWazuhClient) -> None:
    since = datetime(2026, 8, 1, tzinfo=UTC)
    alerts = await http_client.search_alerts(group_name="org_abc", min_level=12, since=since, limit=10)
    assert len(alerts) == 1
    assert alerts[0].external_id == "alert-1"
    assert alerts[0].rule_level == 12
    assert alerts[0].rule_description.startswith("Integrity")
    assert alerts[0].agent_wazuh_id == "001"


@pytest.mark.asyncio
async def test_missing_manager_url() -> None:
    with pytest.raises(WazuhClientError):
        HttpWazuhClient(
            manager_url="",
            manager_user="u",
            manager_password="p",
        )


@pytest.mark.asyncio
async def test_auth_failure() -> None:
    def bad_auth(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"title": "Unauthorized", "detail": "bad"})

    client = HttpWazuhClient(
        manager_url="https://manager.test:55000",
        manager_user="wazuh",
        manager_password="wrong",
        indexer_url="https://indexer.test:9200",
        verify_tls=False,
        transport=httpx.MockTransport(bad_auth),
    )
    with pytest.raises(WazuhClientError) as exc:
        await client.list_agents("org_x")
    assert exc.value.status_code == 401
