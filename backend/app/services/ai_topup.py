"""AI top-up: pack catalog (S1) + manual-transfer orders (S2).

S2 covers manual-transfer orders, private proof upload and admin verification.
Midtrans checkout/webhook, the expire worker and metrics belong to later slices.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import AiTopupOrder, AiTopupPack
from app.models.billing import PaymentAttempt
from app.models.user import User
from app.services import ai_wallet
from app.services.invoice import bank_copy
from app.services.topup_proofs import MAX_PROOF_BYTES, delete_proof, save_proof, sniff_mime

MAX_CODE = 32
MAX_LABEL = 64

S2_METHODS = ("manual_transfer",)
REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
REFERENCE_RETRIES = 5
ORDER_TTL = timedelta(days=3)

PROOF_STATUSES = ("pending_payment", "awaiting_verification")
CANCELABLE_STATUSES = ("pending_payment", "awaiting_verification")


def _validate(*, code: str, label: str, amount_idr: int, bonus_idr: int) -> None:
    if not code.strip():
        raise HTTPException(status_code=422, detail="code must not be empty")
    if len(code) > MAX_CODE:
        raise HTTPException(status_code=422, detail="code is too long")
    if not label.strip():
        raise HTTPException(status_code=422, detail="label must not be empty")
    if len(label) > MAX_LABEL:
        raise HTTPException(status_code=422, detail="label is too long")
    if amount_idr < 1:
        raise HTTPException(status_code=422, detail="amount_idr must be positive")
    if bonus_idr < 0:
        raise HTTPException(status_code=422, detail="bonus_idr must be non-negative")


async def _code_taken(db: AsyncSession, code: str, *, exclude_id: UUID | None = None) -> bool:
    stmt = select(AiTopupPack.id).where(AiTopupPack.code == code)
    if exclude_id is not None:
        stmt = stmt.where(AiTopupPack.id != exclude_id)
    return (await db.execute(stmt)).first() is not None


async def list_packs(db: AsyncSession, active_only: bool = False) -> list[AiTopupPack]:
    stmt = select(AiTopupPack).order_by(AiTopupPack.sort_order, AiTopupPack.code)
    if active_only:
        stmt = stmt.where(AiTopupPack.active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def get_pack(db: AsyncSession, pack_id: UUID) -> AiTopupPack:
    row = await db.get(AiTopupPack, pack_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Top-up pack not found")
    return row


async def create_pack(
    db: AsyncSession,
    *,
    code: str,
    label: str,
    amount_idr: int,
    bonus_idr: int = 0,
    active: bool = True,
    sort_order: int = 0,
    commit: bool = True,
) -> AiTopupPack:
    _validate(code=code, label=label, amount_idr=amount_idr, bonus_idr=bonus_idr)
    if await _code_taken(db, code):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists")
    row = AiTopupPack(
        code=code,
        label=label,
        amount_idr=amount_idr,
        bonus_idr=bonus_idr,
        active=active,
        sort_order=int(sort_order),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists") from exc
    if commit:
        await db.commit()
        await db.refresh(row)
    return row


async def update_pack(
    db: AsyncSession,
    pack_id: UUID,
    *,
    code: str | None = None,
    label: str | None = None,
    amount_idr: int | None = None,
    bonus_idr: int | None = None,
    active: bool | None = None,
    sort_order: int | None = None,
    commit: bool = True,
) -> AiTopupPack:
    row = await get_pack(db, pack_id)
    new_code = code if code is not None else row.code
    new_label = label if label is not None else row.label
    new_amount = amount_idr if amount_idr is not None else row.amount_idr
    new_bonus = bonus_idr if bonus_idr is not None else row.bonus_idr
    _validate(code=new_code, label=new_label, amount_idr=new_amount, bonus_idr=new_bonus)
    if new_code != row.code and await _code_taken(db, new_code, exclude_id=row.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists")
    row.code = new_code
    row.label = new_label
    row.amount_idr = new_amount
    row.bonus_idr = new_bonus
    if active is not None:
        row.active = active
    if sort_order is not None:
        row.sort_order = int(sort_order)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Top-up pack code already exists") from exc
    if commit:
        await db.commit()
        await db.refresh(row)
    return row


def _reference_code(now: datetime) -> str:
    body = "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(6))
    return f"{now.strftime('%y%m%d')}-{body}"


def _has_bank_copy(bank: dict[str, str | None] | None) -> bool:
    return bank is not None and any(value is not None for value in bank.values())


async def create_order(
    db: AsyncSession,
    *,
    org_id: UUID,
    actor: User,
    pack_id: UUID,
    method: str,
    now: datetime,
) -> tuple[AiTopupOrder, dict[str, str | None] | None]:
    """Create a manual-transfer top-up order. S3 extends this for Midtrans."""
    if method not in S2_METHODS:
        if method == "midtrans":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Midtrans checkout is not available yet",
            )
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported payment method")

    pack = await db.get(AiTopupPack, pack_id)
    if pack is None or not pack.active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Top-up pack is not available",
        )

    bank = bank_copy(include=True)
    if not _has_bank_copy(bank):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bank transfer is not configured. Contact operations.",
        )

    actor_id = actor.id
    pack_code = pack.code
    amount_idr = int(pack.amount_idr)
    bonus_idr = int(pack.bonus_idr)

    order: AiTopupOrder | None = None
    for _ in range(REFERENCE_RETRIES):
        candidate = AiTopupOrder(
            organization_id=org_id,
            created_by_user_id=actor_id,
            pack_id=pack_id,
            pack_code=pack_code,
            reference_code=_reference_code(now),
            amount_idr=amount_idr,
            credit_idr=amount_idr + bonus_idr,
            bonus_idr=bonus_idr,
            currency="IDR",
            payment_method=method,
            status="pending_payment",
            expires_at=now + ORDER_TTL,
        )
        db.add(candidate)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            continue
        order = candidate
        break

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not allocate a top-up reference. Try again.",
        )

    await db.commit()
    await db.refresh(order)
    return order, bank


async def list_orders(
    db: AsyncSession,
    org_id: UUID,
    page: int,
    limit: int,
) -> tuple[list[AiTopupOrder], int]:
    offset = (page - 1) * limit
    total = (
        await db.execute(select(func.count()).select_from(AiTopupOrder).where(AiTopupOrder.organization_id == org_id))
    ).scalar() or 0
    rows = (
        (
            await db.execute(
                select(AiTopupOrder)
                .where(AiTopupOrder.organization_id == org_id)
                .order_by(AiTopupOrder.created_at.desc(), AiTopupOrder.id.desc())
                .offset(offset)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


async def get_order(db: AsyncSession, org_id: UUID, order_id: UUID) -> AiTopupOrder:
    row = await db.get(AiTopupOrder, order_id)
    if row is None or row.organization_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Top-up order not found")
    return row


async def get_order_by_id(db: AsyncSession, order_id: UUID) -> AiTopupOrder:
    row = await db.get(AiTopupOrder, order_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Top-up order not found")
    return row


async def list_orders_admin(
    db: AsyncSession,
    *,
    status_filter: str | None,
    organization_id: UUID | None,
    page: int,
    limit: int,
) -> tuple[list[AiTopupOrder], int]:
    conditions = []
    if status_filter:
        conditions.append(AiTopupOrder.status == status_filter)
    if organization_id is not None:
        conditions.append(AiTopupOrder.organization_id == organization_id)

    count_stmt = select(func.count()).select_from(AiTopupOrder)
    rows_stmt = select(AiTopupOrder)
    for condition in conditions:
        count_stmt = count_stmt.where(condition)
        rows_stmt = rows_stmt.where(condition)

    total = (await db.execute(count_stmt)).scalar() or 0
    rows = (
        (
            await db.execute(
                rows_stmt.order_by(AiTopupOrder.created_at.desc(), AiTopupOrder.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), int(total)


async def _order_for_update(db: AsyncSession, order_id: UUID, *, org_id: UUID | None = None) -> AiTopupOrder:
    stmt = select(AiTopupOrder).where(AiTopupOrder.id == order_id)
    if org_id is not None:
        stmt = stmt.where(AiTopupOrder.organization_id == org_id)
    row = (await db.execute(stmt.with_for_update())).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Top-up order not found")
    return row


async def _pending_attempts(db: AsyncSession, order_id: UUID) -> list[PaymentAttempt]:
    rows = (
        (
            await db.execute(
                select(PaymentAttempt).where(
                    PaymentAttempt.topup_order_id == order_id,
                    PaymentAttempt.status == "pending",
                )
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def submit_proof(
    db: AsyncSession,
    *,
    order_id: UUID,
    org_id: UUID,
    actor: User,
    upload: UploadFile,
) -> AiTopupOrder:
    del actor
    order = await _order_for_update(db, order_id, org_id=org_id)
    if order.status not in PROOF_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Proof can only be uploaded while payment is pending or awaiting verification",
        )

    data = await upload.read(MAX_PROOF_BYTES + 1)
    if len(data) > MAX_PROOF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Proof file is too large (max 5 MB)",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Proof file is empty")

    mime = sniff_mime(data)
    if mime is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Proof must be a JPEG, PNG, WEBP or PDF file",
        )

    previous_ref = order.proof_object_key
    new_ref = save_proof(org_id, order.id, data, mime)
    try:
        order.proof_object_key = new_ref
        order.proof_mime = mime
        order.proof_size_bytes = len(data)
        order.proof_uploaded_at = datetime.now(UTC)
        order.status = "awaiting_verification"
        await db.commit()
    except Exception:
        await db.rollback()
        delete_proof(new_ref)
        raise

    if previous_ref and previous_ref != new_ref:
        delete_proof(previous_ref)

    await db.refresh(order)
    return order


async def approve(
    db: AsyncSession,
    *,
    order_id: UUID,
    admin: User,
    bank_ref: str | None,
    force: bool,
) -> AiTopupOrder:
    now = datetime.now(UTC)
    order = await _order_for_update(db, order_id)
    if order.status == "paid":
        return order
    if order.status != "awaiting_verification":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order is not awaiting verification",
        )

    pending = await _pending_attempts(db, order.id)
    if pending and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"pending gateway attempt {pending[0].id}",
        )
    for attempt in pending:
        # PAYMENT_ATTEMPT_STATUSES has no "canceled"; expire locally for now.
        attempt.status = "expired"
        attempt.provider_status = "expired"
        attempt.updated_at = now

    admin_id = admin.id
    try:
        await ai_wallet.credit(
            db,
            organization_id=order.organization_id,
            amount_idr=order.credit_idr,
            kind="topup",
            topup_order_id=order.id,
            actor_user_id=admin_id,
            note=order.reference_code,
            commit=False,
        )
        db.add(
            PaymentAttempt(
                provider="manual",
                payable_kind="topup",
                topup_order_id=order.id,
                organization_id=order.organization_id,
                amount_idr=order.amount_idr,
                status="succeeded",
                method="bank_transfer",
                provider_ref=bank_ref or order.reference_code,
                succeeded_at=now,
                created_by_user_id=admin_id,
            )
        )
        order.status = "paid"
        order.paid_at = now
        order.verified_by_user_id = admin_id
        order.verified_at = now
        order.bank_ref = bank_ref
        await db.commit()
    except IntegrityError:
        await db.rollback()
        current = await _order_for_update(db, order_id)
        if current.status == "paid":
            return current
        raise

    await db.refresh(order)
    return order


async def reject(
    db: AsyncSession,
    *,
    order_id: UUID,
    admin: User,
    reason: str,
) -> AiTopupOrder:
    order = await _order_for_update(db, order_id)
    if order.status == "rejected":
        return order
    if order.status != "awaiting_verification":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order is not awaiting verification",
        )

    order.status = "rejected"
    order.rejection_reason = reason
    order.verified_by_user_id = admin.id
    order.verified_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(order)
    return order


async def cancel(
    db: AsyncSession,
    *,
    order_id: UUID,
    org_id: UUID,
    actor: User,
) -> AiTopupOrder:
    del actor
    order = await _order_for_update(db, order_id, org_id=org_id)
    if order.status == "canceled":
        return order
    if order.status not in CANCELABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order can no longer be canceled",
        )

    now = datetime.now(UTC)
    order.status = "canceled"
    for attempt in await _pending_attempts(db, order.id):
        # No provider cancellation in S2; expire the local attempt (S3 extends this).
        attempt.status = "expired"
        attempt.provider_status = "expired"
        attempt.updated_at = now
    await db.commit()
    await db.refresh(order)
    return order
