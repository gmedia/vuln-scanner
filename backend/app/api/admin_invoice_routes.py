from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.i18n import normalize_lang
from app.middleware.rate_limit import RateLimiter
from app.models.invoice import (
    ANNUAL_MONTHS_PAID,
    ANNUAL_MONTHS_SERVED,
    INVOICE_PRODUCTS,
)
from app.models.organization import Organization
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.schemas.invoice import (
    AdminOrgItem,
    AdminOrgListResponse,
    AnnualPolicy,
    BundlePriceItem,
    InvoiceCreateRequest,
    InvoiceItem,
    InvoiceListResponse,
    InvoicePaidRequest,
    SkuCatalogItem,
    SkuCatalogListResponse,
    SkuCatalogUpdateRequest,
    SkuPriceItem,
    SkuPriceListResponse,
)
from app.services.auth import get_current_admin
from app.services.billing import BillingService
from app.services.invoice import InvoiceService, invoice_pdf_response, to_item
from app.services.sku_tier import SkuTierService

router = APIRouter(prefix="/admin", tags=["admin-invoices"])
admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin_invoices",
)


@router.get("/orgs", response_model=AdminOrgListResponse)
async def list_admin_orgs(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None),
    sku: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> AdminOrgListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    filters = []
    if q:
        like = f"%{q.strip()}%"
        filters.append(or_(Organization.name.ilike(like), Organization.slug.ilike(like)))
    if sku:
        filters.append(Organization.sku == sku)
    count_q = select(func.count()).select_from(Organization)
    list_q = select(Organization).order_by(Organization.name.asc())
    if filters:
        count_q = count_q.where(*filters)
        list_q = list_q.where(*filters)
    total = int((await db.execute(count_q)).scalar() or 0)
    list_q = list_q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(list_q)).scalars().all()
    return AdminOrgListResponse(
        items=[AdminOrgItem.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/sku-catalog", response_model=SkuCatalogListResponse)
async def get_sku_catalog(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuCatalogListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows = await InvoiceService(db).list_catalog_with_actors()
    tier_rows = await db.execute(
        select(
            SkuTier.code,
            SkuTier.label,
            SkuTier.active,
            SkuTier.limit_scan,
            SkuTier.limit_host,
            SkuTier.limit_uptime,
            SkuTier.limit_guard,
        )
    )
    tiers = {
        str(code): (
            str(label),
            bool(active),
            {
                "scan": int(limit_scan),
                "host": int(limit_host),
                "uptime": int(limit_uptime),
                "guard": int(limit_guard),
            },
        )
        for code, label, active, limit_scan, limit_host, limit_uptime, limit_guard in tier_rows.all()
    }
    items = []
    for row, email in rows:
        entry = tiers.get(str(row.sku))
        label, active, limits = entry if entry is not None else (str(row.sku), False, {})
        # seats is derived from sku_tiers.limit_*; the sku_catalog.seats column
        # is retained for now but is not read on any API path.
        seats = int(limits.get(row.product, 0))
        items.append(
            SkuCatalogItem(
                product=row.product,
                sku=row.sku,
                label=label,
                active=active,
                list_idr=row.list_idr,
                seats=seats,
                invoicable=row.invoicable,
                updated_at=row.updated_at,
                updated_by=row.updated_by,
                updated_by_email=email,
            )
        )
    return SkuCatalogListResponse(items=items)


@router.put("/sku-catalog/{product}/{sku}", response_model=SkuCatalogItem)
async def update_sku_catalog(
    product: str,
    sku: str,
    body: SkuCatalogUpdateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuCatalogItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    row = await InvoiceService(db).update_catalog(product, sku, body.list_idr, body.invoicable, current_admin.id)
    tier = await SkuTierService(db).get(row.sku)
    # seats is derived from sku_tiers.limit_*; the sku_catalog.seats column is
    # retained for now but is not read on any API path.
    seats = await SkuTierService(db).product_limit(row.sku, row.product)
    return SkuCatalogItem(
        product=row.product,
        sku=row.sku,
        label=tier.label,
        active=tier.active,
        list_idr=row.list_idr,
        seats=seats,
        invoicable=row.invoicable,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
        updated_by_email=current_admin.email,
    )


@router.get("/sku-prices", response_model=SkuPriceListResponse)
async def get_sku_prices(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuPriceListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows = await InvoiceService(db).list_catalog()
    catalog = {(r.product, r.sku): r for r in rows}
    tiers = [
        tier
        for tier in await SkuTierService(db).list(include_inactive=True)
        if not tier.sales_led
    ]
    items: list[SkuPriceItem] = []
    for tier in tiers:
        for service in INVOICE_PRODUCTS:
            row = catalog.get((service, tier.code))
            items.append(
                SkuPriceItem(
                    service=service,
                    sku=tier.code,
                    label=tier.label,
                    active=tier.active,
                    list_idr=int(row.list_idr) if row is not None else 0,
                    invoicable=bool(row.invoicable) if row is not None else False,
                )
            )
    by_service_sku = {(i.service, i.sku): i.list_idr for i in items}
    bundles: list[BundlePriceItem] = []
    for tier in tiers:
        alacarte = sum(by_service_sku.get((service, tier.code), 0) for service in INVOICE_PRODUCTS)
        bundle = int(tier.bundle_idr or 0)
        saving = alacarte - bundle
        bundles.append(
            BundlePriceItem(
                tier=tier.code,
                label=tier.label,
                active=tier.active,
                bundle_idr=bundle,
                alacarte_idr=alacarte,
                saving_idr=saving,
                saving_pct=round(saving * 100 / alacarte, 1) if alacarte else 0.0,
            )
        )
    return SkuPriceListResponse(
        items=items,
        bundles=bundles,
        annual=AnnualPolicy(months_paid=ANNUAL_MONTHS_PAID, months_served=ANNUAL_MONTHS_SERVED),
    )


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
) -> InvoiceListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows, total = await InvoiceService(db).list_admin(
        status_filter=status,
        organization_id=organization_id,
        page=page,
        page_size=page_size,
    )
    return InvoiceListResponse(
        items=[
            InvoiceItem.model_validate(await to_item(inv, org_name=name, include_bank=inv.status == "sent", db=db))
            for inv, name in rows
        ],
        total=total,
    )


@router.post("/invoices", response_model=InvoiceItem, status_code=201)
async def create_invoice(
    body: InvoiceCreateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> InvoiceItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv = await InvoiceService(db).create_invoice(
        organization_id=body.organization_id,
        sku=body.sku,
        actor=current_admin,
        product=body.product,
        period_start=body.period_start,
        due_date=body.due_date,
        cycle=body.cycle,
        notes=body.notes,
    )
    return InvoiceItem.model_validate(await to_item(inv, org_name=None, include_bank=False, db=db))


@router.post("/invoices/{invoice_id}/send", response_model=InvoiceItem)
async def send_invoice(
    invoice_id: UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> InvoiceItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv = await InvoiceService(db).send(invoice_id)
    return InvoiceItem.model_validate(await to_item(inv, org_name=None, include_bank=True, db=db))


@router.post("/invoices/{invoice_id}/paid", response_model=InvoiceItem)
async def pay_invoice(
    invoice_id: UUID,
    body: InvoicePaidRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> InvoiceItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv, _sub, _attempt = await BillingService(db).record_invoice_payment(
        invoice_id,
        current_admin,
        method="bank_transfer",
        reference=body.bank_ref,
    )
    return InvoiceItem.model_validate(await to_item(inv, org_name=None, include_bank=False, db=db))


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceItem)
async def void_invoice(
    invoice_id: UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> InvoiceItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv = await InvoiceService(db).void(invoice_id)
    return InvoiceItem.model_validate(await to_item(inv, org_name=None, include_bank=False, db=db))


@router.get("/invoices/{invoice_id}/export")
async def export_invoice_pdf(
    invoice_id: UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    format: str = Query(default="pdf"),
) -> Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv = await InvoiceService(db).get(invoice_id)
    if format != "pdf":
        raise HTTPException(status_code=400, detail="format must be 'pdf'")
    org = await db.get(Organization, inv.organization_id)
    return await invoice_pdf_response(
        inv,
        org_name=org.name if org is not None else None,
        db=db,
        locale=normalize_lang(getattr(current_admin, "locale", None)),
    )
