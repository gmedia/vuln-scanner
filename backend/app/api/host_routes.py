from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.host_protect import (
    MAX_AGENT_BODY_BYTES,
    MAX_AGENT_FINDINGS,
    HostAgentCommandAck,
    HostAgentPollResponse,
    HostAgentResultsIngest,
    HostAgentResultsResponse,
    HostHitResponse,
    HostScanResponse,
    HostSiteCreate,
    HostSiteResponse,
    HostSiteUpdate,
)
from app.services.auth import get_active_org_id, get_current_user
from app.services.host_agent_ingest import ack_agent_command, ingest_agent_results, poll_agent_jobs
from app.services.host_protect import HostProtectService

router = APIRouter(prefix="/host", tags=["host-protect"])


@router.get("/sites", response_model=list[HostSiteResponse])
async def list_sites(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostSiteResponse]:
    return await HostProtectService(db).list_sites(current_user, get_active_org_id(request))


@router.post("/sites", response_model=HostSiteResponse, status_code=201)
async def create_site(
    request: Request,
    body: HostSiteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).create_site(current_user, get_active_org_id(request), body)


@router.get("/sites/{site_id}", response_model=HostSiteResponse)
async def get_site(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).get_site(current_user, get_active_org_id(request), site_id)


@router.patch("/sites/{site_id}", response_model=HostSiteResponse)
async def update_site(
    request: Request,
    site_id: UUID,
    body: HostSiteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostSiteResponse:
    return await HostProtectService(db).update_site(current_user, get_active_org_id(request), site_id, body)


@router.delete("/sites/{site_id}", status_code=204)
async def delete_site(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await HostProtectService(db).delete_site(current_user, get_active_org_id(request), site_id)


@router.post("/sites/{site_id}/scan", response_model=HostScanResponse, status_code=201)
async def enqueue_scan(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostScanResponse:
    return await HostProtectService(db).enqueue_scan(current_user, get_active_org_id(request), site_id)


@router.get("/sites/{site_id}/scans", response_model=list[HostScanResponse])
async def list_scans(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostScanResponse]:
    return await HostProtectService(db).list_scans(current_user, get_active_org_id(request), site_id)


@router.get("/hits", response_model=list[HostHitResponse])
async def list_hits(
    request: Request,
    site_id: UUID | None = None,
    hit_status: str | None = Query(default=None, alias="status"),
    hit_class: str | None = Query(default=None, alias="class"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostHitResponse]:
    return await HostProtectService(db).list_hits(
        current_user,
        get_active_org_id(request),
        site_id=site_id,
        hit_status=hit_status,
        hit_class=hit_class,
    )


@router.post("/hits/{hit_id}/quarantine", response_model=HostHitResponse)
async def quarantine_hit(
    request: Request,
    hit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostHitResponse:
    return await HostProtectService(db).quarantine_hit(current_user, get_active_org_id(request), hit_id)


@router.post("/hits/{hit_id}/restore", response_model=HostHitResponse)
async def restore_hit(
    request: Request,
    hit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostHitResponse:
    return await HostProtectService(db).restore_hit(current_user, get_active_org_id(request), hit_id)


@router.get("/agent/jobs", response_model=HostAgentPollResponse)
async def poll_host_agent_jobs(
    agent_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    x_host_agent_token: str | None = Header(default=None, alias="X-Host-Agent-Token"),
) -> HostAgentPollResponse:
    return await poll_agent_jobs(db, x_host_agent_token, agent_id)


@router.post("/agent/results", response_model=HostAgentResultsResponse)
async def ingest_host_agent_results(
    request: Request,
    body: HostAgentResultsIngest,
    db: AsyncSession = Depends(get_db),
    x_host_agent_token: str | None = Header(default=None, alias="X-Host-Agent-Token"),
) -> HostAgentResultsResponse:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            size = int(content_length)
        except ValueError:
            size = 0
        if size > MAX_AGENT_BODY_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large")
    if len(body.findings) > MAX_AGENT_FINDINGS:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Payload too large")
    return await ingest_agent_results(db, x_host_agent_token, body)


@router.post("/agent/commands/ack", response_model=HostAgentResultsResponse)
async def ack_host_agent_command(
    body: HostAgentCommandAck,
    db: AsyncSession = Depends(get_db),
    x_host_agent_token: str | None = Header(default=None, alias="X-Host-Agent-Token"),
) -> HostAgentResultsResponse:
    return await ack_agent_command(db, x_host_agent_token, body)


@router.post("/hits/{hit_id}/ignore", response_model=HostHitResponse)
async def ignore_hit(
    request: Request,
    hit_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostHitResponse:
    return await HostProtectService(db).ignore_hit(current_user, get_active_org_id(request), hit_id)
