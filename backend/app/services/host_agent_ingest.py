from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from celery import Celery
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent
from app.models.host_protect import (
    HOST_PROTECT_ON_WRITE_DEBOUNCE_SECONDS,
    HOST_PROTECT_ORG_CONCURRENT_CAP,
    HostCommand,
    HostHit,
    HostQuarantineEvent,
    HostScan,
    HostSite,
)
from app.models.host_waf import HostWafEvent, HostWafPolicy
from app.models.user import User
from app.schemas.host_protect import (
    HostAgentCommandAck,
    HostAgentPollJob,
    HostAgentPollResponse,
    HostAgentRequestScan,
    HostAgentRequestScanResponse,
    HostAgentResultsIngest,
    HostAgentResultsResponse,
    HostAgentWatchSite,
    HostAgentWatchSitesResponse,
)
from app.schemas.host_waf import HostAgentWafEventsIngest, HostAgentWafEventsResponse
from app.services.host_handoff import handoff_waf_block, notify_live_waf_block
from app.services.host_path import jail_rel_path
from app.services.host_scan_runner import _finish_scan
from app.services.host_waf import _strip_query, is_product_waf_rule


def hash_results_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_results_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_results_token(raw)


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent token")


async def _agent_from_token(db: AsyncSession, raw_token: str | None) -> GuardAgent:
    if not settings.host_protect_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not raw_token or not raw_token.strip():
        raise _unauthorized()
    token_hash = hash_results_token(raw_token.strip())
    result = await db.execute(select(GuardAgent).where(GuardAgent.results_token_hash == token_hash))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise _unauthorized()
    stored = agent.results_token_hash or ""
    if not hmac.compare_digest(stored, token_hash):
        raise _unauthorized()
    if agent.results_token_revoked_at is not None:
        raise _unauthorized()
    return agent


def touch_helper_poll(agent: GuardAgent) -> None:
    agent.last_helper_poll_at = datetime.now(UTC)


logger = logging.getLogger(__name__)

_celery = Celery(
    "vuln_scanner",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)
_celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)


async def poll_agent_jobs(
    db: AsyncSession,
    raw_token: str | None,
    agent_id: UUID,
) -> HostAgentPollResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)
    jobs: list[HostAgentPollJob] = []
    cmd_result = await db.execute(
        select(HostCommand, HostSite, HostHit)
        .join(HostSite, HostSite.id == HostCommand.site_id)
        .join(HostHit, HostHit.id == HostCommand.hit_id)
        .where(
            HostSite.guard_agent_id == agent.id,
            HostSite.organization_id == agent.organization_id,
            HostCommand.organization_id == agent.organization_id,
            HostCommand.status == "queued",
            HostSite.enabled.is_(True),
        )
        .order_by(HostCommand.created_at.asc())
        .limit(50)
    )
    for cmd, site, hit in cmd_result.all():
        jobs.append(
            HostAgentPollJob(
                kind=cmd.kind,
                command_id=cmd.id,
                site_id=site.id,
                hit_id=hit.id,
                root_path=site.root_path,
                rel_path=hit.rel_path,
                dest_basename=cmd.dest_basename,
            )
        )
    scan_result = await db.execute(
        select(HostScan, HostSite)
        .join(HostSite, HostSite.id == HostScan.site_id)
        .where(
            HostSite.guard_agent_id == agent.id,
            HostSite.organization_id == agent.organization_id,
            HostScan.organization_id == agent.organization_id,
            HostScan.status == "queued",
            HostSite.enabled.is_(True),
        )
        .order_by(HostScan.created_at.asc())
        .limit(5)
    )
    for scan, site in scan_result.all():
        jobs.append(
            HostAgentPollJob(
                kind="scan",
                scan_id=scan.id,
                site_id=site.id,
                root_path=site.root_path,
                trigger=scan.trigger,
            )
        )
    await db.commit()
    return HostAgentPollResponse(jobs=jobs)


async def list_watch_sites(
    db: AsyncSession,
    raw_token: str | None,
    agent_id: UUID,
) -> HostAgentWatchSitesResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)
    result = await db.execute(
        select(HostSite)
        .where(
            HostSite.guard_agent_id == agent.id,
            HostSite.organization_id == agent.organization_id,
            HostSite.enabled.is_(True),
            HostSite.watch_on_write.is_(True),
        )
        .order_by(HostSite.created_at.asc())
    )
    sites = [HostAgentWatchSite(site_id=s.id, root_path=s.root_path) for s in result.scalars().all()]
    await db.commit()
    return HostAgentWatchSitesResponse(sites=sites)


async def ack_agent_command(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentCommandAck,
) -> HostAgentResultsResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != body.agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)
    cmd_result = await db.execute(select(HostCommand).where(HostCommand.id == body.command_id))
    cmd = cmd_result.scalar_one_or_none()
    if cmd is None or cmd.organization_id != agent.organization_id:
        raise _unauthorized()
    site_result = await db.execute(select(HostSite).where(HostSite.id == cmd.site_id))
    site = site_result.scalar_one_or_none()
    if site is None or site.guard_agent_id != agent.id:
        raise _unauthorized()
    hit_result = await db.execute(select(HostHit).where(HostHit.id == cmd.hit_id))
    hit = hit_result.scalar_one_or_none()
    if hit is None:
        raise _unauthorized()
    now = datetime.now(UTC)
    if cmd.status == "acked":
        return HostAgentResultsResponse(ok=True, command_id=cmd.id, status=hit.status)
    if cmd.status == "failed" and not body.ok:
        return HostAgentResultsResponse(ok=False, command_id=cmd.id, status=hit.status)
    if body.ok:
        cmd.status = "acked"
        cmd.acked_at = now
        cmd.error = None
        if cmd.kind == "quarantine":
            hit.status = "quarantined"
        else:
            hit.status = "restored"
        db.add(
            HostQuarantineEvent(
                organization_id=hit.organization_id,
                hit_id=hit.id,
                actor_user_id=cmd.actor_user_id,
                action=cmd.kind,
                dest_basename=cmd.dest_basename,
            )
        )
    elif cmd.status == "queued":
        cmd.status = "failed"
        cmd.acked_at = now
        cmd.error = (body.error or "command failed")[:200]
        if cmd.kind == "quarantine":
            hit.status = "open"
        else:
            hit.status = "quarantined"
    await db.commit()
    return HostAgentResultsResponse(ok=body.ok, command_id=cmd.id, status=hit.status)


async def ingest_agent_results(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentResultsIngest,
) -> HostAgentResultsResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != body.agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)

    scan_result = await db.execute(select(HostScan).where(HostScan.id == body.scan_id))
    scan = scan_result.scalar_one_or_none()
    if scan is None:
        raise _unauthorized()
    if scan.organization_id != agent.organization_id:
        raise _unauthorized()

    site_result = await db.execute(select(HostSite).where(HostSite.id == scan.site_id))
    site = site_result.scalar_one_or_none()
    if site is None or site.guard_agent_id != agent.id or site.organization_id != agent.organization_id:
        raise _unauthorized()

    specs: list[dict[str, str]] = []
    for finding in body.findings:
        try:
            jail_rel_path(site.root_path, finding.rel_path)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        spec: dict[str, str] = {
            "rel_path": finding.rel_path.strip().lstrip("/"),
            "hit_class": finding.hit_class,
            "rule_id": finding.rule_id,
            "engine": body.engine,
        }
        if finding.sha256:
            spec["sha256"] = finding.sha256.lower()
        specs.append(spec)

    out = await _finish_scan(db, scan, site, specs, body.engine)
    return HostAgentResultsResponse(
        ok=True,
        scan_id=scan.id,
        hit_count=int(out["hit_count"]),
        engine=body.engine,
    )


async def ingest_agent_waf_events(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentWafEventsIngest,
) -> HostAgentWafEventsResponse:
    if not settings.host_waf_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    agent = await _agent_from_token(db, raw_token)
    if agent.id != body.agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)
    site_result = await db.execute(select(HostSite).where(HostSite.id == body.site_id))
    site = site_result.scalar_one_or_none()
    if site is None or site.guard_agent_id != agent.id or site.organization_id != agent.organization_id:
        raise _unauthorized()
    policy = (await db.execute(select(HostWafPolicy).where(HostWafPolicy.site_id == site.id))).scalar_one_or_none()
    owner = (await db.execute(select(User).where(User.id == site.created_by))).scalar_one_or_none()
    accepted = 0
    cutoff = datetime.now(UTC) - timedelta(minutes=10)
    seen: set[tuple[str, str, str, str]] = set()
    for item in body.events:
        path = _strip_query(item.path)
        rule_id = item.rule_id[:128]
        if not is_product_waf_rule(rule_id):
            continue
        key = (path, rule_id, item.method, item.action)
        if key in seen:
            continue
        seen.add(key)
        dup = (
            await db.execute(
                select(HostWafEvent.id)
                .where(
                    HostWafEvent.site_id == site.id,
                    HostWafEvent.path == path,
                    HostWafEvent.rule_id == rule_id,
                    HostWafEvent.method == item.method,
                    HostWafEvent.action == item.action,
                    HostWafEvent.created_at >= cutoff,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if dup is not None:
            continue
        event = HostWafEvent(
            organization_id=site.organization_id,
            site_id=site.id,
            policy_id=policy.id if policy is not None else None,
            action=item.action,
            rule_id=rule_id,
            method=item.method,
            path=path,
            http_status=item.http_status,
        )
        db.add(event)
        await db.flush()
        if owner is not None:
            await handoff_waf_block(db, event, site, owner)
            await notify_live_waf_block(event, site, owner)
        accepted += 1
    await db.commit()
    return HostAgentWafEventsResponse(ok=True, accepted=accepted)


async def request_on_write_scan(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentRequestScan,
) -> HostAgentRequestScanResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != body.agent_id:
        raise _unauthorized()
    touch_helper_poll(agent)
    site_result = await db.execute(select(HostSite).where(HostSite.id == body.site_id))
    site = site_result.scalar_one_or_none()
    if site is None or site.guard_agent_id != agent.id or site.organization_id != agent.organization_id:
        raise _unauthorized()
    if not site.enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Site disabled")
    if not site.watch_on_write:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="on-write watch not enabled")
    inflight = await db.execute(
        select(func.count())
        .select_from(HostScan)
        .where(
            HostScan.organization_id == site.organization_id,
            HostScan.status.in_(("queued", "running")),
        )
    )
    if int(inflight.scalar() or 0) >= HOST_PROTECT_ORG_CONCURRENT_CAP:
        raise HTTPException(status_code=429, detail="Organization scan cap reached")
    latest = (
        await db.execute(
            select(HostScan)
            .where(HostScan.site_id == site.id, HostScan.trigger == "on_write")
            .order_by(HostScan.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None and latest.created_at is not None:
        created = latest.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        age = (datetime.now(UTC) - created).total_seconds()
        if age < HOST_PROTECT_ON_WRITE_DEBOUNCE_SECONDS:
            raise HTTPException(status_code=429, detail="on-write scan debounced")
    scan = HostScan(
        id=uuid.uuid4(),
        organization_id=site.organization_id,
        site_id=site.id,
        status="queued",
        trigger="on_write",
    )
    db.add(scan)
    await db.flush()
    try:
        _celery.send_task("host_protect.run_scan", args=[str(scan.id)], queue="ip_scan")
    except Exception as exc:
        logger.warning("Host Protect on-write dispatch failed: %s", exc)
    await db.commit()
    await db.refresh(scan)
    return HostAgentRequestScanResponse(ok=True, scan_id=scan.id)
