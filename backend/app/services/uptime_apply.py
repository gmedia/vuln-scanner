"""Probe apply path used by API and Celery workers (no FastAPI import)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.uptime import CONFIRM_FAILS, UptimeEvent, UptimeMonitor, UptimeSample
from app.services.uptime_probe import (
    ProbeResult,
    probe_dns,
    probe_heartbeat,
    probe_http,
    probe_ping,
    probe_tcp,
    tls_warn_due,
)


async def purge_old_uptime_rows(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
    stamp = now or datetime.now(UTC)
    samples = await db.execute(delete(UptimeSample).where(UptimeSample.checked_at < stamp - timedelta(days=7)))
    events = await db.execute(delete(UptimeEvent).where(UptimeEvent.at < stamp - timedelta(days=90)))
    return {
        "samples": int(getattr(samples, "rowcount", 0) or 0),
        "events": int(getattr(events, "rowcount", 0) or 0),
    }


def run_probe(monitor: UptimeMonitor) -> ProbeResult:
    if monitor.check_type == "tcp":
        return probe_tcp(monitor.target, monitor.timeout_seconds)
    if monitor.check_type == "dns":
        return probe_dns(monitor.target, monitor.timeout_seconds, monitor.dns_record, monitor.expected_values)
    if monitor.check_type == "ping":
        return probe_ping(monitor.target, monitor.timeout_seconds)
    if monitor.check_type == "heartbeat":
        return probe_heartbeat(monitor.last_heartbeat_at, monitor.interval_seconds)
    return probe_http(
        monitor.target,
        monitor.timeout_seconds,
        monitor.expect_status,
        monitor.keyword,
        monitor.keyword_invert,
        method=monitor.http_method or "GET",
        headers=monitor.request_headers,
        body=monitor.request_body,
    )


async def apply_probe(db: AsyncSession, monitor: UptimeMonitor, result: ProbeResult) -> UptimeEvent | None:
    now = datetime.now(UTC)
    sample = UptimeSample(
        id=uuid.uuid4(),
        monitor_id=monitor.id,
        checked_at=now,
        ok=result.ok,
        latency_ms=result.latency_ms,
        status_code=result.status_code,
        error=result.error,
    )
    db.add(sample)
    monitor.last_checked_at = now
    monitor.last_status_code = result.status_code
    monitor.last_latency_ms = result.latency_ms
    monitor.last_error = result.error
    monitor.next_check_at = now + timedelta(seconds=monitor.interval_seconds)
    prev = monitor.state
    event: UptimeEvent | None = None
    if result.ok:
        monitor.consecutive_fails = 0
        new_state = "up"
        if prev != "up":
            event = UptimeEvent(
                id=uuid.uuid4(),
                monitor_id=monitor.id,
                from_state=prev,
                to_state=new_state,
                at=now,
                notified=False,
                detail=None,
            )
            db.add(event)
        monitor.state = new_state
    else:
        monitor.consecutive_fails += 1
        if monitor.consecutive_fails >= CONFIRM_FAILS and prev != "down":
            event = UptimeEvent(
                id=uuid.uuid4(),
                monitor_id=monitor.id,
                from_state=prev,
                to_state="down",
                at=now,
                notified=False,
                detail=result.error,
            )
            db.add(event)
            monitor.state = "down"
    if result.ok and tls_warn_due(monitor.last_tls_warn_at, result.tls_days_left):
        warn = UptimeEvent(
            id=uuid.uuid4(),
            monitor_id=monitor.id,
            from_state=monitor.state,
            to_state="degraded",
            at=now,
            notified=False,
            detail=f"TLS expires in {result.tls_days_left} days",
        )
        db.add(warn)
        monitor.last_tls_warn_at = now
        if monitor.state != "down":
            monitor.state = "degraded"
        if event is None:
            event = warn
    monitor.updated_at = now
    await purge_old_uptime_rows(db, now=now)
    await db.commit()
    return event
