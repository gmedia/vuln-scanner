"""Admin AI top-up pack catalog (S1).

Deliberately **not** gated on ``AI_GATEWAY_ENABLED``: ops must be able to prepare
the catalog (and later resolve an already-paid verification queue) while the
customer-facing gateway is off. Access is platform-admin only.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.ai_topup import (
    AiTopupAdminOrderList,
    AiTopupAdminOrderOut,
    AiTopupApproveIn,
    AiTopupPackCreate,
    AiTopupPackList,
    AiTopupPackOut,
    AiTopupPackUpdate,
    AiTopupRejectIn,
    AiTopupResolveRefundIn,
)
from app.services import ai_topup as service
from app.services.auth import get_current_admin
from app.services.topup_proofs import extension_for_mime, read_proof

router = APIRouter(prefix="/admin/ai/topup", tags=["admin-ai-topup"])


@router.get("/packs", response_model=AiTopupPackList)
async def list_packs(
    active_only: bool = Query(default=False),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackList:
    rows = await service.list_packs(db, active_only=active_only)
    return AiTopupPackList(items=[AiTopupPackOut.model_validate(row) for row in rows], total=len(rows))


@router.post("/packs", response_model=AiTopupPackOut, status_code=status.HTTP_201_CREATED)
async def create_pack(
    body: AiTopupPackCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackOut:
    row = await service.create_pack(
        db,
        code=body.code,
        label=body.label,
        amount_idr=body.amount_idr,
        bonus_idr=body.bonus_idr,
        active=body.active,
        sort_order=body.sort_order,
    )
    return AiTopupPackOut.model_validate(row)


@router.patch("/packs/{pack_id}", response_model=AiTopupPackOut)
async def update_pack(
    pack_id: uuid.UUID,
    body: AiTopupPackUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackOut:
    row = await service.update_pack(
        db,
        pack_id,
        code=body.code,
        label=body.label,
        amount_idr=body.amount_idr,
        bonus_idr=body.bonus_idr,
        active=body.active,
        sort_order=body.sort_order,
    )
    return AiTopupPackOut.model_validate(row)


async def _org_names(db: AsyncSession, org_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not org_ids:
        return {}
    rows = (await db.execute(select(Organization.id, Organization.name).where(Organization.id.in_(org_ids)))).all()
    return {row.id: row.name for row in rows}


@router.get("/orders", response_model=AiTopupAdminOrderList)
async def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    organization_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupAdminOrderList:
    rows, total = await service.list_orders_admin(
        db,
        status_filter=status_filter,
        organization_id=organization_id,
        page=page,
        limit=limit,
    )
    names = await _org_names(db, {row.organization_id for row in rows})
    return AiTopupAdminOrderList(
        items=[AiTopupAdminOrderOut.from_order(row, organization_name=names.get(row.organization_id)) for row in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/orders/{order_id}", response_model=AiTopupAdminOrderOut)
async def get_order(
    order_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupAdminOrderOut:
    order = await service.get_order_by_id(db, order_id)
    org = await db.get(Organization, order.organization_id)
    return AiTopupAdminOrderOut.from_order(order, organization_name=org.name if org is not None else None)


@router.get("/orders/{order_id}/proof")
async def download_proof(
    order_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    order = await service.get_order_by_id(db, order_id)
    if order.proof_object_key is None or order.proof_mime is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proof not found")
    body = read_proof(order.proof_object_key)
    ext = extension_for_mime(order.proof_mime)
    return Response(
        content=body,
        media_type=order.proof_mime,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="topup-proof-{order.reference_code}.{ext}"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/orders/{order_id}/approve", response_model=AiTopupAdminOrderOut)
async def approve_order(
    order_id: uuid.UUID,
    body: AiTopupApproveIn,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupAdminOrderOut:
    order = await service.approve(db, order_id=order_id, admin=admin, bank_ref=body.bank_ref, force=body.force)
    org = await db.get(Organization, order.organization_id)
    return AiTopupAdminOrderOut.from_order(order, organization_name=org.name if org is not None else None)


@router.post("/orders/{order_id}/reject", response_model=AiTopupAdminOrderOut)
async def reject_order(
    order_id: uuid.UUID,
    body: AiTopupRejectIn,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupAdminOrderOut:
    order = await service.reject(db, order_id=order_id, admin=admin, reason=body.reason)
    org = await db.get(Organization, order.organization_id)
    return AiTopupAdminOrderOut.from_order(order, organization_name=org.name if org is not None else None)


@router.post("/orders/{order_id}/resolve-refund", response_model=AiTopupAdminOrderOut)
async def resolve_refund(
    order_id: uuid.UUID,
    body: AiTopupResolveRefundIn,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiTopupAdminOrderOut:
    order = await service.resolve_refund(
        db,
        order_id=order_id,
        admin=admin,
        action=body.action,
        note=body.note,
    )
    org = await db.get(Organization, order.organization_id)
    return AiTopupAdminOrderOut.from_order(order, organization_name=org.name if org is not None else None)
