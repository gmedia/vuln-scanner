from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization
from app.models.user import User


def month_bounds_utc(when: datetime | None = None) -> tuple[datetime, datetime]:
    now = when.astimezone(UTC) if when else datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    last = monthrange(now.year, now.month)[1]
    end = datetime(now.year, now.month, last, 23, 59, 59, 999999, tzinfo=UTC)
    return start, end


def bank_copy(*, include: bool) -> dict[str, str | None] | None:
    if not include:
        return None
    name = (settings.invoice_bank_name or "").strip() or None
    account = (settings.invoice_bank_account or "").strip() or None
    holder = (settings.invoice_bank_holder or "").strip() or None
    if name is None and account is None and holder is None:
        return {"bank_name": None, "bank_account": None, "bank_holder": None}
    return {"bank_name": name, "bank_account": account, "bank_holder": holder}


async def next_invoice_number(db: AsyncSession, period_start: datetime) -> str:
    prefix = f"SX-{period_start.year:04d}{period_start.month:02d}-"
    result = await db.execute(select(func.count()).select_from(OrgInvoice).where(OrgInvoice.number.startswith(prefix)))
    n = int(result.scalar() or 0) + 1
    return f"{prefix}{n:04d}"


def to_item(inv: OrgInvoice, *, org_name: str | None, include_bank: bool) -> dict:
    return {
        "id": inv.id,
        "organization_id": inv.organization_id,
        "number": inv.number,
        "product": inv.product,
        "sku": inv.sku,
        "amount_idr": inv.amount_idr,
        "period_start": inv.period_start,
        "period_end": inv.period_end,
        "status": inv.status,
        "bank_ref": inv.bank_ref,
        "notes": inv.notes,
        "paid_at": inv.paid_at,
        "created_at": inv.created_at,
        "updated_at": inv.updated_at,
        "organization_name": org_name,
        "bank": bank_copy(include=include_bank),
    }


class InvoiceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_catalog(self) -> list[SkuCatalog]:
        result = await self.db.execute(select(SkuCatalog).order_by(SkuCatalog.product, SkuCatalog.sku))
        return list(result.scalars().all())

    async def update_catalog(self, product: str, sku: str, list_idr: int) -> SkuCatalog:
        result = await self.db.execute(select(SkuCatalog).where(SkuCatalog.product == product, SkuCatalog.sku == sku))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Catalog row not found")
        row.list_idr = list_idr
        row.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_scan_invoice(
        self,
        *,
        organization_id: uuid.UUID,
        sku: str,
        actor: User,
        period_start: datetime | None = None,
        notes: str = "",
    ) -> OrgInvoice:
        org = await self.db.get(Organization, organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        catalog = await self.db.execute(select(SkuCatalog).where(SkuCatalog.product == "scan", SkuCatalog.sku == sku))
        cat = catalog.scalar_one_or_none()
        if cat is None or not cat.invoicable:
            raise HTTPException(status_code=400, detail="SKU is not invoicable")
        start, end = month_bounds_utc(period_start)
        clash = await self.db.execute(
            select(OrgInvoice.id).where(
                OrgInvoice.organization_id == organization_id,
                OrgInvoice.product == "scan",
                OrgInvoice.period_start == start,
                OrgInvoice.status != "void",
            )
        )
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Scan invoice already exists for this period",
            )
        inv = OrgInvoice(
            id=uuid.uuid4(),
            organization_id=organization_id,
            number=await next_invoice_number(self.db, start),
            product="scan",
            sku=sku,
            amount_idr=int(cat.list_idr),
            period_start=start,
            period_end=end,
            status="draft",
            notes=(notes or "")[:500],
            created_by_user_id=actor.id,
        )
        self.db.add(inv)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def get(self, invoice_id: uuid.UUID) -> OrgInvoice:
        inv = await self.db.get(OrgInvoice, invoice_id)
        if inv is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return inv

    async def send(self, invoice_id: uuid.UUID) -> OrgInvoice:
        inv = await self.get(invoice_id)
        if inv.status != "draft":
            raise HTTPException(status_code=409, detail="Only draft invoices can be sent")
        inv.status = "sent"
        inv.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def mark_paid(self, invoice_id: uuid.UUID, bank_ref: str | None) -> OrgInvoice:
        inv = await self.get(invoice_id)
        if inv.status not in ("draft", "sent"):
            raise HTTPException(status_code=409, detail="Invoice cannot be marked paid")
        inv.status = "paid"
        inv.paid_at = datetime.now(UTC)
        if bank_ref is not None:
            inv.bank_ref = bank_ref.strip()[:64] or None
        if inv.product == "scan":
            org = await self.db.get(Organization, inv.organization_id)
            if org is not None:
                org.sku = inv.sku
                org.updated_at = datetime.now(UTC)
        inv.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def void(self, invoice_id: uuid.UUID) -> OrgInvoice:
        inv = await self.get(invoice_id)
        if inv.status not in ("draft", "sent"):
            raise HTTPException(status_code=409, detail="Only draft or sent invoices can be voided")
        inv.status = "void"
        inv.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def list_admin(
        self,
        *,
        status_filter: str | None,
        organization_id: uuid.UUID | None,
        page: int,
        page_size: int,
    ) -> tuple[list[tuple[OrgInvoice, str]], int]:
        q = (
            select(OrgInvoice, Organization.name)
            .join(Organization, Organization.id == OrgInvoice.organization_id)
            .order_by(OrgInvoice.created_at.desc())
        )
        count_q = select(func.count()).select_from(OrgInvoice)
        if status_filter:
            q = q.where(OrgInvoice.status == status_filter)
            count_q = count_q.where(OrgInvoice.status == status_filter)
        if organization_id is not None:
            q = q.where(OrgInvoice.organization_id == organization_id)
            count_q = count_q.where(OrgInvoice.organization_id == organization_id)
        total = int((await self.db.execute(count_q)).scalar() or 0)
        q = q.offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(q)).all()
        return [(row[0], str(row[1])) for row in rows], total

    async def list_org(self, organization_id: uuid.UUID) -> list[OrgInvoice]:
        result = await self.db.execute(
            select(OrgInvoice)
            .where(OrgInvoice.organization_id == organization_id)
            .order_by(OrgInvoice.created_at.desc())
        )
        return list(result.scalars().all())
