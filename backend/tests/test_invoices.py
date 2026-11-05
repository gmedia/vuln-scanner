from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.i18n import load_catalog
from app.main import app
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization, OrganizationMembership
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.invoice import bank_copy
from app.services.invoice_html import render_invoice_html
from app.services.organization import ensure_personal_org
from app.services.scan_pdf import ScanPdfUnavailableError


async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "inv-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "inv-owner@example.com")
    member = await _make_user(db_session, "inv-member@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Invoice Org",
        slug=f"inv-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    for user, role in ((owner, "owner"), (member, "member")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role=role,
            )
        )
    await db_session.commit()
    return {"admin": admin, "owner": owner, "member": member, "org": org}


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest.mark.asyncio
async def test_new_org_sku_is_basic(db_session, ctx):
    personal = await ensure_personal_org(db_session, ctx["owner"])
    assert personal.sku == "basic"


@pytest.mark.asyncio
async def test_org_admin_cannot_patch_sku(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.patch(
                f"/api/orgs/{ctx['org'].id}",
                headers=_auth(ctx["owner"], ctx["org"].id),
                json={"sku": "multi"},
            )
            assert r.status_code == 403
            assert "billed" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_platform_admin_can_patch_sku(db_session, ctx):
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=ctx["org"].id,
            user_id=ctx["admin"].id,
            role="admin",
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.patch(
                f"/api/orgs/{ctx['org'].id}",
                headers=_auth(ctx["admin"], ctx["org"].id),
                json={"sku": "pro"},
            )
            assert r.status_code == 200
            assert r.json()["sku"] == "pro"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_invoice_snapshots_list_idr(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic"},
            )
            assert r.status_code == 201
            body = r.json()
            assert body["amount_idr"] == 300_000
            assert body["product"] == "scan"
            assert body["sku"] == "basic"
            assert body["status"] == "draft"
            assert body["number"].startswith("SX-")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invoice_seats_come_from_tier_row(db_session, ctx):
    tier = await db_session.get(SkuTier, "pro")
    assert tier is not None
    tier.limit_scan = 7
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert created.status_code == 201, created.text
            assert created.json()["seats"] == 7
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_duplicate_scan_invoice_same_period_409(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"organization_id": str(ctx["org"].id), "sku": "basic"}
            first = await client.post("/api/admin/invoices", headers=_auth(ctx["admin"]), json=payload)
            assert first.status_code == 201
            second = await client.post("/api/admin/invoices", headers=_auth(ctx["admin"]), json=payload)
            assert second.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_mark_paid_sets_org_sku(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            inv_id = created.json()["id"]
            paid = await client.post(
                f"/api/admin/invoices/{inv_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-TEST-1"},
            )
            assert paid.status_code == 200
            assert paid.json()["status"] == "paid"
            org = await db_session.get(Organization, ctx["org"].id)
            await db_session.refresh(org)
            assert org is not None
            assert org.sku == "pro"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_void_does_not_change_sku(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "multi"},
            )
            inv_id = created.json()["id"]
            voided = await client.post(
                f"/api/admin/invoices/{inv_id}/void",
                headers=_auth(ctx["admin"]),
            )
            assert voided.status_code == 200
            assert voided.json()["status"] == "void"
            org = await db_session.get(Organization, ctx["org"].id)
            await db_session.refresh(org)
            assert org is not None
            assert org.sku == "basic"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_member_cannot_list_org_invoices(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                f"/api/orgs/{ctx['org'].id}/invoices",
                headers=_auth(ctx["member"], ctx["org"].id),
            )
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_owner_lists_invoices_and_catalog(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            cat = await client.get("/api/admin/sku-catalog", headers=_auth(ctx["admin"]))
            assert cat.status_code == 200
            assert len(cat.json()["items"]) == 12
            await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic"},
            )
            listed = await client.get(
                f"/api/orgs/{ctx['org'].id}/invoices",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert listed.status_code == 200
            assert listed.json()["total"] == 1
            assert listed.json()["items"][0]["bank"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_catalog_invoicable_toggle_persists(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.put(
                "/api/admin/sku-catalog/scan/pro",
                headers=_auth(ctx["admin"]),
                json={"list_idr": 500_000, "invoicable": False},
            )
            assert r.status_code == 200
            body = r.json()
            assert body["list_idr"] == 500_000
            assert body["invoicable"] is False
            assert body["updated_by"] == str(ctx["admin"].id)
            assert body["updated_by_email"] == "inv-admin@example.com"
            cat = await client.get("/api/admin/sku-catalog", headers=_auth(ctx["admin"]))
            assert cat.status_code == 200
            row = next(i for i in cat.json()["items"] if i["product"] == "scan" and i["sku"] == "pro")
            assert row["list_idr"] == 500_000
            assert row["invoicable"] is False
            assert row["updated_by"] == str(ctx["admin"].id)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_catalog_omitting_invoicable_leaves_it_unchanged(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            before = await db_session.get(SkuCatalog, ("scan", "pro"))
            assert before is not None
            assert before.invoicable is True
            r = await client.put(
                "/api/admin/sku-catalog/scan/pro",
                headers=_auth(ctx["admin"]),
                json={"list_idr": 700_000},
            )
            assert r.status_code == 200
            body = r.json()
            assert body["list_idr"] == 700_000
            assert body["invoicable"] is True
            assert body["updated_by"] == str(ctx["admin"].id)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_catalog_updated_by_starts_null_and_records_actor(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            before = await client.get("/api/admin/sku-catalog", headers=_auth(ctx["admin"]))
            assert before.status_code == 200
            pre = next(i for i in before.json()["items"] if i["product"] == "scan" and i["sku"] == "pro")
            assert pre["updated_by"] is None

            put = await client.put(
                "/api/admin/sku-catalog/scan/pro",
                headers=_auth(ctx["admin"]),
                json={"list_idr": 600_000},
            )
            assert put.status_code == 200

            after = await client.get("/api/admin/sku-catalog", headers=_auth(ctx["admin"]))
            assert after.status_code == 200
            post = next(i for i in after.json()["items"] if i["product"] == "scan" and i["sku"] == "pro")
            assert post["updated_by"] == str(ctx["admin"].id)
            assert post["updated_by_email"] == "inv-admin@example.com"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_catalog_rejects_negative_list_idr(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.put(
                "/api/admin/sku-catalog/scan/pro",
                headers=_auth(ctx["admin"]),
                json={"list_idr": -1},
            )
            assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_catalog_unknown_row_404(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.put(
                "/api/admin/sku-catalog/scan/nope",
                headers=_auth(ctx["admin"]),
                json={"list_idr": 100_000},
            )
            assert r.status_code == 404
            assert r.json()["detail"] == "Catalog row not found"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_host_invoice_snapshots_list_idr(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic", "product": "host"},
            )
            assert r.status_code == 201
            body = r.json()
            assert body["amount_idr"] == 150_000
            assert body["product"] == "host"
            assert body["sku"] == "basic"
            assert body["status"] == "draft"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_scan_and_host_same_period_ok(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            scan = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic", "product": "scan"},
            )
            host = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro", "product": "host"},
            )
            assert scan.status_code == 201
            assert host.status_code == 201
            assert scan.json()["product"] == "scan"
            assert host.json()["product"] == "host"
            assert host.json()["amount_idr"] == 350_000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_duplicate_host_invoice_same_period_409(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"organization_id": str(ctx["org"].id), "sku": "basic", "product": "host"}
            first = await client.post("/api/admin/invoices", headers=_auth(ctx["admin"]), json=payload)
            assert first.status_code == 201
            second = await client.post("/api/admin/invoices", headers=_auth(ctx["admin"]), json=payload)
            assert second.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_mark_paid_host_does_not_set_org_sku(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "multi", "product": "host"},
            )
            inv_id = created.json()["id"]
            paid = await client.post(
                f"/api/admin/invoices/{inv_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-HOST-1"},
            )
            assert paid.status_code == 200
            assert paid.json()["status"] == "paid"
            org = await db_session.get(Organization, ctx["org"].id)
            await db_session.refresh(org)
            assert org is not None
            assert org.sku == "basic"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_rejects_not_invoicable_product(db_session, ctx):
    host_basic = await db_session.get(SkuCatalog, ("host", "basic"))
    assert host_basic is not None
    host_basic.invoicable = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic", "product": "host"},
            )
            assert r.status_code == 400
            assert "invoicable" in r.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_bank_copy_include_false():
    assert bank_copy(include=False) is None


def test_bank_copy_all_empty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_name", "")
    monkeypatch.setattr(settings, "invoice_bank_account", "  ")
    monkeypatch.setattr(settings, "invoice_bank_holder", "")
    assert bank_copy(include=True) == {"bank_name": None, "bank_account": None, "bank_holder": None}


def test_bank_copy_set_and_strip(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_name", " Bank Contoh ")
    monkeypatch.setattr(settings, "invoice_bank_account", "0000000000")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    assert bank_copy(include=True) == {
        "bank_name": "Bank Contoh",
        "bank_account": "0000000000",
        "bank_holder": "Acme Holder",
    }


def test_bank_copy_partial(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_account", "")
    monkeypatch.setattr(settings, "invoice_bank_holder", "")
    assert bank_copy(include=True) == {
        "bank_name": "Bank Contoh",
        "bank_account": None,
        "bank_holder": None,
    }


@pytest.mark.asyncio
async def test_send_includes_bank_draft_does_not(db_session, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_account", "0000000000")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic"},
            )
            assert created.status_code == 201
            assert created.json()["bank"] is None
            inv_id = created.json()["id"]
            sent = await client.post(
                f"/api/admin/invoices/{inv_id}/send",
                headers=_auth(ctx["admin"]),
            )
            assert sent.status_code == 200
            assert sent.json()["status"] == "sent"
            assert sent.json()["bank"] == {
                "bank_name": "Bank Contoh",
                "bank_account": "0000000000",
                "bank_holder": "Acme Holder",
            }
            listed = await client.get(
                f"/api/orgs/{ctx['org'].id}/invoices",
                headers=_auth(ctx["owner"], ctx["org"].id),
            )
            assert listed.status_code == 200
            assert listed.json()["items"][0]["bank"] == {
                "bank_name": "Bank Contoh",
                "bank_account": "0000000000",
                "bank_holder": "Acme Holder",
            }
    finally:
        app.dependency_overrides.clear()


_FAKE_PDF = b"%PDF-1.4\n mock"


def _sample_invoice(*, status: str, product: str = "host", sku: str = "multi") -> OrgInvoice:
    return OrgInvoice(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        number="SX-202609-0099",
        product=product,
        sku=sku,
        amount_idr=900_000,
        total_idr=900_000,
        period_start=datetime(2026, 9, 1, tzinfo=UTC),
        period_end=datetime(2026, 9, 30, tzinfo=UTC),
        due_date=datetime(2026, 9, 1, tzinfo=UTC),
        status=status,
        bank_ref="TF-UNIT" if status == "paid" else None,
        created_at=datetime(2026, 9, 2, tzinfo=UTC),
    )


_GRAND_TOTAL = re.compile(
    r'<p class="inv-totals-row inv-totals-grand"><span>[^<]*</span>'
    r'<span class="num">([^<]+)</span>'
)


def _grand_total(html: str) -> str:
    match = _GRAND_TOTAL.search(html)
    assert match is not None
    return match.group(1)


def test_render_invoice_html_zero_total_shows_zero_not_list_price() -> None:
    inv = _sample_invoice(status="sent", product="scan", sku="pro")
    inv.amount_idr = 650_000
    inv.total_idr = 0

    html = render_invoice_html(
        inv,
        org_name="Acme",
        bank=None,
        sku_label="PRO",
        seats=3,
    )

    assert _grand_total(html) == "Rp 0"
    # The list/subtotal line still carries amount_idr; only the payable line is zero.
    assert html.count("Rp 650.000") == 2


def test_render_invoice_html_total_differs_from_amount_for_pkp() -> None:
    inv = _sample_invoice(status="sent", product="scan", sku="pro")
    inv.amount_idr = 650_000
    inv.dpp_idr = 595_833
    inv.ppn_idr = 65_917
    inv.total_idr = 715_917

    html = render_invoice_html(
        inv,
        org_name="Acme",
        bank=None,
        sku_label="PRO",
        seats=3,
    )

    assert _grand_total(html) == "Rp 715.917"
    assert html.count("Rp 650.000") == 2
    assert "Rp 595.833" in html
    assert "Rp 65.917" in html


def test_render_invoice_html_sent_includes_bank_and_host_seats() -> None:
    html = render_invoice_html(
        _sample_invoice(status="sent"),
        org_name="Acme <x>",
        bank={"bank_name": "Bank Contoh", "bank_account": "999", "bank_holder": "Holder"},
        sku_label="MULTI",
        seats=10,
    )
    assert "Sinexis Host Protect" in html
    assert "<td class=\"num\">10</td>" in html
    assert "999" in html
    assert "Acme &lt;x&gt;" in html
    assert 'class="inv-pay"' in html


def test_render_invoice_html_paid_omits_bank_account() -> None:
    html = render_invoice_html(
        _sample_invoice(status="paid", product="scan", sku="basic"),
        org_name="Acme",
        bank={"bank_name": "Bank Contoh", "bank_account": "SHOULD-NOT", "bank_holder": "Holder"},
        sku_label="BASIC",
        seats=1,
    )
    assert "SHOULD-NOT" not in html
    assert 'class="inv-pay"' not in html
    assert "TF-UNIT" in html
    assert "<td class=\"num\">1</td>" in html


def test_render_invoice_html_draft_omits_bank() -> None:
    html = render_invoice_html(
        _sample_invoice(status="draft", product="scan", sku="pro"),
        org_name=None,
        bank={"bank_name": "Bank Contoh", "bank_account": "SHOULD-NOT", "bank_holder": "Holder"},
        sku_label="PRO",
        seats=3,
    )
    assert "SHOULD-NOT" not in html
    # Bill-to falls back to an em dash when org_name is None (locale-independent).
    assert re.search(r'<p class="inv-party-name">—</p>', html) is not None
    assert "<td class=\"num\">3</td>" in html


@pytest.mark.parametrize(
    ("locale", "pay_label", "status_label"),
    [("id", "Pembayaran", "Terkirim"), ("en", "Payment", "Sent")],
)
def test_render_invoice_html_localizes_labels(locale: str, pay_label: str, status_label: str) -> None:
    html = render_invoice_html(
        _sample_invoice(status="sent"),
        org_name="Acme",
        bank={"bank_name": "Bank Contoh", "bank_account": "999", "bank_holder": "Holder"},
        locale=locale,
        sku_label="MULTI",
        seats=10,
    )
    assert pay_label in html
    assert status_label in html
    assert f'lang="{locale}"' in html


def test_render_invoice_html_uses_supplied_tier_label_and_seats() -> None:
    html = render_invoice_html(
        _sample_invoice(status="draft", product="scan", sku="basic"),
        org_name="Acme",
        bank=None,
        sku_label="Pro Plus",
        seats=99,
    )
    assert "Sinexis Scan — Pro Plus" in html
    assert '<td class="num">99</td>' in html
    assert "Sinexis Scan — BASIC" not in html

def test_invoice_catalog_key_parity() -> None:
    assert set(load_catalog("id", "invoice")) == set(load_catalog("en", "invoice"))


_PRODUCT_LABEL_CASES = [
    ("scan", "Sinexis Scan", {"basic": 1, "pro": 3, "multi": 10}),
    ("host", "Sinexis Host Protect", {"basic": 1, "pro": 3, "multi": 10}),
    ("uptime", "Sinexis Uptime", {"basic": 10, "pro": 50, "multi": 200}),
    ("guard", "Sinexis Guard", {"basic": 1, "pro": 3, "multi": 10}),
]


@pytest.mark.parametrize(
    ("product", "label", "sku", "expected_seats"),
    [(product, label, sku, seats) for product, label, skus in _PRODUCT_LABEL_CASES for sku, seats in skus.items()],
)
def test_render_invoice_html_friendly_label_and_seats_per_product(
    product: str, label: str, sku: str, expected_seats: int
) -> None:
    html = render_invoice_html(
        _sample_invoice(status="draft", product=product, sku=sku),
        org_name="Acme",
        bank=None,
        sku_label=sku.upper(),
        seats=expected_seats,
    )
    assert f"{label} — {sku.upper()}" in html
    assert f">{product} —" not in html
    seats_match = re.search(r'<td class="num">(\d+)</td>', html)
    assert seats_match is not None
    assert int(seats_match.group(1)) == expected_seats


async def _create_and_send(client: AsyncClient, ctx: dict[str, object]) -> tuple[str, str]:
    org = ctx["org"]
    admin = ctx["admin"]
    assert isinstance(org, Organization)
    assert isinstance(admin, User)
    created = await client.post(
        "/api/admin/invoices",
        headers=_auth(admin),
        json={"organization_id": str(org.id), "sku": "basic"},
    )
    assert created.status_code == 201
    inv_id = str(created.json()["id"])
    number = str(created.json()["number"])
    sent = await client.post(f"/api/admin/invoices/{inv_id}/send", headers=_auth(admin))
    assert sent.status_code == 200
    return inv_id, number


@pytest.mark.asyncio
async def test_admin_export_pdf_sent_includes_bank(db_session, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_account", "0000000000")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv_id, number = await _create_and_send(client, ctx)
            with patch("app.services.invoice.render_scan_pdf", return_value=_FAKE_PDF) as mock_pdf:
                resp = await client.get(
                    f"/api/admin/invoices/{inv_id}/export",
                    headers=_auth(ctx["admin"]),
                    params={"format": "pdf"},
                )
            assert resp.status_code == 200
            assert "application/pdf" in resp.headers.get("content-type", "")
            disposition = resp.headers.get("content-disposition", "")
            assert "attachment" in disposition
            assert f'filename="invoice_{number}.pdf"' in disposition
            assert resp.content.startswith(b"%PDF")
            html_arg = mock_pdf.call_args[0][0]
            assert "0000000000" in html_arg
            assert "Invoice Org" in html_arg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_export_pdf_paid_omits_bank_account(db_session, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_account", "SHOULD-NOT")
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv_id, _number = await _create_and_send(client, ctx)
            paid = await client.post(
                f"/api/admin/invoices/{inv_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-PDF-1"},
            )
            assert paid.status_code == 200
            with patch("app.services.invoice.render_scan_pdf", return_value=_FAKE_PDF) as mock_pdf:
                resp = await client.get(
                    f"/api/admin/invoices/{inv_id}/export",
                    headers=_auth(ctx["admin"]),
                    params={"format": "pdf"},
                )
            assert resp.status_code == 200
            html_arg = mock_pdf.call_args[0][0]
            assert "SHOULD-NOT" not in html_arg
            assert "TF-PDF-1" in html_arg
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_export_pdf_draft_omits_bank(db_session, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_account", "SHOULD-NOT")
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic"},
            )
            inv_id = created.json()["id"]
            with patch("app.services.invoice.render_scan_pdf", return_value=_FAKE_PDF) as mock_pdf:
                resp = await client.get(
                    f"/api/admin/invoices/{inv_id}/export",
                    headers=_auth(ctx["admin"]),
                    params={"format": "pdf"},
                )
            assert resp.status_code == 200
            assert "SHOULD-NOT" not in mock_pdf.call_args[0][0]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_export_pdf_404_and_403_and_400(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            missing = await client.get(
                f"/api/admin/invoices/{uuid.uuid4()}/export",
                headers=_auth(ctx["admin"]),
                params={"format": "pdf"},
            )
            assert missing.status_code == 404
            assert missing.json()["detail"] == "Invoice not found"
            forbidden = await client.get(
                f"/api/admin/invoices/{uuid.uuid4()}/export",
                headers=_auth(ctx["owner"]),
                params={"format": "pdf"},
            )
            assert forbidden.status_code == 403
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "basic"},
            )
            bad = await client.get(
                f"/api/admin/invoices/{created.json()['id']}/export",
                headers=_auth(ctx["admin"]),
                params={"format": "html"},
            )
            assert bad.status_code == 400
            assert bad.json()["detail"] == "format must be 'pdf'"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_export_pdf_unavailable_503(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv_id, _number = await _create_and_send(client, ctx)
            with patch(
                "app.services.invoice.render_scan_pdf",
                side_effect=ScanPdfUnavailableError("PDF rendering unavailable"),
            ):
                resp = await client.get(
                    f"/api/admin/invoices/{inv_id}/export",
                    headers=_auth(ctx["admin"]),
                    params={"format": "pdf"},
                )
            assert resp.status_code == 503
            assert resp.json()["detail"] == "PDF rendering unavailable"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_org_export_pdf_owner_member_and_other_org(db_session, ctx, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "invoice_bank_account", "0000000000")
    monkeypatch.setattr(settings, "invoice_bank_name", "Bank Contoh")
    monkeypatch.setattr(settings, "invoice_bank_holder", "Acme Holder")
    other = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"other-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=ctx["owner"].id,
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=other.id,
            user_id=ctx["owner"].id,
            role="owner",
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv_id, number = await _create_and_send(client, ctx)
            with patch("app.services.invoice.render_scan_pdf", return_value=_FAKE_PDF):
                owner = await client.get(
                    f"/api/orgs/{ctx['org'].id}/invoices/{inv_id}/export",
                    headers=_auth(ctx["owner"], ctx["org"].id),
                    params={"format": "pdf"},
                )
            assert owner.status_code == 200
            assert owner.content.startswith(b"%PDF")
            assert f'filename="invoice_{number}.pdf"' in owner.headers.get("content-disposition", "")
            member = await client.get(
                f"/api/orgs/{ctx['org'].id}/invoices/{inv_id}/export",
                headers=_auth(ctx["member"], ctx["org"].id),
                params={"format": "pdf"},
            )
            assert member.status_code == 403
            foreign = await client.get(
                f"/api/orgs/{other.id}/invoices/{inv_id}/export",
                headers=_auth(ctx["owner"], other.id),
                params={"format": "pdf"},
            )
            assert foreign.status_code == 404
            assert foreign.json()["detail"] == "Invoice not found"
            bad = await client.get(
                f"/api/orgs/{ctx['org'].id}/invoices/{inv_id}/export",
                headers=_auth(ctx["owner"], ctx["org"].id),
                params={"format": "html"},
            )
            assert bad.status_code == 400
            assert bad.json()["detail"] == "format must be 'pdf'"
    finally:
        app.dependency_overrides.clear()


def test_compose_backend_passes_invoice_bank_env() -> None:
    root = Path(__file__).resolve().parents[2]
    required = (
        "INVOICE_BANK_NAME:",
        "INVOICE_BANK_ACCOUNT:",
        "INVOICE_BANK_HOLDER:",
    )
    for rel in ("docker-compose.yml", "docker-compose.prod.yml"):
        text = (root / rel).read_text(encoding="utf-8")
        idx = text.find("container_name: vuln-backend")
        assert idx != -1, rel
        window = text[idx : idx + 2500]
        for needle in required:
            assert needle in window, (rel, needle)


@pytest.mark.asyncio
async def test_sku_prices_lists_all_four_services(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/admin/sku-prices", headers=_auth(ctx["admin"]))
            assert r.status_code == 200
            items = r.json()["items"]
            by = {(i["service"], i["sku"]): i for i in items}
            # 4 services x 3 skus
            assert len(items) == 12
            # scan/host come from the catalog and are invoicable
            assert by[("scan", "pro")]["list_idr"] == 650_000
            assert by[("scan", "pro")]["invoicable"] is True
            assert by[("host", "basic")]["list_idr"] == 150_000
            # uptime/guard are catalog rows now, prices stay the locked constants
            assert by[("uptime", "basic")]["list_idr"] == 75_000
            assert by[("uptime", "multi")]["list_idr"] == 500_000
            assert by[("uptime", "basic")]["invoicable"] is True
            assert by[("guard", "pro")]["list_idr"] == 250_000
            assert by[("guard", "multi")]["list_idr"] == 600_000
            assert by[("guard", "pro")]["invoicable"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_uptime_and_guard_are_invoiceable(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for product, sku, amount in (("uptime", "basic", 75_000), ("guard", "multi", 600_000)):
                r = await client.post(
                    "/api/admin/invoices",
                    headers=_auth(ctx["admin"]),
                    json={"organization_id": str(ctx["org"].id), "sku": sku, "product": product},
                )
                assert r.status_code == 201
                body = r.json()
                assert body["product"] == product
                assert body["sku"] == sku
                assert body["amount_idr"] == amount
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_sku_prices_includes_locked_bundle_and_annual(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/admin/sku-prices", headers=_auth(ctx["admin"]))
            assert r.status_code == 200
            body = r.json()
            by = {b["tier"]: b for b in body["bundles"]}
            assert by["basic"]["bundle_idr"] == 450_000
            assert by["basic"]["alacarte_idr"] == 625_000
            assert by["basic"]["saving_idr"] == 175_000
            assert by["basic"]["saving_pct"] == 28.0
            assert by["pro"]["bundle_idr"] == 1_000_000
            assert by["pro"]["alacarte_idr"] == 1_450_000
            assert by["pro"]["saving_idr"] == 450_000
            assert by["pro"]["saving_pct"] == 31.0
            assert by["multi"]["bundle_idr"] == 2_900_000
            assert by["multi"]["alacarte_idr"] == 4_000_000
            assert by["multi"]["saving_idr"] == 1_100_000
            assert by["multi"]["saving_pct"] == 27.5
            assert body["annual"] == {"months_paid": 10, "months_served": 12}
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_create_invoice_defaults_due_date_to_period_start(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            assert body["due_date"].startswith("2026-09-01")
            assert body["sent_at"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_invoice_accepts_custom_due_date(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "due_date": "2026-09-30T00:00:00Z",
                },
            )
            assert created.status_code == 201, created.text
            assert created.json()["due_date"].startswith("2026-09-30")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_send_invoice_stamps_sent_at(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                },
            )
            sent = await client.post(
                f"/api/admin/invoices/{created.json()['id']}/send",
                headers=_auth(ctx["admin"]),
            )
            assert sent.status_code == 200, sent.text
            body = sent.json()
            assert body["status"] == "sent"
            assert body["sent_at"] is not None
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_annual_invoice_covers_twelve_months_at_ten_months_price(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "cycle": "annual",
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            assert body["period_start"].startswith("2026-09-01")
            assert body["period_end"].startswith("2027-08-31")
            # 10 months for 12: 650_000 x 10
            assert body["amount_idr"] == 6_500_000
            assert body["total_idr"] == 6_500_000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_annual_invoice_tax_uses_the_annual_base(db_session, ctx):
    from app.models.billing import OrgBillingProfile

    db_session.add(
        OrgBillingProfile(
            organization_id=ctx["org"].id,
            pkp_status="pkp",
            payment_terms_days=30,
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "cycle": "annual",
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            # DPP = 6_500_000 * 11/12 = 5_958_333; PPN = 12% = 715_000
            assert body["dpp_idr"] == 5_958_333
            assert body["ppn_idr"] == 715_000
            assert body["total_idr"] == 7_215_000
            assert body["pph23_idr"] == 130_000
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_annual_invoice_cannot_overlap_a_monthly_invoice(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            monthly = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                },
            )
            assert monthly.status_code == 201, monthly.text

            annual = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "cycle": "annual",
                },
            )
            assert annual.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_monthly_invoice_cannot_overlap_an_annual_invoice(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            annual = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "cycle": "annual",
                },
            )
            assert annual.status_code == 201, annual.text

            monthly = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-10-01T00:00:00Z",
                },
            )
            assert monthly.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_paid_annual_invoice_sets_the_subscription_cycle(db_session, ctx):
    from sqlalchemy import select

    from app.models.billing import Subscription

    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "pro",
                    "period_start": "2026-09-01T00:00:00Z",
                    "cycle": "annual",
                },
            )
            assert created.status_code == 201, created.text
            paid = await client.post(
                f"/api/admin/invoices/{created.json()['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-ANNUAL-1"},
            )
            assert paid.status_code == 200, paid.text

            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            assert sub.cycle == "annual"
            assert sub.status == "active"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_catalog_rows_surface_label_and_active(db_session, ctx):
    tier = await db_session.get(SkuTier, "multi")
    assert tier is not None
    tier.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            cat = await client.get("/api/admin/sku-catalog", headers=_auth(ctx["admin"]))
            assert cat.status_code == 200
            rows = {(row["product"], row["sku"]): row for row in cat.json()["items"]}
            assert rows[("scan", "multi")]["label"] == "Multi"
            assert rows[("scan", "multi")]["active"] is False
            assert rows[("scan", "basic")]["label"] == "Basic"
            assert rows[("scan", "basic")]["active"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_invoice_rejects_retired_tier_for_another_org(db_session, ctx):
    tier = await db_session.get(SkuTier, "pro")
    assert tier is not None
    tier.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert response.status_code == 400
            assert response.json()["detail"] == "Tier is retired"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_invoice_allows_retired_tier_for_current_org(db_session, ctx):
    org = await db_session.get(Organization, ctx["org"].id)
    tier = await db_session.get(SkuTier, "pro")
    assert org is not None and tier is not None
    org.sku = "pro"
    tier.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert response.status_code == 201, response.text
            assert response.json()["sku"] == "pro"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_stale_invoice_cannot_move_another_org_to_retired_tier(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert created.status_code == 201
            inv_id = created.json()["id"]
            tier = await db_session.get(SkuTier, "pro")
            assert tier is not None
            tier.active = False
            await db_session.commit()
            paid = await client.post(
                f"/api/admin/invoices/{inv_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-STALE-1"},
            )
            assert paid.status_code == 409
            assert paid.json()["detail"] == "Tier is retired"
            org = await db_session.get(Organization, ctx["org"].id)
            await db_session.refresh(org)
            assert org is not None and org.sku == "basic"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_existing_invoice_for_current_retired_tier_stays_payable(db_session, ctx):
    org = await db_session.get(Organization, ctx["org"].id)
    assert org is not None
    org.sku = "pro"
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={"organization_id": str(ctx["org"].id), "sku": "pro"},
            )
            assert created.status_code == 201
            inv_id = created.json()["id"]
            tier = await db_session.get(SkuTier, "pro")
            assert tier is not None
            tier.active = False
            await db_session.commit()
            paid = await client.post(
                f"/api/admin/invoices/{inv_id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-GRANDFATHERED-1"},
            )
            assert paid.status_code == 200, paid.text
            assert paid.json()["status"] == "paid"
            await db_session.refresh(org)
            assert org.sku == "pro"
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_create_invoice_retries_with_a_session_bound_actor(
    db_session: AsyncSession,
    ctx,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The retry must survive ``rollback()`` expiring the acting user.

    ``Session.rollback()`` expires every ORM instance even with
    ``expire_on_commit=False``. The retry therefore has to rebind the actor to a
    loaded instance; otherwise the next ``actor.id`` read raises
    ``MissingGreenlet`` on the real (session-bound) actor routes use.
    """
    from app.services.invoice import InvoiceService

    other_org = Organization(
        id=uuid.uuid4(),
        name="Other Invoice Org",
        slug=f"inv-other-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=ctx["admin"].id,
    )
    db_session.add(other_org)
    db_session.add(
        OrgInvoice(
            id=uuid.uuid4(),
            organization_id=other_org.id,
            number="SX-202603-0001",
            product="scan",
            sku="basic",
            amount_idr=300_000,
            total_idr=300_000,
            period_start=datetime(2026, 1, 1, tzinfo=UTC),
            period_end=datetime(2026, 1, 31, 23, 59, 59, 999999, tzinfo=UTC),
            due_date=datetime(2026, 1, 8, tzinfo=UTC),
            status="sent",
        )
    )
    await db_session.commit()

    numbers = iter(["SX-202603-0001", "SX-202603-0042"])
    calls: list[datetime] = []

    async def fake_next_invoice_number(db: AsyncSession, period_start: datetime) -> str:
        del db
        calls.append(period_start)
        return next(numbers)

    monkeypatch.setattr(
        "app.services.invoice.next_invoice_number", fake_next_invoice_number
    )

    actor = await db_session.get(User, ctx["admin"].id)
    assert actor is not None
    assert actor is ctx["admin"]
    assert inspect(actor).session is db_session.sync_session

    invoice = await InvoiceService(db_session).create_invoice(
        organization_id=ctx["org"].id,
        sku="basic",
        actor=actor,
        period_start=datetime(2026, 3, 1, tzinfo=UTC),
    )

    assert len(calls) == 2
    assert invoice.number == "SX-202603-0042"
    assert inspect(actor).session is db_session.sync_session

    committed = await db_session.scalar(
        select(func.count())
        .select_from(OrgInvoice)
        .where(OrgInvoice.organization_id == ctx["org"].id)
    )
    assert committed == 1
