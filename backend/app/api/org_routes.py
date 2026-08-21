from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.organization import (
    InviteAcceptRequest,
    InviteCreateRequest,
    InviteResponse,
    MemberResponse,
    MemberRoleUpdate,
    OrgCreateRequest,
    OrgDetailResponse,
    OrgMembershipResponse,
    OrgSwitchRequest,
    OrgSwitchResponse,
    OrgUpdateRequest,
)
from app.services.auth import create_access_token, create_refresh_token, get_current_user
from app.services.organization import OrganizationService

router = APIRouter(tags=["organizations"])

invite_create_limiter = RateLimiter(max_requests=10, window_seconds=60, prefix="ratelimit:org_invite")


@router.get("/orgs", response_model=list[OrgMembershipResponse])
async def list_orgs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrgMembershipResponse]:
    items = await OrganizationService(db).list_my_orgs(current_user)
    return [OrgMembershipResponse.model_validate(i) for i in items]


@router.post("/orgs", response_model=OrgDetailResponse, status_code=201)
async def create_org(
    body: OrgCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgDetailResponse:
    org = await OrganizationService(db).create_org(current_user, name=body.name, slug=body.slug, kind=body.kind)
    return OrgDetailResponse.model_validate(org)


@router.get("/orgs/{org_id}", response_model=OrgDetailResponse)
async def get_org(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgDetailResponse:
    org = await OrganizationService(db).get_org(org_id, current_user)
    return OrgDetailResponse.model_validate(org)


@router.patch("/orgs/{org_id}", response_model=OrgDetailResponse)
async def update_org(
    org_id: UUID,
    body: OrgUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgDetailResponse:
    org = await OrganizationService(db).update_org(org_id, current_user, name=body.name, slug=body.slug, sku=body.sku)
    return OrgDetailResponse.model_validate(org)


@router.post("/orgs/switch", response_model=OrgSwitchResponse)
async def switch_org(
    body: OrgSwitchRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrgSwitchResponse:
    org_id = await OrganizationService(db).switch_org(current_user, body.organization_id)
    user_id_str = str(current_user.id)
    access = create_access_token(
        user_id=user_id_str,
        email=current_user.email,
        is_admin=current_user.is_admin,
        org_id=str(org_id),
    )
    refresh = create_refresh_token(user_id=user_id_str)
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        max_age=settings.jwt_refresh_expire_days * 86400,
        path="/api/auth",
    )
    return OrgSwitchResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_access_expire_minutes * 60,
        active_org_id=org_id,
    )


@router.get("/orgs/{org_id}/members", response_model=list[MemberResponse])
async def list_members(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberResponse]:
    members = await OrganizationService(db).list_members(org_id, current_user)
    out: list[MemberResponse] = []
    for m in members:
        email = m.user.email if m.user is not None else None
        out.append(
            MemberResponse(
                user_id=m.user_id,
                email=email,
                role=m.role,
                created_at=m.created_at,
            )
        )
    return out


@router.patch("/orgs/{org_id}/members/{user_id}", response_model=MemberResponse)
async def change_member_role(
    org_id: UUID,
    user_id: UUID,
    body: MemberRoleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    m = await OrganizationService(db).change_role(org_id, current_user, user_id, body.role)
    return MemberResponse(
        user_id=m.user_id,
        email=None,
        role=m.role,
        created_at=m.created_at,
    )


@router.delete("/orgs/{org_id}/members/{user_id}", status_code=204)
async def remove_member(
    org_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if user_id == current_user.id:
        await OrganizationService(db).leave(org_id, current_user)
    else:
        await OrganizationService(db).remove_member(org_id, current_user, user_id)


@router.post("/orgs/{org_id}/invites", response_model=InviteResponse, status_code=201)
async def create_invite(
    org_id: UUID,
    body: InviteCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InviteResponse | Response:
    limit_response = await invite_create_limiter(request)
    if limit_response:
        return limit_response
    invite, raw = await OrganizationService(db).create_invite(
        org_id, current_user, email=str(body.email), role=body.role
    )
    resp = InviteResponse.model_validate(invite)
    resp.token = raw
    return resp


@router.get("/orgs/{org_id}/invites", response_model=list[InviteResponse])
async def list_invites(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InviteResponse]:
    invites = await OrganizationService(db).list_invites(org_id, current_user)
    return [InviteResponse.model_validate(i) for i in invites]


@router.delete("/orgs/{org_id}/invites/{invite_id}", status_code=204)
async def revoke_invite(
    org_id: UUID,
    invite_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await OrganizationService(db).revoke_invite(org_id, current_user, invite_id)


@router.post("/invites/accept", response_model=MemberResponse)
async def accept_invite(
    body: InviteAcceptRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    m = await OrganizationService(db).accept_invite(current_user, body.token)
    return MemberResponse(
        user_id=m.user_id,
        email=current_user.email,
        role=m.role,
        created_at=m.created_at,
    )
