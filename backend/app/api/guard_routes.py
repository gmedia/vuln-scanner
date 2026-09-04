from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.asset import ScanAsset
from app.models.user import User
from app.schemas.guard import (
    GuardAgentAssetLink,
    GuardAgentResponse,
    GuardAlertResponse,
    GuardEnrollRequest,
    GuardEnrollResponse,
    GuardEnrollTokenCreate,
    GuardEnrollTokenCreated,
    GuardEnrollTokenMeta,
    GuardHostAgentTokenCreated,
    GuardStatusResponse,
    GuardSyncResponse,
)
from app.services.auth import get_active_org_id, get_current_user
from app.services.guard import GuardService

router = APIRouter(prefix="/guard", tags=["guard"])

enroll_limiter = RateLimiter(max_requests=20, window_seconds=60, prefix="ratelimit:guard_enroll")


@router.get("/status", response_model=GuardStatusResponse)
async def guard_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardStatusResponse:
    data = await GuardService(db).status(current_user, get_active_org_id(request))
    return GuardStatusResponse.model_validate(data)


@router.post("/enable", response_model=GuardStatusResponse)
async def guard_enable(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardStatusResponse:
    binding = await GuardService(db).enable(current_user, get_active_org_id(request))
    return GuardStatusResponse(
        enabled=binding.enabled,
        wazuh_group=binding.wazuh_group,
        last_inventory_sync_at=binding.last_inventory_sync_at,
        last_alert_sync_at=binding.last_alert_sync_at,
        last_sync_error=binding.last_sync_error,
        degraded=bool(binding.last_sync_error),
    )


@router.get("/agents", response_model=list[GuardAgentResponse])
async def list_agents(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GuardAgentResponse]:
    rows = await GuardService(db).list_agents(current_user, get_active_org_id(request))
    asset_ids = [r.asset_id for r in rows if r.asset_id is not None]
    names: dict[UUID, ScanAsset] = {}
    if asset_ids:
        asset_q = await db.execute(select(ScanAsset).where(ScanAsset.id.in_(asset_ids)))
        names = {a.id: a for a in asset_q.scalars().all()}
    out: list[GuardAgentResponse] = []
    for r in rows:
        asset = names.get(r.asset_id) if r.asset_id else None
        out.append(
            GuardAgentResponse.model_validate(r).model_copy(
                update={
                    "has_host_agent_token": bool(r.results_token_hash) and r.results_token_revoked_at is None,
                    "asset_id": r.asset_id,
                    "asset_name": asset.name if asset else None,
                    "asset_target": asset.target if asset else None,
                }
            )
        )
    return out


@router.get("/alerts", response_model=list[GuardAlertResponse])
async def list_alerts(
    request: Request,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GuardAlertResponse]:
    rows = await GuardService(db).list_alerts(current_user, get_active_org_id(request), limit=limit)
    return [GuardAlertResponse.model_validate(r) for r in rows]


@router.patch("/agents/{agent_id}/asset", response_model=GuardAgentResponse)
async def link_agent_asset(
    agent_id: UUID,
    body: GuardAgentAssetLink,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardAgentResponse:
    agent = await GuardService(db).link_asset(
        current_user,
        get_active_org_id(request),
        agent_id,
        body.asset_id,
    )
    asset_name = None
    asset_target = None
    if agent.asset_id is not None:
        asset_q = await db.execute(select(ScanAsset).where(ScanAsset.id == agent.asset_id))
        asset = asset_q.scalar_one_or_none()
        if asset is not None:
            asset_name = asset.name
            asset_target = asset.target
    return GuardAgentResponse.model_validate(agent).model_copy(
        update={
            "has_host_agent_token": bool(agent.results_token_hash) and agent.results_token_revoked_at is None,
            "asset_name": asset_name,
            "asset_target": asset_target,
        }
    )


@router.post(
    "/agents/{agent_id}/host-token",
    response_model=GuardHostAgentTokenCreated,
    status_code=201,
)
async def issue_host_agent_token(
    agent_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardHostAgentTokenCreated:
    agent, raw = await GuardService(db).issue_host_agent_token(
        current_user,
        get_active_org_id(request),
        agent_id,
    )
    return GuardHostAgentTokenCreated(agent_id=agent.id, token=raw)


@router.post("/enroll-tokens", response_model=GuardEnrollTokenCreated, status_code=201)
async def create_enroll_token(
    request: Request,
    body: GuardEnrollTokenCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardEnrollTokenCreated:
    row, raw = await GuardService(db).create_enroll_token(
        current_user,
        get_active_org_id(request),
        label=body.label,
    )
    return GuardEnrollTokenCreated(
        id=row.id,
        label=row.label,
        expires_at=row.expires_at,
        token=raw,
        created_at=row.created_at,
    )


@router.get("/enroll-tokens", response_model=list[GuardEnrollTokenMeta])
async def list_enroll_tokens(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GuardEnrollTokenMeta]:
    rows = await GuardService(db).list_enroll_tokens(current_user, get_active_org_id(request))
    return [GuardEnrollTokenMeta.model_validate(r) for r in rows]


@router.delete("/enroll-tokens/{token_id}", status_code=204)
async def revoke_enroll_token(
    token_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await GuardService(db).revoke_enroll_token(current_user, get_active_org_id(request), token_id)


@router.post("/enroll", response_model=GuardEnrollResponse)
async def enroll_agent(
    body: GuardEnrollRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> GuardEnrollResponse:
    limited = await enroll_limiter(request)
    if limited is not None:
        return limited  # type: ignore[return-value]
    data = await GuardService(db).redeem_enroll(token=body.token, agent_name=body.agent_name)
    return GuardEnrollResponse.model_validate(data)


@router.post("/sync", response_model=GuardSyncResponse)
async def sync_guard(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GuardSyncResponse:
    data = await GuardService(db).sync_for_user(current_user, get_active_org_id(request))
    return GuardSyncResponse.model_validate(data)
