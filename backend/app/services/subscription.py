from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import ScanAsset
from app.models.billing import PaymentAttempt, Subscription
from app.models.guard import GuardAgent
from app.models.host_protect import HostSite
from app.models.invoice import (
    ANNUAL_MONTHS_PAID,
    ANNUAL_MONTHS_SERVED,
    INVOICE_PRODUCTS,
    OrgInvoice,
)
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.subscription import SubscriptionRequest
from app.models.uptime import UptimeMonitor
from app.models.user import User
from app.schemas.billing import PaymentAttemptItem
from app.schemas.sku_tier import SkuTierItem
from app.schemas.subscription import (
    SubscriptionAnnualPolicy,
    SubscriptionBundleItem,
    SubscriptionCapabilities,
    SubscriptionCatalogItem,
    SubscriptionEnterpriseOffer,
    SubscriptionOverviewResponse,
    SubscriptionPlan,
    SubscriptionRequestItem,
    SubscriptionUsageItem,
    WorkspaceSeats,
)
from app.services.billing_access import billing_write_block
from app.services.invoice import InvoiceService
from app.services.organization import role_at_least
from app.services.sku_tier import SkuTierService, workspace_seat_cap_detail

PRODUCT_UNITS: dict[str, str] = {
    "scan": "asset",
    "host": "site",
    "uptime": "monitor",
    "guard": "agent",
}


def _limit_for(tier: SkuTier, product: str) -> int:
    return int(getattr(tier, f"limit_{product}"))


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)



def _request_item(
    request: SubscriptionRequest,
    *,
    organization_name: str | None = None,
    requested_by_email: str | None = None,
) -> SubscriptionRequestItem:
    return SubscriptionRequestItem(
        id=request.id,
        organization_id=request.organization_id,
        direction=request.direction,
        current_sku=request.current_sku,
        target_sku=request.target_sku,
        cycle=request.cycle,
        note=request.note,
        status=request.status,
        resolution_note=request.resolution_note,
        created_at=request.created_at,
        resolved_at=request.resolved_at,
        requested_by_email=requested_by_email,
        organization_name=organization_name,
    )


class SubscriptionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _count(self, model: Any, organization_id: UUID, *extra: Any) -> int:
        query = select(func.count()).select_from(model).where(model.organization_id == organization_id)
        for clause in extra:
            query = query.where(clause)
        return int((await self.db.execute(query)).scalar() or 0)

    async def _resolve_tier(self, code: str | None) -> SkuTier:
        service = SkuTierService(self.db)
        return await service.get(code) if code else await service.default()

    async def _usage(
        self, organization_id: UUID, sku: str | None
    ) -> tuple[list[SubscriptionUsageItem], WorkspaceSeats]:
        tier = await self._resolve_tier(sku)
        limits = {
            "scan": tier.limit_scan,
            "host": tier.limit_host,
            "uptime": tier.limit_uptime,
            "guard": tier.limit_guard,
        }
        used = {
            "scan": await self._count(ScanAsset, organization_id),
            "host": await self._count(HostSite, organization_id),
            "uptime": await self._count(UptimeMonitor, organization_id),
            "guard": await self._count(GuardAgent, organization_id, GuardAgent.disabled_at.is_(None)),
        }
        usage = [
            SubscriptionUsageItem(
                product=product,
                used=used[product],
                limit=limits[product],
                unit=PRODUCT_UNITS[product],
            )
            for product in ("scan", "host", "uptime", "guard")
        ]

        role_rows = (
            await self.db.execute(
                select(OrganizationMembership.role, func.count())
                .where(OrganizationMembership.organization_id == organization_id)
                .group_by(OrganizationMembership.role)
            )
        ).all()
        roles = {str(role): int(count) for role, count in role_rows}
        editors = roles.get("owner", 0) + roles.get("admin", 0) + roles.get("member", 0)
        viewers = roles.get("viewer", 0)
        seats = WorkspaceSeats(
            editors=editors,
            viewers=viewers,
            editor_limit=tier.workspace_editor_limit,
            viewer_limit=tier.workspace_viewer_limit,
        )
        return usage, seats

    async def _latest_scan_invoice(self, organization_id: UUID) -> OrgInvoice | None:
        result = await self.db.execute(
            select(OrgInvoice)
            .where(
                OrgInvoice.organization_id == organization_id,
                OrgInvoice.product == "scan",
                OrgInvoice.status != "void",
            )
            .order_by(OrgInvoice.period_start.desc(), OrgInvoice.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _invoice_plan_status(
        self,
        tier: SkuTier,
        invoice: OrgInvoice | None,
        *,
        now: datetime,
        period_end: datetime | None,
    ) -> tuple[str, str]:
        """Legacy derivation, used only when no subscription row exists yet."""
        fallback_source = "default" if tier.is_default else "ops"
        if invoice is None:
            return "unbilled", fallback_source
        if invoice.status == "sent":
            return "pending_payment", "invoice"
        if invoice.status == "draft":
            return "draft", "invoice"
        if invoice.status == "paid":
            status = "active" if period_end is not None and period_end >= now else "expired"
            return status, "invoice"
        return "unbilled", fallback_source

    def _subscription_plan_status(
        self,
        subscription: Subscription,
        invoice: OrgInvoice | None,
        *,
        now: datetime,
        period_end: datetime | None,
    ) -> str:
        """Billing status wins over invoice status once a row exists.

        The invoice is evidence of a payment; the subscription row is the
        lifecycle truth (past_due from a failed renewal, cancel-at-period-end,
        immediate cancel). Period end still decides whether access is current.
        """
        if subscription.status == "canceled":
            return "expired"
        if subscription.status == "past_due":
            if period_end is not None and period_end >= now:
                return "pending_payment"
            return "expired"
        if subscription.status == "active":
            if period_end is None:
                return "active"
            # The lifecycle beat only flips to past_due after the grace window,
            # so an active row past its period end is inside grace, not dead.
            return "active" if period_end >= now else "grace"
        # incomplete: no settled payment yet.
        if invoice is not None and invoice.status == "draft":
            return "draft"
        if invoice is not None and invoice.status == "sent":
            return "pending_payment"
        return "unbilled"

    async def _plan(
        self,
        org: Organization,
        invoice: OrgInvoice | None,
        subscription: Subscription | None = None,
    ) -> SubscriptionPlan:
        tier = await self._resolve_tier(org.sku)
        sku = tier.code
        label = f"Sinexis Secure — {tier.label}"
        now = datetime.now(UTC)
        invoice_end = _utc(invoice.period_end) if invoice is not None else None

        if tier.sales_led:
            return SubscriptionPlan(
                sku=sku,
                label=label,
                status="enterprise",
                source="custom",
            )

        if subscription is not None:
            period_start = _utc(subscription.current_period_start) or (
                _utc(invoice.period_start) if invoice is not None else None
            )
            period_end = _utc(subscription.current_period_end) or invoice_end
            return SubscriptionPlan(
                sku=sku,
                label=label,
                status=self._subscription_plan_status(
                    subscription,
                    invoice,
                    now=now,
                    period_end=period_end,
                ),
                source="subscription",
                cycle=subscription.cycle,
                amount_idr=invoice.amount_idr if invoice is not None else None,
                period_start=period_start,
                period_end=period_end,
                renewal_at=period_end,
                invoice_id=invoice.id if invoice is not None else None,
                invoice_number=invoice.number if invoice is not None else None,
                cancel_at_period_end=subscription.cancel_at_period_end,
                billing_status=subscription.status,
            )

        plan_status, source = self._invoice_plan_status(
            tier,
            invoice,
            now=now,
            period_end=invoice_end,
        )
        cycle = "monthly"
        if invoice is not None:
            start = _utc(invoice.period_start)
            if start is not None and invoice_end is not None and (invoice_end - start).days > 40:
                cycle = "annual"

        return SubscriptionPlan(
            sku=sku,
            label=label,
            status=plan_status,
            source=source,
            cycle=cycle,
            amount_idr=invoice.amount_idr if invoice is not None else None,
            period_start=_utc(invoice.period_start) if invoice is not None else None,
            period_end=invoice_end,
            renewal_at=invoice_end,
            invoice_id=invoice.id if invoice is not None else None,
            invoice_number=invoice.number if invoice is not None else None,
        )

    async def _visible_tiers(self, extra_codes: set[str] | None = None) -> list[SkuTier]:
        """Active tiers plus the caller's current tier, even when retired."""
        service = SkuTierService(self.db)
        visible = {tier.code: tier for tier in await service.list()}
        for code in extra_codes or set():
            if code not in visible:
                visible[code] = await service.get(code)
        return sorted(visible.values(), key=lambda tier: tier.rank)

    async def _catalog(
        self, extra_codes: set[str] | None = None
    ) -> tuple[list[SubscriptionCatalogItem], list[SubscriptionBundleItem]]:
        tiers = [tier for tier in await self._visible_tiers(extra_codes) if not tier.sales_led]
        rows = await InvoiceService(self.db).list_catalog()
        catalog = {(row.product, row.sku): row for row in rows}
        items: list[SubscriptionCatalogItem] = []
        for tier in tiers:
            for service in INVOICE_PRODUCTS:
                row = catalog.get((service, tier.code))
                items.append(
                    SubscriptionCatalogItem(
                        service=service,
                        sku=tier.code,
                        label=tier.label,
                        active=tier.active,
                        list_idr=int(row.list_idr) if row is not None else 0,
                        seats=_limit_for(tier, service),
                        invoicable=bool(row.invoicable) if row is not None else False,
                    )
                )
        by_key = {(item.service, item.sku): item.list_idr for item in items}
        bundles: list[SubscriptionBundleItem] = []
        for tier in tiers:
            alacarte = sum(by_key.get((service, tier.code), 0) for service in INVOICE_PRODUCTS)
            bundle = int(tier.bundle_idr or 0)
            saving = alacarte - bundle
            bundles.append(
                SubscriptionBundleItem(
                    tier=tier.code,
                    label=tier.label,
                    active=tier.active,
                    bundle_idr=bundle,
                    alacarte_idr=alacarte,
                    saving_idr=saving,
                    saving_pct=round(saving * 100 / alacarte, 1) if alacarte else 0.0,
                )
            )
        return items, bundles

    async def _pending_request(self, organization_id: UUID) -> SubscriptionRequestItem | None:
        result = await self.db.execute(
            select(SubscriptionRequest, User.email)
            .outerjoin(User, SubscriptionRequest.requested_by_user_id == User.id)
            .where(
                SubscriptionRequest.organization_id == organization_id,
                SubscriptionRequest.status == "pending",
            )
            .order_by(SubscriptionRequest.created_at.desc())
            .limit(1)
        )
        row = result.first()
        if row is None:
            return None
        request, email = row
        return _request_item(request, requested_by_email=email)

    async def _subscription(self, organization_id: UUID) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription).where(Subscription.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def _recent_attempts(self, organization_id: UUID) -> list[PaymentAttemptItem]:
        rows = (
            await self.db.execute(
                select(PaymentAttempt)
                .where(PaymentAttempt.organization_id == organization_id)
                .order_by(PaymentAttempt.created_at.desc())
                .limit(5)
            )
        ).scalars().all()
        return [PaymentAttemptItem.model_validate(row) for row in rows]

    async def overview(self, org: Organization, role: str) -> SubscriptionOverviewResponse:
        invoice = await self._latest_scan_invoice(org.id)
        subscription = await self._subscription(org.id)
        usage, seats = await self._usage(org.id, org.sku)
        visible_tiers = await self._visible_tiers({org.sku})
        catalog, bundles = await self._catalog({org.sku})
        can_manage = role_at_least(role, "admin")
        read_only_reason = await billing_write_block(self.db, org.id)
        return SubscriptionOverviewResponse(
            organization_id=org.id,
            organization_name=org.name,
            plan=await self._plan(org, invoice, subscription),
            tiers=[SkuTierItem.from_model(tier) for tier in visible_tiers],
            usage=usage,
            workspace_seats=seats,
            catalog=catalog,
            bundles=bundles,
            annual=SubscriptionAnnualPolicy(
                months_paid=ANNUAL_MONTHS_PAID,
                months_served=ANNUAL_MONTHS_SERVED,
            ),
            enterprise=SubscriptionEnterpriseOffer(contact_only=True),
            capabilities=SubscriptionCapabilities(
                can_manage=can_manage,
                can_request_change=can_manage,
                can_view_invoices=can_manage,
                can_self_serve=False,
                read_only=read_only_reason is not None,
                read_only_reason=read_only_reason,
            ),
            pending_request=await self._pending_request(org.id),
            recent_attempts=(
                await self._recent_attempts(org.id) if can_manage else []
            ),
        )

    async def create_request(
        self,
        org: Organization,
        user: User,
        *,
        target_sku: str,
        cycle: str,
        note: str,
    ) -> SubscriptionRequestItem:
        service = SkuTierService(self.db)
        target = await service.get(target_sku)
        if not target.active or not target.requestable:
            raise HTTPException(
                status_code=400,
                detail=f"{target.label} is not available for new subscriptions",
            )
        current = await self._resolve_tier(org.sku)
        current_sku = current.code
        if target_sku == current_sku:
            raise HTTPException(status_code=400, detail="Organization is already on this plan")

        direction = "upgrade" if target.rank > current.rank else "downgrade"
        usage, seats = await self._usage(org.id, current_sku)
        if direction == "downgrade":
            target_limits = await service.limits(target_sku)
            for item in usage:
                limit = target_limits[item.product]
                if item.used > limit:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"{item.product.capitalize()} usage is {item.used}, "
                            f"but {target.label} allows {limit}. "
                            "Remove the extra capacity before downgrading."
                        ),
                    )
            editor_limit, viewer_limit = await service.workspace_limits(target_sku)
            over_editor = editor_limit is not None and seats.editors > editor_limit
            over_viewer = viewer_limit is not None and seats.viewers > viewer_limit
            if over_editor or over_viewer:
                raise HTTPException(
                    status_code=400,
                    detail=workspace_seat_cap_detail(target.label, editor_limit, viewer_limit),
                )

        pending = await self.db.execute(
            select(SubscriptionRequest.id).where(
                SubscriptionRequest.organization_id == org.id,
                SubscriptionRequest.status == "pending",
            )
        )
        if pending.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="A subscription request is already pending")

        request = SubscriptionRequest(
            organization_id=org.id,
            requested_by_user_id=user.id,
            direction=direction,
            current_sku=current_sku,
            target_sku=target_sku,
            cycle=cycle,
            note=(note or "").strip()[:500],
            status="pending",
        )
        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)
        return _request_item(request, requested_by_email=user.email)

    async def cancel_request(self, org_id: UUID, request_id: UUID) -> None:
        result = await self.db.execute(
            select(SubscriptionRequest).where(
                SubscriptionRequest.id == request_id,
                SubscriptionRequest.organization_id == org_id,
            )
        )
        request = result.scalar_one_or_none()
        if request is None:
            raise HTTPException(status_code=404, detail="Subscription request not found")
        if request.status != "pending":
            raise HTTPException(status_code=409, detail="Only pending requests can be canceled")
        request.status = "canceled"
        request.updated_at = datetime.now(UTC)
        await self.db.commit()

    async def list_admin(
        self,
        *,
        status_filter: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[SubscriptionRequestItem], int]:
        query = (
            select(SubscriptionRequest, Organization.name, User.email)
            .join(Organization, Organization.id == SubscriptionRequest.organization_id)
            .outerjoin(User, SubscriptionRequest.requested_by_user_id == User.id)
            .order_by(SubscriptionRequest.created_at.desc())
        )
        count_query = select(func.count()).select_from(SubscriptionRequest)
        if status_filter:
            query = query.where(SubscriptionRequest.status == status_filter)
            count_query = count_query.where(SubscriptionRequest.status == status_filter)
        total = int((await self.db.execute(count_query)).scalar() or 0)
        query = query.offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(query)).all()
        return [
            _request_item(request, organization_name=str(org_name), requested_by_email=email)
            for request, org_name, email in rows
        ], total

    async def resolve(
        self,
        request_id: UUID,
        admin: User,
        *,
        new_status: str,
        note: str,
    ) -> SubscriptionRequestItem:
        if new_status not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid resolution status")
        request = await self.db.get(SubscriptionRequest, request_id)
        if request is None:
            raise HTTPException(status_code=404, detail="Subscription request not found")
        if request.status != "pending":
            raise HTTPException(status_code=409, detail="Request is no longer pending")
        request.status = new_status
        request.resolution_note = (note or "").strip()[:500]
        request.resolved_by_user_id = admin.id
        request.resolved_at = datetime.now(UTC)
        request.updated_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(request)
        org = await self.db.get(Organization, request.organization_id)
        return _request_item(
            request,
            organization_name=org.name if org is not None else None,
            requested_by_email=None,
        )


__all__ = ["SubscriptionService"]
