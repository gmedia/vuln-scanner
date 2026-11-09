from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.i18n import DEFAULT_LOCALE, AppLocale
from app.models.billing import OrgBillingProfile, PaymentAttempt
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization
from app.models.promo import PromoRedemption
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.services.invoice_html import render_invoice_html
from app.services.invoice_math import (
    as_utc as _as_utc,
)
from app.services.invoice_math import (
    period_bounds_utc,
    price_breakdown,
)
from app.services.promo import PromoQuote, PromoService
from app.services.scan_pdf import ScanPdfUnavailableError, render_scan_pdf
from app.services.sku_tier import SkuTierService, record_tier_assignment


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
    """Return the next invoice number for the period's month prefix.

    ``MAX(number) + 1`` rather than ``COUNT(*) + 1``: the prefix already encodes
    year+month, so the numeric suffix resets each month, and counting rows makes
    two different organizations collide on ``uq_org_invoices_number`` as soon as
    one invoice in the month was voided/deleted (count drops while numbers stay).
    """
    prefix = f"SX-{period_start.year:04d}{period_start.month:02d}-"
    result = await db.execute(
        select(func.max(OrgInvoice.number)).where(OrgInvoice.number.startswith(prefix))
    )
    latest = result.scalar()
    n = int(str(latest)[-4:]) + 1 if latest else 1
    return f"{prefix}{n:04d}"


async def to_item(
    inv: OrgInvoice, *, org_name: str | None, include_bank: bool, db: AsyncSession
) -> dict[str, object]:
    seats = await SkuTierService(db).product_limit(inv.sku, inv.product)
    return {
        "id": inv.id,
        "organization_id": inv.organization_id,
        "number": inv.number,
        "product": inv.product,
        "sku": inv.sku,
        "subscription_request_id": inv.subscription_request_id,
        "seats": seats,
        "amount_idr": inv.amount_idr,
        "discount_idr": inv.discount_idr,
        "promo_code": inv.promo_code,
        "dpp_idr": inv.dpp_idr,
        "ppn_idr": inv.ppn_idr,
        "pph23_idr": inv.pph23_idr,
        "total_idr": inv.total_idr,
        "period_start": inv.period_start,
        "period_end": inv.period_end,
        "due_date": inv.due_date,
        "sent_at": inv.sent_at,
        "status": inv.status,
        "bank_ref": inv.bank_ref,
        "notes": inv.notes,
        "paid_at": inv.paid_at,
        "paid_by_user_id": inv.paid_by_user_id,
        "sent_by_user_id": inv.sent_by_user_id,
        "voided_by_user_id": inv.voided_by_user_id,
        "void_reason": inv.void_reason,
        "voided_at": inv.voided_at,
        "created_at": inv.created_at,
        "updated_at": inv.updated_at,
        "organization_name": org_name,
        "bank": bank_copy(include=include_bank),
    }


async def invoice_pdf_response(
    inv: OrgInvoice, *, org_name: str | None, db: AsyncSession, locale: AppLocale = DEFAULT_LOCALE
) -> Response:
    service = SkuTierService(db)
    sku_label = await service.label(inv.sku)
    seats = await service.product_limit(inv.sku, inv.product)
    html = render_invoice_html(
        inv,
        org_name=org_name,
        bank=bank_copy(include=inv.status == "sent"),
        locale=locale,
        sku_label=sku_label,
        seats=seats,
    )
    try:
        pdf = render_scan_pdf(html)
    except ScanPdfUnavailableError as exc:
        raise HTTPException(status_code=503, detail="PDF rendering unavailable") from exc
    filename = f'attachment; filename="invoice_{inv.number}.pdf"'
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": filename},
    )


class InvoiceService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_catalog(self) -> list[SkuCatalog]:
        result = await self.db.execute(select(SkuCatalog).order_by(SkuCatalog.product, SkuCatalog.sku))
        return list(result.scalars().all())

    async def list_catalog_with_actors(self) -> list[tuple[SkuCatalog, str | None]]:
        result = await self.db.execute(
            select(SkuCatalog, User.email)
            .outerjoin(User, SkuCatalog.updated_by == User.id)
            .order_by(SkuCatalog.product, SkuCatalog.sku)
        )
        return [(row[0], row[1]) for row in result.all()]

    async def update_catalog(
        self,
        product: str,
        sku: str,
        list_idr: int,
        invoicable: bool | None = None,
        actor_user_id: uuid.UUID | None = None,
    ) -> SkuCatalog:
        # SkuTierService owns the only write to sku_catalog prices. The import
        # is kept function-local so this delegation does not depend on module
        # import order (mirrors the lazy imports used elsewhere in this file).
        from app.services.sku_tier import SkuTierService

        return await SkuTierService(self.db).update_catalog_price(
            product,
            sku,
            list_idr,
            invoicable,
            actor_user_id,
        )

    async def create_invoice(
        self,
        *,
        organization_id: uuid.UUID,
        sku: str,
        actor: User,
        product: str = "scan",
        period_start: datetime | None = None,
        due_date: datetime | None = None,
        cycle: str = "monthly",
        notes: str = "",
        promo_code: str | None = None,
        subscription_request_id: uuid.UUID | None = None,
    ) -> OrgInvoice:
        # Read the id while the actor is live. ``rollback()`` below expires every
        # ORM instance regardless of ``expire_on_commit``, so a sync ``actor.id``
        # on a later attempt would trigger a lazy load and raise MissingGreenlet.
        actor_id = actor.id
        for attempt in range(3):
            try:
                return await self._create_invoice_once(
                    organization_id=organization_id,
                    sku=sku,
                    actor=actor,
                    product=product,
                    period_start=period_start,
                    due_date=due_date,
                    cycle=cycle,
                    notes=notes,
                    promo_code=promo_code,
                    subscription_request_id=subscription_request_id,
                )
            except IntegrityError as exc:
                await self.db.rollback()
                if attempt == 2:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Could not allocate a unique invoice number",
                    ) from exc
                reloaded = await self.db.get(User, actor_id)
                if reloaded is None:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Acting user no longer exists",
                    ) from exc
                actor = reloaded
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not allocate a unique invoice number",
        )

    async def _create_invoice_once(
        self,
        *,
        organization_id: uuid.UUID,
        sku: str,
        actor: User,
        product: str = "scan",
        period_start: datetime | None = None,
        due_date: datetime | None = None,
        cycle: str = "monthly",
        notes: str = "",
        promo_code: str | None = None,
        subscription_request_id: uuid.UUID | None = None,
    ) -> OrgInvoice:
        # Serialize invoice creation per organization. This closes both the
        # same-period race and any promo per-org limit race in one lock.
        org = (
            await self.db.execute(
                select(Organization)
                .where(Organization.id == organization_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        catalog = await self.db.execute(select(SkuCatalog).where(SkuCatalog.product == product, SkuCatalog.sku == sku))
        cat = catalog.scalar_one_or_none()
        if cat is None or not cat.invoicable:
            raise HTTPException(status_code=400, detail="SKU is not invoicable")
        tier = await SkuTierService(self.db).get(sku)
        if not tier.active and org.sku != sku:
            raise HTTPException(status_code=400, detail="Tier is retired")
        start, end = period_bounds_utc(period_start, cycle)
        profile = await self.db.get(OrgBillingProfile, organization_id)
        if due_date is not None:
            due = _as_utc(due_date)
        else:
            term_days = (
                profile.payment_terms_days
                if profile is not None
                else settings.invoice_default_term_days
            )
            # A monthly period starts on the 1st, so a mid-month manual invoice
            # would otherwise be born overdue. Never backdate the computed due.
            computed_due = start + timedelta(days=max(0, term_days))
            due = max(computed_due, datetime.now(UTC))

        base_list_idr = int(cat.list_idr)
        if cycle == "annual" and promo_code:
            raise HTTPException(status_code=400, detail="Promo codes cannot be applied to annual invoices")
        quote: PromoQuote | None = None
        if promo_code:
            quote = await PromoService(self.db).lock_and_quote(
                promo_code,
                product=product,
                sku=sku,
                cycle=cycle,
                base_list_idr=base_list_idr,
                org_id=organization_id,
                now=datetime.now(UTC),
            )

        if subscription_request_id is not None:
            request = await self.db.get(SubscriptionRequest, subscription_request_id)
            if request is None or request.organization_id != organization_id:
                raise HTTPException(status_code=404, detail="Subscription request not found")
            if request.status not in ("pending", "approved"):
                raise HTTPException(status_code=409, detail="Subscription request cannot be consumed")
            linked = await self.db.scalar(
                select(OrgInvoice.id)
                .where(
                    OrgInvoice.subscription_request_id == subscription_request_id,
                    OrgInvoice.status != "void",
                )
                .limit(1)
            )
            if linked is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Subscription request already has an invoice",
                )
            consumed = await self.db.scalar(
                select(PromoRedemption.id)
                .where(PromoRedemption.subscription_request_id == subscription_request_id)
                .limit(1)
            )
            if consumed is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Subscription request was already used for a promo redemption",
                )

        # Overlap, not exact-start: an annual invoice must not coexist with a
        # monthly invoice covering part of the same period (double billing).
        clash = await self.db.execute(
            select(OrgInvoice.id).where(
                OrgInvoice.organization_id == organization_id,
                OrgInvoice.product == product,
                OrgInvoice.status != "void",
                OrgInvoice.period_start <= end,
                OrgInvoice.period_end >= start,
            )
        )
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{product.capitalize()} invoice already exists for this period",
            )
        discount = quote.discount_idr if quote is not None else 0
        prices = price_breakdown(
            base_list_idr,
            annual=cycle == "annual",
            pkp=profile is not None and profile.pkp_status == "pkp",
            discount_idr=discount,
        )
        base = prices["amount"]
        dpp = prices["dpp"]
        ppn = prices["ppn"]
        pph23 = prices["pph23"]
        total = prices["total"]

        inv = OrgInvoice(
            id=uuid.uuid4(),
            organization_id=organization_id,
            number=await next_invoice_number(self.db, start),
            product=product,
            sku=sku,
            subscription_request_id=subscription_request_id,
            amount_idr=base,
            discount_idr=prices["discount"],
            promo_code=quote.promo.code if quote is not None else None,
            dpp_idr=dpp,
            ppn_idr=ppn,
            pph23_idr=pph23,
            total_idr=total,
            period_start=start,
            period_end=end,
            due_date=due,
            status="draft",
            notes=(notes or "")[:500],
            created_by_user_id=actor.id,
        )

        try:
            self.db.add(inv)
            await self.db.flush()

            if subscription_request_id is not None:
                # Consume the request in the invoice transaction so the admin
                # queue stops offering it. Status/actor/note only: the discount
                # still comes from ``promo_code`` and activation still happens
                # through the payment flow, never here.
                request = await self.db.get(SubscriptionRequest, subscription_request_id)
                if request is None:
                    raise HTTPException(status_code=404, detail="Subscription request not found")
                now = datetime.now(UTC)
                request.status = "approved"
                request.resolved_by_user_id = actor.id
                request.resolved_at = now
                request.resolution_note = (
                    f"Invoiced as {inv.number}"
                    if not request.resolution_note
                    else f"{request.resolution_note} | Invoiced as {inv.number}"
                )[:500]
                request.updated_at = now

            if quote is not None:
                await PromoService(self.db).record_redemption(
                    quote,
                    invoice_id=inv.id,
                    actor=actor,
                    subscription_request_id=subscription_request_id,
                )

            if total == 0:
                now = datetime.now(UTC)
                inv.status = "paid"
                inv.paid_at = now
                inv.updated_at = now
                if product == "scan":
                    # Imported here to avoid the invoice <-> billing cycle.
                    from app.services.billing import BillingService

                    await BillingService(self.db).activate_from_invoice(
                        inv,
                        provider="promo",
                        provider_ref=f"promo:{quote.promo.code}" if quote else "promo",
                    )
                self.db.add(
                    PaymentAttempt(
                        organization_id=organization_id,
                        invoice_id=inv.id,
                        provider="promo",
                        method="promo",
                        amount_idr=0,
                        currency="IDR",
                        status="succeeded",
                        succeeded_at=now,
                        created_by_user_id=actor.id,
                    )
                )

            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await self.db.refresh(inv)
        return inv

    async def get(self, invoice_id: uuid.UUID) -> OrgInvoice:
        inv = await self.db.get(OrgInvoice, invoice_id)
        if inv is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return inv

    async def _get_for_update(self, invoice_id: uuid.UUID) -> OrgInvoice:
        """Load an invoice under a row lock for a state transition.

        Two concurrent "mark paid" requests must not both observe ``draft|sent``
        and both transition the row; the second waits for the first to commit
        and then sees ``paid``. SQLite ignores ``FOR UPDATE`` (tests), Postgres
        honours it (prod).
        """
        inv = (
            await self.db.execute(
                select(OrgInvoice).where(OrgInvoice.id == invoice_id).with_for_update()
            )
        ).scalar_one_or_none()
        if inv is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return inv

    async def send(self, invoice_id: uuid.UUID, *, actor_id: uuid.UUID | None = None) -> OrgInvoice:
        inv = await self.get(invoice_id)
        if inv.status != "draft":
            raise HTTPException(status_code=409, detail="Only draft invoices can be sent")
        inv.status = "sent"
        inv.sent_at = inv.sent_at or datetime.now(UTC)
        inv.sent_by_user_id = actor_id
        inv.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def _mark_paid(
        self,
        invoice_id: uuid.UUID,
        bank_ref: str | None,
        *,
        actor_id: uuid.UUID | None = None,
    ) -> OrgInvoice:
        """Apply the paid transition without committing.

        The gateway path needs to mark the invoice paid and activate the
        subscription in one transaction; the public wrapper keeps the original
        commit+refresh contract for every existing caller. Gateway callers pass
        no actor, leaving ``paid_by_user_id`` NULL; the admin/manual path passes
        the acting admin.
        """
        inv = await self._get_for_update(invoice_id)
        if inv.status not in ("draft", "sent"):
            raise HTTPException(status_code=409, detail="Invoice cannot be marked paid")
        org = await self.db.get(Organization, inv.organization_id) if inv.product == "scan" else None
        if inv.product == "scan":
            tier = await SkuTierService(self.db).get(inv.sku)
            if not tier.active and (org is None or org.sku != inv.sku):
                raise HTTPException(status_code=409, detail="Tier is retired")
        inv.status = "paid"
        inv.paid_at = datetime.now(UTC)
        inv.paid_by_user_id = actor_id
        if bank_ref is not None:
            inv.bank_ref = bank_ref.strip()[:64] or None
        if org is not None and inv.subscription_request_id is None:
            if org.sku != inv.sku:
                record_tier_assignment(
                    self.db,
                    organization_id=org.id,
                    sku_code=inv.sku,
                    previous=org.sku,
                    actor_id=None,
                    source=f"invoice {inv.number}",
                )
            org.sku = inv.sku
            org.updated_at = datetime.now(UTC)
        inv.updated_at = datetime.now(UTC)
        await self.db.flush()
        return inv

    async def mark_paid(
        self,
        invoice_id: uuid.UUID,
        bank_ref: str | None,
        *,
        actor_id: uuid.UUID | None = None,
    ) -> OrgInvoice:
        inv = await self._mark_paid(invoice_id, bank_ref, actor_id=actor_id)
        await self.db.commit()
        await self.db.refresh(inv)
        return inv

    async def _void(
        self,
        invoice_id: uuid.UUID,
        *,
        actor_id: uuid.UUID | None = None,
        force: bool = False,
        reason: str | None = None,
    ) -> OrgInvoice:
        """Apply the void transition without committing (see ``_mark_paid``).

        ``paid`` invoices can only be voided with ``force=True`` **and** a
        non-empty ``reason``. This is an audit correction for a payment recorded
        in error, not a refund: ``PaymentAttempt`` rows are retained and
        ``organization.sku`` is deliberately left untouched. Reverting access is
        a separate ops decision (the refund flow), never a side effect of voiding.
        """
        inv = await self.get(invoice_id)
        cleaned = (reason or "").strip()
        if inv.status == "paid":
            if not force:
                raise HTTPException(status_code=409, detail="Only draft or sent invoices can be voided")
            if not cleaned:
                raise HTTPException(status_code=400, detail="reason is required when force=true")
        elif inv.status not in ("draft", "sent"):
            raise HTTPException(status_code=409, detail="Only draft or sent invoices can be voided")
        inv.status = "void"
        inv.subscription_request_id = None
        inv.voided_by_user_id = actor_id
        inv.voided_at = datetime.now(UTC)
        if cleaned:
            inv.void_reason = cleaned[:500]
        inv.updated_at = datetime.now(UTC)
        await PromoService(self.db).release_for_invoice(invoice_id)
        await self.db.flush()
        return inv

    async def void(
        self,
        invoice_id: uuid.UUID,
        *,
        actor_id: uuid.UUID | None = None,
        force: bool = False,
        reason: str | None = None,
    ) -> OrgInvoice:
        inv = await self._void(invoice_id, actor_id=actor_id, force=force, reason=reason)
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
