from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent
from app.models.host_protect import HostCommand, HostHit, HostQuarantineEvent, HostScan, HostSite
from app.models.host_waf import HostWafEvent, HostWafPolicy
from app.models.user import User
from app.schemas.host_protect import (
    HostAgentCommandAck,
    HostAgentPollJob,
    HostAgentPollResponse,
    HostAgentResultsIngest,
    HostAgentResultsResponse,
)
from app.schemas.host_waf import HostAgentWafEventsIngest, HostAgentWafEventsResponse
from app.services.host_handoff import handoff_waf_block
from app.services.host_path import jail_rel_path
from app.services.host_scan_runner import _finish_scan
from app.services.host_waf import _strip_query


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


async def poll_agent_jobs(
    db: AsyncSession,
    raw_token: str | None,
    agent_id: UUID,
) -> HostAgentPollResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != agent_id:
        raise _unauthorized()
    agent.last_helper_poll_at = datetime.now(UTC)
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


async def ack_agent_command(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentCommandAck,
) -> HostAgentResultsResponse:
    agent = await _agent_from_token(db, raw_token)
    if agent.id != body.agent_id:
        raise _unauthorized()
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
        accepted += 1
    await db.commit()
    return HostAgentWafEventsResponse(ok=True, accepted=accepted)
