from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.organization import (
    INVITE_ROLES,
    ORG_ROLES,
    Organization,
    OrganizationInvite,
    OrganizationMembership,
)
from app.models.user import User

ROLE_RANK: dict[str, int] = {
    "viewer": 1,
    "member": 2,
    "admin": 3,
    "owner": 4,
}

MAX_NON_PERSONAL_ORGS_CREATED = 5
INVITE_TTL_DAYS = 14
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def role_rank(role: str | None) -> int:
    if not role:
        return 0
    return ROLE_RANK.get(role, 0)


def role_at_least(role: str | None, minimum: str) -> bool:
    return role_rank(role) >= role_rank(minimum)


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_invite_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hash_invite_token(raw)


def slugify_base(value: str) -> str:
    cleaned = _SLUG_RE.sub("-", (value or "org").lower()).strip("-") or "org"
    return cleaned[:40]


def make_unique_slug(base: str, suffix: str | None = None) -> str:
    tail = suffix or secrets.token_hex(3)
    return f"{slugify_base(base)}-{tail}"[:64]


async def ensure_personal_org(db: AsyncSession, user: User) -> Organization:
    existing = await db.execute(
        select(Organization)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(
            OrganizationMembership.user_id == user.id,
            Organization.kind == "personal",
            OrganizationMembership.role == "owner",
        )
        .limit(1)
    )
    org = existing.scalar_one_or_none()
    if org is not None:
        return org

    local = (user.email or "user").split("@", 1)[0]
    org = Organization(
        id=uuid.uuid4(),
        name=f"{local}'s workspace"[:255],
        slug=make_unique_slug(local),
        kind="personal",
        created_by_user_id=user.id,
    )
    db.add(org)
    await db.flush()
    membership = OrganizationMembership(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)
    if user.last_active_organization_id is None:
        user.last_active_organization_id = org.id
    await db.flush()
    return org


async def resolve_default_org_id(db: AsyncSession, user: User) -> UUID | None:
    if user.last_active_organization_id is not None:
        m = await get_membership(db, user.last_active_organization_id, user.id)
        if m is not None:
            return user.last_active_organization_id

    personal = await db.execute(
        select(Organization.id)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .where(
            OrganizationMembership.user_id == user.id,
            Organization.kind == "personal",
        )
        .limit(1)
    )
    personal_id = personal.scalar_one_or_none()
    if personal_id is not None:
        return personal_id

    first = await db.execute(
        select(OrganizationMembership.organization_id)
        .where(OrganizationMembership.user_id == user.id)
        .order_by(OrganizationMembership.created_at.asc())
        .limit(1)
    )
    return first.scalar_one_or_none()


async def get_membership(
    db: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
) -> OrganizationMembership | None:
    result = await db.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def require_membership(
    db: AsyncSession,
    organization_id: UUID,
    user_id: UUID,
    *,
    min_role: str = "viewer",
) -> OrganizationMembership:
    membership = await get_membership(db, organization_id, user_id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    if not role_at_least(membership.role, min_role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient organization role")
    return membership


async def count_owners(db: AsyncSession, organization_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(OrganizationMembership)
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role == "owner",
        )
    )
    return int(result.scalar() or 0)


class OrganizationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_my_orgs(self, user: User) -> list[dict[str, object]]:
        result = await self.db.execute(
            select(OrganizationMembership)
            .where(OrganizationMembership.user_id == user.id)
            .options(selectinload(OrganizationMembership.organization))
            .order_by(OrganizationMembership.created_at.asc())
        )
        rows = result.scalars().all()
        items: list[dict[str, object]] = []
        for m in rows:
            org = m.organization
            items.append(
                {
                    "id": org.id,
                    "name": org.name,
                    "slug": org.slug,
                    "kind": org.kind,
                    "sku": org.sku,
                    "role": m.role,
                    "created_at": org.created_at,
                }
            )
        return items

    async def create_org(
        self,
        user: User,
        *,
        name: str,
        slug: str | None = None,
        kind: str = "company",
    ) -> Organization:
        if kind == "personal":
            raise HTTPException(status_code=400, detail="Cannot create additional personal organizations")
        if kind not in ("company", "hotel"):
            raise HTTPException(status_code=400, detail="kind must be 'company' or 'hotel'")

        created_count_result = await self.db.execute(
            select(func.count())
            .select_from(Organization)
            .where(
                Organization.created_by_user_id == user.id,
                Organization.kind != "personal",
            )
        )
        created_count = int(created_count_result.scalar() or 0)
        if created_count >= MAX_NON_PERSONAL_ORGS_CREATED:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_NON_PERSONAL_ORGS_CREATED} non-personal organizations per user",
            )

        desired = slugify_base(slug or name)
        candidate = make_unique_slug(desired)
        for _ in range(8):
            clash = await self.db.execute(select(Organization.id).where(Organization.slug == candidate))
            if clash.scalar_one_or_none() is None:
                break
            candidate = make_unique_slug(desired)

        org = Organization(
            id=uuid.uuid4(),
            name=name.strip()[:255],
            slug=candidate,
            kind=kind,
            created_by_user_id=user.id,
        )
        self.db.add(org)
        await self.db.flush()
        self.db.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role="owner",
            )
        )
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def get_org(self, org_id: UUID, user: User) -> Organization:
        await require_membership(self.db, org_id, user.id, min_role="viewer")
        result = await self.db.execute(select(Organization).where(Organization.id == org_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    async def update_org(
        self,
        org_id: UUID,
        user: User,
        *,
        name: str | None = None,
        slug: str | None = None,
        sku: str | None = None,
    ) -> Organization:
        await require_membership(self.db, org_id, user.id, min_role="admin")
        result = await self.db.execute(select(Organization).where(Organization.id == org_id))
        org = result.scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")

        if name is not None:
            org.name = name.strip()[:255]
        if slug is not None:
            cleaned = slugify_base(slug)
            if not cleaned:
                raise HTTPException(status_code=400, detail="Invalid slug")
            clash = await self.db.execute(
                select(Organization.id).where(Organization.slug == cleaned, Organization.id != org_id)
            )
            if clash.scalar_one_or_none() is not None:
                raise HTTPException(status_code=409, detail="Slug already taken")
            org.slug = cleaned[:64]
        if sku is not None:
            if sku not in ("basic", "pro", "multi"):
                raise HTTPException(status_code=400, detail="sku must be basic, pro, or multi")
            org.sku = sku
        org.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(org)
        return org

    async def list_members(self, org_id: UUID, user: User) -> list[OrganizationMembership]:
        await require_membership(self.db, org_id, user.id, min_role="viewer")
        result = await self.db.execute(
            select(OrganizationMembership)
            .where(OrganizationMembership.organization_id == org_id)
            .options(selectinload(OrganizationMembership.user))
            .order_by(OrganizationMembership.created_at.asc())
        )
        return list(result.scalars().all())

    async def change_role(
        self,
        org_id: UUID,
        actor: User,
        target_user_id: UUID,
        new_role: str,
    ) -> OrganizationMembership:
        if new_role not in ORG_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        actor_m = await require_membership(self.db, org_id, actor.id, min_role="admin")
        target = await get_membership(self.db, org_id, target_user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")

        if new_role == "owner" and target_user_id == actor.id and actor_m.role != "owner":
            raise HTTPException(status_code=403, detail="Cannot self-promote to owner")
        if actor_m.role == "admin" and (target.role == "owner" or new_role == "owner"):
            raise HTTPException(status_code=403, detail="Admin cannot modify owner role")
        if target.role == "owner" and new_role != "owner":
            owners = await count_owners(self.db, org_id)
            if owners <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last owner")

        target.role = new_role
        target.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(target)
        return target

    async def remove_member(self, org_id: UUID, actor: User, target_user_id: UUID) -> None:
        actor_m = await require_membership(self.db, org_id, actor.id, min_role="admin")
        target = await get_membership(self.db, org_id, target_user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")

        if target.role == "owner":
            owners = await count_owners(self.db, org_id)
            if owners <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last owner")
            if actor_m.role != "owner":
                raise HTTPException(status_code=403, detail="Only owner can remove another owner")

        if actor_m.role == "admin" and target.role == "owner":
            raise HTTPException(status_code=403, detail="Admin cannot remove owner")

        await self.db.delete(target)
        await self.db.commit()

    async def leave(self, org_id: UUID, user: User) -> None:
        membership = await get_membership(self.db, org_id, user.id)
        if membership is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        if membership.role == "owner":
            owners = await count_owners(self.db, org_id)
            if owners <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Last owner cannot leave without transferring ownership",
                )
        await self.db.delete(membership)
        if user.last_active_organization_id == org_id:
            user.last_active_organization_id = None
        await self.db.commit()

    async def create_invite(
        self,
        org_id: UUID,
        actor: User,
        *,
        email: str,
        role: str,
    ) -> tuple[OrganizationInvite, str]:
        await require_membership(self.db, org_id, actor.id, min_role="admin")
        if role not in INVITE_ROLES:
            raise HTTPException(status_code=400, detail="Invite role must be admin, member, or viewer (not owner)")
        email_norm = email.strip().lower()
        if not email_norm:
            raise HTTPException(status_code=400, detail="Email required")

        existing_user = await self.db.execute(select(User).where(User.email == email_norm))
        member_user = existing_user.scalar_one_or_none()
        if member_user is not None:
            already = await get_membership(self.db, org_id, member_user.id)
            if already is not None:
                raise HTTPException(status_code=409, detail="User is already a member")

        raw, token_hash = generate_invite_token()
        invite = OrganizationInvite(
            id=uuid.uuid4(),
            organization_id=org_id,
            email=email_norm,
            role=role,
            token_hash=token_hash,
            invited_by_user_id=actor.id,
            status="pending",
            expires_at=datetime.now(UTC) + timedelta(days=INVITE_TTL_DAYS),
        )
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite, raw

    async def list_invites(self, org_id: UUID, actor: User) -> list[OrganizationInvite]:
        await require_membership(self.db, org_id, actor.id, min_role="admin")
        result = await self.db.execute(
            select(OrganizationInvite)
            .where(
                OrganizationInvite.organization_id == org_id,
                OrganizationInvite.status == "pending",
            )
            .order_by(OrganizationInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def revoke_invite(self, org_id: UUID, actor: User, invite_id: UUID) -> None:
        await require_membership(self.db, org_id, actor.id, min_role="admin")
        result = await self.db.execute(
            select(OrganizationInvite).where(
                OrganizationInvite.id == invite_id,
                OrganizationInvite.organization_id == org_id,
            )
        )
        invite = result.scalar_one_or_none()
        if invite is None:
            raise HTTPException(status_code=404, detail="Invite not found")
        invite.status = "revoked"
        invite.updated_at = datetime.now(UTC)
        await self.db.commit()

    async def accept_invite(self, user: User, raw_token: str) -> OrganizationMembership:
        token_hash = hash_invite_token(raw_token)
        result = await self.db.execute(select(OrganizationInvite).where(OrganizationInvite.token_hash == token_hash))
        invite = result.scalar_one_or_none()
        if invite is None:
            raise HTTPException(status_code=400, detail="Invalid invite token")
        if invite.status != "pending":
            raise HTTPException(status_code=400, detail="Invite is no longer pending")

        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires < datetime.now(UTC):
            invite.status = "expired"
            await self.db.commit()
            raise HTTPException(status_code=400, detail="Invite has expired")

        if invite.email.lower() != user.email.lower():
            raise HTTPException(status_code=403, detail="Invite email does not match current user")

        existing = await get_membership(self.db, invite.organization_id, user.id)
        if existing is not None:
            invite.status = "accepted"
            invite.accepted_user_id = user.id
            invite.updated_at = datetime.now(UTC)
            await self.db.commit()
            return existing

        membership = OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=invite.organization_id,
            user_id=user.id,
            role=invite.role,
        )
        self.db.add(membership)
        invite.status = "accepted"
        invite.accepted_user_id = user.id
        invite.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(membership)
        return membership

    async def switch_org(self, user: User, organization_id: UUID) -> UUID:
        await require_membership(self.db, organization_id, user.id, min_role="viewer")
        user.last_active_organization_id = organization_id
        await self.db.commit()
        return organization_id
