from datetime import UTC, datetime, timedelta

import pytest

from app.services.siem_query import (
    SiemQueryError,
    build_indexer_query,
    clamp_window,
    sanitize_q,
    search_org_events,
)
from app.services.wazuh_client import MockWazuhClient


def test_sanitize_q_rejects_dsl_tokens() -> None:
    with pytest.raises(SiemQueryError):
        sanitize_q("rule.id:* OR agent.id:001")
    with pytest.raises(SiemQueryError):
        sanitize_q('{"query":{"match_all":{}}}')
    with pytest.raises(SiemQueryError):
        sanitize_q("ssh AND (bool)")
    assert sanitize_q("sshd auth") == "sshd auth"
    assert sanitize_q("  ") is None


def test_clamp_window_caps_lookback() -> None:
    now = datetime(2026, 8, 14, 12, 0, tzinfo=UTC)
    start, end = clamp_window(
        since=datetime(2020, 1, 1, tzinfo=UTC),
        until=now,
        now=now,
        max_lookback_hours=24,
    )
    assert start == now - timedelta(hours=24)
    assert end == now


def test_build_indexer_query_empty_inventory_is_match_none() -> None:
    body = build_indexer_query(
        group_name="org_deadbeef",
        allowed_agent_ids=[],
        min_level=7,
        max_level=None,
        start=datetime(2026, 8, 1, tzinfo=UTC),
        end=datetime(2026, 8, 2, tzinfo=UTC),
        q=None,
        size=50,
    )
    assert body["query"] == {"match_none": {}}
    assert "full_log" not in str(body.get("_source", []))


def test_build_indexer_query_requires_agent_and_group() -> None:
    body = build_indexer_query(
        group_name="org_aabb",
        allowed_agent_ids=["001", "002"],
        min_level=7,
        max_level=15,
        start=datetime(2026, 8, 1, tzinfo=UTC),
        end=datetime(2026, 8, 2, tzinfo=UTC),
        q="sshd",
        size=25,
    )
    filters = body["query"]["bool"]["filter"]
    assert {"terms": {"agent.id": ["001", "002"]}} in filters
    assert {"term": {"agent.groups": "org_aabb"}} in filters
    assert body["_source"] == [
        "rule.id",
        "rule.level",
        "rule.description",
        "agent.id",
        "agent.name",
        "timestamp",
    ]


@pytest.mark.asyncio
async def test_search_org_events_empty_allowlist_zero_hits() -> None:
    MockWazuhClient.reset()
    client = MockWazuhClient()
    MockWazuhClient.seed_alert("org_a", agent_wazuh_id="001", rule_level=10, rule_description="sshd")
    hits = await search_org_events(client, group_name="org_a", allowed_agent_ids=[])
    assert hits == []


@pytest.mark.asyncio
async def test_search_org_events_drops_foreign_agent() -> None:
    MockWazuhClient.reset()
    client = MockWazuhClient()
    MockWazuhClient.seed_alert(
        "org_a",
        agent_wazuh_id="001",
        rule_level=10,
        rule_description="own host sshd",
    )
    MockWazuhClient.seed_alert(
        "org_a",
        agent_wazuh_id="999",
        rule_level=14,
        rule_description="foreign leak",
    )
    hits = await search_org_events(
        client,
        group_name="org_a",
        allowed_agent_ids=["001"],
        min_level=7,
    )
    assert [h.agent_wazuh_id for h in hits] == ["001"]
    assert all("foreign" not in h.rule_description for h in hits)
