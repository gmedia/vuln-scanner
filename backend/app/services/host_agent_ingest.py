from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.guard import GuardAgent
from app.models.host_protect import HostScan, HostSite
from app.schemas.host_protect import HostAgentResultsIngest, HostAgentResultsResponse
from app.services.host_path import jail_rel_path
from app.services.host_scan_runner import _finish_scan


def hash_results_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_results_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_results_token(raw)


def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent token")


async def ingest_agent_results(
    db: AsyncSession,
    raw_token: str | None,
    body: HostAgentResultsIngest,
) -> HostAgentResultsResponse:
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
