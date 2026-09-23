from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization, OrganizationMembership
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
            assert len(cat.json()["items"]) == 6
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
        period_start=datetime(2026, 9, 1, tzinfo=UTC),
        period_end=datetime(2026, 9, 30, tzinfo=UTC),
        status=status,
        bank_ref="TF-UNIT" if status == "paid" else None,
        created_at=datetime(2026, 9, 2, tzinfo=UTC),
    )


def test_render_invoice_html_sent_includes_bank_and_host_seats() -> None:
    html = render_invoice_html(
        _sample_invoice(status="sent"),
        org_name="Acme <x>",
        bank={"bank_name": "Bank Contoh", "bank_account": "999", "bank_holder": "Holder"},
    )
    assert "Sinexis Host Protect" in html
    assert "<td class=\"num\">10</td>" in html
    assert "999" in html
    assert "Acme &lt;x&gt;" in html
    assert "Payment" in html


def test_render_invoice_html_paid_omits_bank_account() -> None:
    html = render_invoice_html(
        _sample_invoice(status="paid", product="scan", sku="basic"),
        org_name="Acme",
        bank={"bank_name": "Bank Contoh", "bank_account": "SHOULD-NOT", "bank_holder": "Holder"},
    )
    assert "SHOULD-NOT" not in html
    assert "Payment" not in html
    assert "TF-UNIT" in html
    assert "<td class=\"num\">1</td>" in html


def test_render_invoice_html_draft_omits_bank() -> None:
    html = render_invoice_html(
        _sample_invoice(status="draft", product="scan", sku="pro"),
        org_name=None,
        bank={"bank_name": "Bank Contoh", "bank_account": "SHOULD-NOT", "bank_holder": "Holder"},
    )
    assert "SHOULD-NOT" not in html
    assert "Bill to —" in html
    assert "<td class=\"num\">3</td>" in html


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
