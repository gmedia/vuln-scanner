from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.organization import Organization
from app.models.user import User
from app.schemas.invoice import (
    AdminOrgItem,
    AdminOrgListResponse,
    InvoiceCreateRequest,
    InvoiceItem,
    InvoiceListResponse,
    InvoicePaidRequest,
    SkuCatalogItem,
    SkuCatalogListResponse,
    SkuCatalogUpdateRequest,
)
from app.services.auth import get_current_admin
from app.services.invoice import InvoiceService, to_item

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
    items = await InvoiceService(db).list_catalog()
    return SkuCatalogListResponse(items=[SkuCatalogItem.model_validate(i) for i in items])


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
    row = await InvoiceService(db).update_catalog(product, sku, body.list_idr)
    return SkuCatalogItem.model_validate(row)


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
            InvoiceItem.model_validate(to_item(inv, org_name=name, include_bank=inv.status == "sent"))
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
        notes=body.notes,
    )
    return InvoiceItem.model_validate(to_item(inv, org_name=None, include_bank=False))


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
    return InvoiceItem.model_validate(to_item(inv, org_name=None, include_bank=True))


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
    inv = await InvoiceService(db).mark_paid(invoice_id, body.bank_ref)
    return InvoiceItem.model_validate(to_item(inv, org_name=None, include_bank=False))


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
    return InvoiceItem.model_validate(to_item(inv, org_name=None, include_bank=False))
