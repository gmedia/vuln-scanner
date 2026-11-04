"""Promo code CRUD, validation, redemption and quota accounting.

The service owns the promo transaction rules. It deliberately does **not**
import ``InvoiceService``: invoice creation calls *into* this module, and the
reverse import would create a cycle (``invoice`` -> ``promo`` is one-way).

A quote is a value object. ``lock_and_quote`` re-reads every rule under a
``SELECT ... FOR UPDATE`` on the promo row so two concurrent invoices cannot
both consume the last redemption. ``record_redemption`` / ``release_for_invoice``
never commit; the invoice owns the transaction.
"""

from __future__ import annotations

import builtins
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import OrgInvoice
from app.models.organization import Organization
from app.models.promo import (
    PROMO_CODE_PATTERN,
    PromoCode,
    PromoCodeHistory,
    PromoRedemption,
)
from app.models.user import User
from app.schemas.promo import PromoCodeCreate, PromoCodeUpdate
from app.services.invoice_math import as_utc
from app.services.promo_math import discount_for

_IMMUTABLE_TERMS = (
    "kind",
    "percent_off_bp",
    "amount_idr",
    "max_discount_idr",
    "min_amount_idr",
    "applies_to_sku",
    "applies_to_product",
)

@dataclass(frozen=True)
class PromoQuote:
    promo: PromoCode
    discount_idr: int
    organization_id: uuid.UUID

def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

def _invalid() -> HTTPException:
    """Generic failure so a code is hard to enumerate."""
    return _bad_request("Promo code is not valid for this purchase")

def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promo code not found")

def _normalize(code: str) -> str:
    value = (code or "").strip().upper()
    if re.fullmatch(PROMO_CODE_PATTERN, value) is None:
        raise _invalid()
    return value

def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return as_utc(value).isoformat()
    return value

def _changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        field: {"from": _json_value(before.get(field)), "to": _json_value(value)}
        for field, value in after.items()
        if before.get(field) != value
    }

def _check_window(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is not None and ends_at is not None and as_utc(ends_at) <= as_utc(starts_at):
        raise _bad_request("ends_at must be after starts_at")

def _check_kind(kind: str, percent_off_bp: int | None, amount_idr: int | None) -> None:
    if kind == "percent":
        if percent_off_bp is None or amount_idr is not None:
            raise _bad_request("percent promos require percent_off_bp and no amount_idr")
    elif kind == "fixed":
        if amount_idr is None or percent_off_bp is not None:
            raise _bad_request("fixed promos require amount_idr and no percent_off_bp")
    else:
        raise _bad_request("kind must be 'percent' or 'fixed'")

def _window_clause(now: datetime) -> Any:
    return (
        or_(PromoCode.starts_at.is_(None), PromoCode.starts_at <= now),
        or_(PromoCode.ends_at.is_(None), PromoCode.ends_at >= now),
    )

def _redemption_values(promo: PromoCode) -> dict[str, Any]:
    return {
        "code": promo.code,
        "description": promo.description,
        "kind": promo.kind,
        "percent_off_bp": promo.percent_off_bp,
        "amount_idr": promo.amount_idr,
        "min_amount_idr": promo.min_amount_idr,
        "max_discount_idr": promo.max_discount_idr,
        "applies_to_sku": promo.applies_to_sku,
        "applies_to_product": promo.applies_to_product,
        "starts_at": promo.starts_at,
        "ends_at": promo.ends_at,
        "max_redemptions": promo.max_redemptions,
        "max_redemptions_per_org": promo.max_redemptions_per_org,
    }

class PromoService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --- reads -----------------------------------------------------------
    async def get(self, promo_id: uuid.UUID) -> PromoCode:
        promo = await self.db.get(PromoCode, promo_id)
        if promo is None:
            raise _not_found()
        return promo

    async def list(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        status_filter: str | None = None,
        q: str | None = None,
    ) -> tuple[builtins.list[PromoCode], int]:
        now = datetime.now(UTC)
        filters: list[Any] = []
        if status_filter == "active":
            filters.append(PromoCode.active.is_(True))
        elif status_filter == "inactive":
            filters.append(PromoCode.active.is_(False))
        elif status_filter == "expired":
            filters.append(PromoCode.ends_at.is_not(None))
            filters.append(PromoCode.ends_at < now)
        elif status_filter == "scheduled":
            filters.append(PromoCode.starts_at.is_not(None))
            filters.append(PromoCode.starts_at > now)
        if q:
            like = f"%{q.strip()}%"
            filters.append(
                or_(PromoCode.code.ilike(like), PromoCode.description.ilike(like))
            )

        count_q = select(func.count()).select_from(PromoCode)
        list_q = select(PromoCode).order_by(
            PromoCode.created_at.desc(), PromoCode.id.desc()
        )
        if filters:
            count_q = count_q.where(*filters)
            list_q = list_q.where(*filters)
        total = int((await self.db.execute(count_q)).scalar() or 0)
        rows = (
            (
                await self.db.execute(
                    list_q.offset((page - 1) * page_size).limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return list(rows), total

    async def history(
        self, promo_id: uuid.UUID, *, page: int = 1, page_size: int = 20
    ) -> tuple[builtins.list[tuple[PromoCodeHistory, str | None]], int]:
        total = int(
            await self.db.scalar(
                select(func.count())
                .select_from(PromoCodeHistory)
                .where(PromoCodeHistory.promo_code_id == promo_id)
            )
            or 0
        )
        stmt = (
            select(PromoCodeHistory, User.email)
            .outerjoin(User, PromoCodeHistory.actor_user_id == User.id)
            .where(PromoCodeHistory.promo_code_id == promo_id)
            .order_by(PromoCodeHistory.created_at.desc(), PromoCodeHistory.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self.db.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows], total

    async def redemptions(
        self, promo_id: uuid.UUID, *, page: int = 1, page_size: int = 20
    ) -> tuple[builtins.list[tuple[PromoRedemption, str | None, str | None]], int]:
        total = int(
            await self.db.scalar(
                select(func.count())
                .select_from(PromoRedemption)
                .where(PromoRedemption.promo_code_id == promo_id)
            )
            or 0
        )
        stmt = (
            select(PromoRedemption, Organization.name, OrgInvoice.number)
            .outerjoin(
                Organization, PromoRedemption.organization_id == Organization.id
            )
            .outerjoin(OrgInvoice, PromoRedemption.invoice_id == OrgInvoice.id)
            .where(PromoRedemption.promo_code_id == promo_id)
            .order_by(
                PromoRedemption.created_at.desc(), PromoRedemption.id.desc()
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self.db.execute(stmt)).all()
        return [(row[0], row[1], row[2]) for row in rows], total

    async def _applied_count(
        self, promo_id: uuid.UUID, organization_id: uuid.UUID | None = None
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(PromoRedemption)
            .where(
                PromoRedemption.promo_code_id == promo_id,
                PromoRedemption.status == "applied",
            )
        )
        if organization_id is not None:
            stmt = stmt.where(PromoRedemption.organization_id == organization_id)
        return int((await self.db.scalar(stmt)) or 0)

    async def _get_by_code(self, code: str, *, lock: bool = False) -> PromoCode | None:
        stmt = select(PromoCode).where(PromoCode.code == _normalize(code))
        if lock:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt.limit(1))).scalar_one_or_none()

    async def _check_eligible(
        self,
        promo: PromoCode,
        *,
        product: str,
        sku: str,
        cycle: str,
        base_list_idr: int,
        org_id: uuid.UUID,
        now: datetime,
    ) -> int:
        if cycle == "annual":
            raise _invalid()
        if not promo.active:
            raise _invalid()
        if promo.starts_at is not None and as_utc(promo.starts_at) > as_utc(now):
            raise _invalid()
        if promo.ends_at is not None and as_utc(promo.ends_at) < as_utc(now):
            raise _invalid()
        if promo.applies_to_product is not None and promo.applies_to_product != product:
            raise _invalid()
        if promo.applies_to_sku is not None and promo.applies_to_sku != sku:
            raise _invalid()
        if int(base_list_idr) < int(promo.min_amount_idr):
            raise _invalid()
        if promo.max_redemptions is not None and (
            await self._applied_count(promo.id)
        ) >= promo.max_redemptions:
            raise _invalid()
        if await self._applied_count(promo.id, org_id) >= promo.max_redemptions_per_org:
            raise _invalid()
        return discount_for(
            int(base_list_idr),
            kind=promo.kind,
            percent_off_bp=promo.percent_off_bp,
            amount_idr=promo.amount_idr,
            max_discount_idr=promo.max_discount_idr,
        )

    async def validate(
        self,
        code: str,
        *,
        product: str,
        sku: str,
        cycle: str,
        base_list_idr: int,
        org_id: uuid.UUID,
        now: datetime,
    ) -> PromoQuote:
        promo = await self._get_by_code(code)
        if promo is None:
            raise _invalid()
        discount = await self._check_eligible(
            promo,
            product=product,
            sku=sku,
            cycle=cycle,
            base_list_idr=base_list_idr,
            org_id=org_id,
            now=now,
        )
        return PromoQuote(
            promo=promo, discount_idr=discount, organization_id=org_id
        )

    async def lock_and_quote(
        self,
        code: str,
        *,
        product: str,
        sku: str,
        cycle: str,
        base_list_idr: int,
        org_id: uuid.UUID,
        now: datetime,
    ) -> PromoQuote:
        promo = await self._get_by_code(code, lock=True)
        if promo is None:
            raise _invalid()
        discount = await self._check_eligible(
            promo,
            product=product,
            sku=sku,
            cycle=cycle,
            base_list_idr=base_list_idr,
            org_id=org_id,
            now=now,
        )
        return PromoQuote(
            promo=promo, discount_idr=discount, organization_id=org_id
        )

    async def has_active_codes(self, org_id: uuid.UUID) -> bool:
        """True when at least one code is active, in-window and not exhausted."""
        now = datetime.now(UTC)
        applied = (
            select(func.count(PromoRedemption.id))
            .where(
                PromoRedemption.promo_code_id == PromoCode.id,
                PromoRedemption.status == "applied",
            )
            .correlate(PromoCode)
            .scalar_subquery()
        )
        stmt = (
            select(PromoCode.id)
            .where(
                PromoCode.active.is_(True),
                *_window_clause(now),
                or_(
                    PromoCode.max_redemptions.is_(None),
                    applied < PromoCode.max_redemptions,
                ),
            )
            .limit(1)
        )
        # ``org_id`` is part of the contract so a future per-org private-code
        # mode can filter here without changing callers.
        _ = org_id
        return (await self.db.scalar(stmt)) is not None

    # --- mutations -------------------------------------------------------
    def _record_history(
        self,
        promo_id: uuid.UUID,
        action: str,
        actor: User | None,
        changes: dict[str, dict[str, Any]],
    ) -> None:
        self.db.add(
            PromoCodeHistory(
                promo_code_id=promo_id,
                action=action,
                actor_user_id=actor.id if actor is not None else None,
                changes=changes,
            )
        )

    async def _has_redemptions(self, promo_id: uuid.UUID) -> bool:
        return (
            await self.db.scalar(
                select(PromoRedemption.id)
                .where(PromoRedemption.promo_code_id == promo_id)
                .limit(1)
            )
            is not None
        )

    async def create(self, body: PromoCodeCreate, actor: User) -> PromoCode:
        _check_kind(body.kind, body.percent_off_bp, body.amount_idr)
        _check_window(body.starts_at, body.ends_at)
        if await self._get_by_code(body.code) is not None:
            raise _conflict(f"Promo code '{body.code}' already exists")
        now = datetime.now(UTC)
        promo = PromoCode(
            code=body.code,
            description=body.description.strip(),
            kind=body.kind,
            percent_off_bp=body.percent_off_bp,
            amount_idr=body.amount_idr,
            min_amount_idr=body.min_amount_idr,
            max_discount_idr=body.max_discount_idr,
            applies_to_sku=body.applies_to_sku,
            applies_to_product=body.applies_to_product,
            starts_at=as_utc(body.starts_at) if body.starts_at else None,
            ends_at=as_utc(body.ends_at) if body.ends_at else None,
            max_redemptions=body.max_redemptions,
            max_redemptions_per_org=body.max_redemptions_per_org,
            active=True,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(promo)
        await self.db.flush()
        self._record_history(
            promo.id,
            "created",
            actor,
            {field: {"from": None, "to": _json_value(value)} for field, value in _redemption_values(promo).items()},
        )
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict(f"Promo code '{body.code}' already exists") from exc
        await self.db.refresh(promo)
        return promo

    async def update(
        self, promo_id: uuid.UUID, body: PromoCodeUpdate, actor: User
    ) -> PromoCode:
        promo = await self.get(promo_id)
        present = body.model_fields_set
        if "code" in present and body.code is not None and body.code != promo.code:
            raise _conflict("code is immutable; create a new promo code instead")

        has_redemptions = await self._has_redemptions(promo.id)
        before = _redemption_values(promo)

        values = dict(before)
        if "description" in present and body.description is not None:
            values["description"] = body.description.strip()
        if "kind" in present:
            if body.kind is None:
                raise _bad_request("kind cannot be null")
            values["kind"] = body.kind
        for field in (
            "percent_off_bp",
            "amount_idr",
            "min_amount_idr",
            "max_discount_idr",
            "applies_to_sku",
            "applies_to_product",
            "starts_at",
            "ends_at",
            "max_redemptions",
            "max_redemptions_per_org",
        ):
            if field in present:
                value = getattr(body, field)
                if field in ("starts_at", "ends_at") and value is not None:
                    value = as_utc(value)
                values[field] = value

        if has_redemptions:
            for field in _IMMUTABLE_TERMS:
                if values[field] != before[field]:
                    raise _conflict(
                        f"{field} is immutable after the first redemption"
                    )

        _check_kind(values["kind"], values["percent_off_bp"], values["amount_idr"])
        _check_window(values["starts_at"], values["ends_at"])

        for field, value in values.items():
            setattr(promo, field, value)
        promo.updated_by_user_id = actor.id
        promo.updated_at = datetime.now(UTC)

        changes = _changes(before, values)
        if changes:
            self._record_history(promo.id, "updated", actor, changes)

        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict("Promo code update violates a unique constraint") from exc
        await self.db.refresh(promo)
        return promo

    async def deactivate(self, promo_id: uuid.UUID, actor: User) -> PromoCode:
        promo = await self.get(promo_id)
        previous = promo.active
        promo.active = False
        promo.updated_by_user_id = actor.id
        promo.updated_at = datetime.now(UTC)
        self._record_history(
            promo.id, "deactivated", actor, {"active": {"from": previous, "to": False}}
        )
        await self.db.commit()
        await self.db.refresh(promo)
        return promo

    async def reactivate(self, promo_id: uuid.UUID, actor: User) -> PromoCode:
        promo = await self.get(promo_id)
        previous = promo.active
        promo.active = True
        promo.updated_by_user_id = actor.id
        promo.updated_at = datetime.now(UTC)
        self._record_history(
            promo.id, "reactivated", actor, {"active": {"from": previous, "to": True}}
        )
        await self.db.commit()
        await self.db.refresh(promo)
        return promo

    async def delete(self, promo_id: uuid.UUID, actor: User) -> None:
        promo = await self.get(promo_id)
        if await self._has_redemptions(promo.id):
            raise _conflict(
                "Promo code has redemptions and cannot be deleted; deactivate it instead"
            )
        self._record_history(
            promo.id,
            "deleted",
            actor,
            {
                field: {"from": _json_value(value), "to": None}
                for field, value in _redemption_values(promo).items()
            },
        )
        await self.db.delete(promo)
        await self.db.commit()

    # --- ledger (caller owns the transaction) ----------------------------
    async def record_redemption(
        self,
        quote: PromoQuote,
        *,
        invoice_id: uuid.UUID,
        actor: User,
        subscription_request_id: uuid.UUID | None = None,
    ) -> PromoRedemption:
        redemption = PromoRedemption(
            promo_code_id=quote.promo.id,
            organization_id=quote.organization_id,
            invoice_id=invoice_id,
            subscription_request_id=subscription_request_id,
            code_snapshot=quote.promo.code,
            discount_idr=quote.discount_idr,
            status="applied",
            created_by_user_id=actor.id,
            created_at=datetime.now(UTC),
        )
        self.db.add(redemption)
        await self.db.flush()
        return redemption

    async def release_for_invoice(self, invoice_id: uuid.UUID) -> None:
        redemption = (
            await self.db.execute(
                select(PromoRedemption)
                .where(
                    PromoRedemption.invoice_id == invoice_id,
                    PromoRedemption.status == "applied",
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if redemption is None:
            return
        redemption.status = "released"
        redemption.released_at = datetime.now(UTC)
        await self.db.flush()

__all__ = ["PromoQuote", "PromoService"]
