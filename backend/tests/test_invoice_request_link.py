"""One subscription request may back at most one live invoice."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.invoice import OrgInvoice
from app.models.subscription import SubscriptionRequest
from app.services.invoice import InvoiceService
from app.services.promo import PromoService
from app.services.subscription import SubscriptionService
from tests.test_subscription_promo import _auth, _bind, _body, _make_org, _make_user

_JAN = datetime(2026, 1, 1, tzinfo=UTC)
_FEB = datetime(2026, 2, 1, tzinfo=UTC)


async def _count_invoices(db: AsyncSession) -> int:
    return int(
        await db.scalar(select(func.count()).select_from(OrgInvoice)) or 0
    )


async def _non_void_invoice_for(
    db: AsyncSession, request_id: uuid.UUID
) -> uuid.UUID | None:
    return await db.scalar(
        select(OrgInvoice.id).where(
            OrgInvoice.subscription_request_id == request_id,
            OrgInvoice.status != "void",
        )
    )


@pytest.mark.asyncio
async def test_request_without_promo_cannot_back_a_second_invoice(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "link-nopromo@example.com")
    admin = await _make_user(db_session, "link-nopromo-admin@example.com", admin=True)
    org = await _make_org(db_session, owner)
    request = await SubscriptionService(db_session).create_request(
        org, owner, target_sku="pro", cycle="monthly", note="", promo_code=None
    )

    first = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="pro",
        actor=admin,
        period_start=_JAN,
        subscription_request_id=request.id,
    )
    assert first.subscription_request_id == request.id

    with pytest.raises(HTTPException) as conflict:
        await InvoiceService(db_session).create_invoice(
            organization_id=org.id,
            sku="pro",
            actor=admin,
            period_start=_FEB,
            subscription_request_id=request.id,
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail == "Subscription request already has an invoice"
    assert await _count_invoices(db_session) == 1


@pytest.mark.asyncio
async def test_request_with_promo_returns_the_invoice_guard_message(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "link-promo@example.com")
    admin = await _make_user(db_session, "link-promo-admin@example.com", admin=True)
    org = await _make_org(db_session, owner)
    await PromoService(db_session).create(_body("LINK2026"), owner)
    request = await SubscriptionService(db_session).create_request(
        org, owner, target_sku="pro", cycle="monthly", note="", promo_code="LINK2026"
    )

    first = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="pro",
        actor=admin,
        period_start=_JAN,
        promo_code="LINK2026",
        subscription_request_id=request.id,
    )
    assert first.subscription_request_id == request.id

    with pytest.raises(HTTPException) as conflict:
        await InvoiceService(db_session).create_invoice(
            organization_id=org.id,
            sku="pro",
            actor=admin,
            period_start=_FEB,
            promo_code="LINK2026",
            subscription_request_id=request.id,
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail == "Subscription request already has an invoice"
    assert await _count_invoices(db_session) == 1


@pytest.mark.asyncio
async def test_void_releases_the_request_link_for_a_new_invoice(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "link-void@example.com")
    admin = await _make_user(db_session, "link-void-admin@example.com", admin=True)
    org = await _make_org(db_session, owner)
    request = await SubscriptionService(db_session).create_request(
        org, owner, target_sku="pro", cycle="monthly", note="", promo_code=None
    )

    first = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="pro",
        actor=admin,
        period_start=_JAN,
        subscription_request_id=request.id,
    )
    voided = await InvoiceService(db_session).void(first.id)
    assert voided.status == "void"
    assert voided.subscription_request_id is None
    assert await _non_void_invoice_for(db_session, request.id) is None

    second = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="pro",
        actor=admin,
        period_start=_FEB,
        subscription_request_id=request.id,
    )
    assert second.subscription_request_id == request.id
    assert second.id != first.id


@pytest.mark.asyncio
async def test_failed_creation_leaves_no_invoice_and_no_link(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await _make_user(db_session, "link-rollback@example.com")
    admin = await _make_user(
        db_session, "link-rollback-admin@example.com", admin=True
    )
    org = await _make_org(db_session, owner)
    await PromoService(db_session).create(_body("LINKFAIL2026"), owner)
    request = await SubscriptionService(db_session).create_request(
        org,
        owner,
        target_sku="pro",
        cycle="monthly",
        note="",
        promo_code="LINKFAIL2026",
    )

    async def boom(self: PromoService, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("redemption failed")

    monkeypatch.setattr(PromoService, "record_redemption", boom)
    with pytest.raises(RuntimeError):
        await InvoiceService(db_session).create_invoice(
            organization_id=org.id,
            sku="pro",
            actor=admin,
            period_start=_JAN,
            promo_code="LINKFAIL2026",
            subscription_request_id=request.id,
        )

    assert await _count_invoices(db_session) == 0
    assert await _non_void_invoice_for(db_session, request.id) is None
    stored = await db_session.get(SubscriptionRequest, request.id)
    assert stored is not None
    assert stored.status == "pending"


@pytest.mark.asyncio
async def test_api_returns_409_for_a_second_invoice_on_the_same_request(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "link-api@example.com")
    admin = await _make_user(db_session, "link-api-admin@example.com", admin=True)
    org = await _make_org(db_session, owner)
    request = await SubscriptionService(db_session).create_request(
        org, owner, target_sku="pro", cycle="monthly", note="", promo_code=None
    )

    _bind(db_session)
    transport = ASGITransport(app=app)
    headers = _auth(admin)
    payload = {
        "organization_id": str(org.id),
        "sku": "pro",
        "period_start": _JAN.isoformat(),
        "subscription_request_id": str(request.id),
    }
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/admin/invoices", headers=headers, json=payload
            )
            assert first.status_code == 201, first.text
            assert first.json()["subscription_request_id"] == str(request.id)

            second = await client.post(
                "/api/admin/invoices",
                headers=headers,
                json={**payload, "period_start": _FEB.isoformat()},
            )
            assert second.status_code == 409, second.text
            assert second.json()["detail"] == "Subscription request already has an invoice"
            assert await _count_invoices(db_session) == 1
    finally:
        app.dependency_overrides.clear()


def test_org_invoice_metadata_has_the_request_link_and_partial_unique_index() -> None:
    column = OrgInvoice.__table__.c.subscription_request_id
    assert column.nullable is True
    foreign_keys = list(column.foreign_keys)
    assert len(foreign_keys) == 1
    assert foreign_keys[0].target_fullname == "subscription_requests.id"
    assert foreign_keys[0].ondelete == "SET NULL"

    indexes = {index.name: index for index in OrgInvoice.__table__.indexes}
    unique_link = indexes["uq_org_invoices_subscription_request"]
    assert unique_link.unique is True
    assert "subscription_request_id IS NOT NULL" in str(
        unique_link.dialect_options["postgresql"]["where"]
    )
    assert "subscription_request_id IS NOT NULL" in str(
        unique_link.dialect_options["sqlite"]["where"]
    )
    assert indexes["ix_org_invoices_subscription_request_id"].unique is not True
