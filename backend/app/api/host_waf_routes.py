from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.host_waf import HostWafEventResponse, HostWafPolicyResponse, HostWafPolicyUpsert
from app.services.auth import get_active_org_id, get_current_user
from app.services.host_waf import HostWafService

router = APIRouter(prefix="/host/waf", tags=["host-waf"])


@router.get("/policies", response_model=list[HostWafPolicyResponse])
async def list_policies(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostWafPolicyResponse]:
    return await HostWafService(db).list_policies(current_user, get_active_org_id(request))


@router.put("/sites/{site_id}/policy", response_model=HostWafPolicyResponse)
async def upsert_policy(
    request: Request,
    site_id: UUID,
    body: HostWafPolicyUpsert,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostWafPolicyResponse:
    return await HostWafService(db).upsert_policy(current_user, get_active_org_id(request), site_id, body)


@router.get("/events", response_model=list[HostWafEventResponse])
async def list_events(
    request: Request,
    site_id: UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[HostWafEventResponse]:
    return await HostWafService(db).list_events(current_user, get_active_org_id(request), site_id)


@router.post("/sites/{site_id}/simulate", response_model=HostWafEventResponse, status_code=201)
async def simulate(
    request: Request,
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HostWafEventResponse:
    return await HostWafService(db).simulate(current_user, get_active_org_id(request), site_id)
