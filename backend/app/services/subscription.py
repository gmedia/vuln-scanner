from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset import ASSET_SKU_LIMITS, ScanAsset
from app.models.guard import GUARD_SKU_LIMITS, GuardAgent
from app.models.host_protect import HOST_SITE_SKU_LIMITS, HostSite
from app.models.invoice import (
    ANNUAL_MONTHS_PAID,
    ANNUAL_MONTHS_SERVED,
    BUNDLE_LIST_IDR,
    GUARD_SKU_LIST_IDR,
    HOST_SKU_LIST_IDR,
    INVOICE_PRODUCTS,
    INVOICE_SKUS,
    PRODUCT_SEATS,
    SCAN_SKU_LIST_IDR,
    UPTIME_SKU_LIST_IDR,
    OrgInvoice,
)
from app.models.organization import Organization, OrganizationMembership
from app.models.subscription import SubscriptionRequest
from app.models.uptime import UPTIME_SKU_LIMITS, UptimeMonitor
from app.models.user import User
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
from app.services.invoice import InvoiceService
from app.services.organization import role_at_least

SKU_RANK: dict[str, int] = {"basic": 1, "pro": 2, "multi": 3, "enterprise": 4}
SKU_LABEL: dict[str, str] = {
    "basic": "Basic",
    "pro": "Pro",
    "multi": "Multi",
    "enterprise": "Enterprise",
}
PRODUCT_LIMITS: dict[str, dict[str, int]] = {
    "scan": ASSET_SKU_LIMITS,
    "host": HOST_SITE_SKU_LIMITS,
    "uptime": UPTIME_SKU_LIMITS,
    "guard": GUARD_SKU_LIMITS,
}
PRODUCT_UNITS: dict[str, str] = {
    "scan": "asset",
    "host": "site",
    "uptime": "monitor",
    "guard": "agent",
}
PRODUCT_FALLBACKS: dict[str, dict[str, int]] = {
    "scan": SCAN_SKU_LIST_IDR,
    "host": HOST_SKU_LIST_IDR,
    "uptime": UPTIME_SKU_LIST_IDR,
    "guard": GUARD_SKU_LIST_IDR,
}


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _limit_for(sku: str, limits: dict[str, int]) -> int | None:
    if sku == "enterprise":
        return None
    return limits.get(sku, limits["multi"])


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

    async def _usage(self, organization_id: UUID, sku: str) -> tuple[list[SubscriptionUsageItem], WorkspaceSeats]:
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
                limit=_limit_for(sku, PRODUCT_LIMITS[product]),
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
            editor_limit=1 if sku == "basic" else None,
            viewer_limit=1 if sku == "basic" else None,
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

    def _plan(self, org: Organization, invoice: OrgInvoice | None) -> SubscriptionPlan:
        sku = org.sku or "basic"
        now = datetime.now(UTC)
        period_end = _utc(invoice.period_end) if invoice is not None else None

        if sku == "enterprise":
            plan_status = "enterprise"
            source = "custom"
        elif invoice is None:
            plan_status = "unbilled"
            source = "default" if sku == "basic" else "ops"
        elif invoice.status == "sent":
            plan_status = "pending_payment"
            source = "invoice"
        elif invoice.status == "draft":
            plan_status = "draft"
            source = "invoice"
        elif invoice.status == "paid":
            plan_status = "active" if period_end is not None and period_end >= now else "expired"
            source = "invoice"
        else:
            plan_status = "unbilled"
            source = "default" if sku == "basic" else "ops"

        cycle = "monthly"
        if invoice is not None:
            start = _utc(invoice.period_start)
            if start is not None and period_end is not None and (period_end - start).days > 40:
                cycle = "annual"

        return SubscriptionPlan(
            sku=sku,
            label=f"Sinexis Secure — {SKU_LABEL.get(sku, sku)}",
            status=plan_status,
            source=source,
            cycle=cycle,
            amount_idr=invoice.amount_idr if invoice is not None else None,
            period_start=_utc(invoice.period_start) if invoice is not None else None,
            period_end=period_end,
            renewal_at=period_end,
            invoice_id=invoice.id if invoice is not None else None,
            invoice_number=invoice.number if invoice is not None else None,
        )

    async def _catalog(self) -> tuple[list[SubscriptionCatalogItem], list[SubscriptionBundleItem]]:
        rows = await InvoiceService(self.db).list_catalog()
        catalog = {(row.product, row.sku): row for row in rows}
        items: list[SubscriptionCatalogItem] = []
        for service in INVOICE_PRODUCTS:
            for sku in INVOICE_SKUS:
                row = catalog.get((service, sku))
                items.append(
                    SubscriptionCatalogItem(
                        service=service,
                        sku=sku,
                        list_idr=row.list_idr if row is not None else PRODUCT_FALLBACKS[service].get(sku, 0),
                        seats=(
                            row.seats
                            if row is not None
                            else int(PRODUCT_SEATS.get(service, PRODUCT_SEATS["scan"]).get(sku, 1))
                        ),
                        invoicable=row.invoicable if row is not None else False,
                    )
                )
        by_key = {(item.service, item.sku): item.list_idr for item in items}
        bundles: list[SubscriptionBundleItem] = []
        for tier in INVOICE_SKUS:
            alacarte = sum(by_key.get((service, tier), 0) for service in INVOICE_PRODUCTS)
            bundle = BUNDLE_LIST_IDR.get(tier, 0)
            saving = alacarte - bundle
            bundles.append(
                SubscriptionBundleItem(
                    tier=tier,
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

    async def overview(self, org: Organization, role: str) -> SubscriptionOverviewResponse:
        invoice = await self._latest_scan_invoice(org.id)
        usage, seats = await self._usage(org.id, org.sku or "basic")
        catalog, bundles = await self._catalog()
        can_manage = role_at_least(role, "admin")
        return SubscriptionOverviewResponse(
            organization_id=org.id,
            organization_name=org.name,
            plan=self._plan(org, invoice),
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
            ),
            pending_request=await self._pending_request(org.id),
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
        if target_sku not in ("basic", "pro", "multi"):
            raise HTTPException(status_code=400, detail="Enterprise plans are quote-only")
        current_sku = org.sku or "basic"
        if target_sku == current_sku:
            raise HTTPException(status_code=400, detail="Organization is already on this plan")

        direction = "upgrade" if SKU_RANK[target_sku] > SKU_RANK[current_sku] else "downgrade"
        usage, seats = await self._usage(org.id, current_sku)
        if direction == "downgrade":
            for item in usage:
                limit = _limit_for(target_sku, PRODUCT_LIMITS[item.product])
                if limit is not None and item.used > limit:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"{item.product.capitalize()} usage is {item.used}, "
                            f"but {SKU_LABEL[target_sku]} allows {limit}. "
                            "Remove the extra capacity before downgrading."
                        ),
                    )
            if target_sku == "basic" and (seats.editors > 1 or seats.viewers > 1):
                raise HTTPException(
                    status_code=400,
                    detail="Basic workspace allows 1 editor and 1 viewer. Reduce members before downgrading.",
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
