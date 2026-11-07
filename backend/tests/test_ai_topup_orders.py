"""AI top-up S2: manual-transfer orders, proof upload and admin verification."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import AiTopupOrder, AiWalletLedger
from app.models.billing import PaymentAttempt, Subscription
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services import ai_topup as service
from app.services.ai_topup import create_pack
from app.services.ai_wallet import get_wallet
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PDF = b"%PDF-1.4\n" + b"\x00" * 64
REFERENCE_RE = re.compile(r"^\d{6}-[A-Z2-7]{6}$")


def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def api(db_session: AsyncSession):
    _bind(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _proof_storage(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    monkeypatch.setattr(settings, "object_storage_backend", "local")


@pytest.fixture(autouse=True)
def _bank(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "invoice_bank_name", "BCA")
    monkeypatch.setattr(settings, "invoice_bank_account", "1234567890")
    monkeypatch.setattr(settings, "invoice_bank_holder", "PT Sinexis")


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


async def _make_user(db: AsyncSession, email: str, *, admin: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=admin,
        credits=100,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_org(db: AsyncSession, name: str, owner: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.flush()
    db.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    await db.commit()
    await db.refresh(org)
    return org


async def _add_member(db: AsyncSession, org: Organization, user: User, role: str) -> None:
    db.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=user.id,
            role=role,
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    platform_admin = await _make_user(db_session, "topup-platform-admin@example.com", admin=True)
    owner = await _make_user(db_session, "topup-owner@example.com")
    org_admin = await _make_user(db_session, "topup-org-admin@example.com")
    member = await _make_user(db_session, "topup-member@example.com")
    viewer = await _make_user(db_session, "topup-viewer@example.com")
    outsider = await _make_user(db_session, "topup-outsider@example.com")

    org = await _make_org(db_session, "Topup Org", owner)
    other_org = await _make_org(db_session, "Other Topup Org", outsider)
    await _add_member(db_session, org, org_admin, "admin")
    await _add_member(db_session, org, member, "member")
    await _add_member(db_session, org, viewer, "viewer")

    pack = await create_pack(db_session, code="p100", label="Rp 100.000", amount_idr=100_000)
    inactive = await create_pack(
        db_session,
        code="p50",
        label="Rp 50.000",
        amount_idr=50_000,
        active=False,
    )
    bonus_pack = await create_pack(
        db_session,
        code="p200",
        label="Rp 200.000",
        amount_idr=200_000,
        bonus_idr=20_000,
    )
    return {
        "platform_admin": platform_admin,
        "owner": owner,
        "org_admin": org_admin,
        "member": member,
        "viewer": viewer,
        "outsider": outsider,
        "org": org,
        "other_org": other_org,
        "pack": pack,
        "inactive": inactive,
        "bonus_pack": bonus_pack,
    }


async def _create_order(
    api: AsyncClient,
    user: User,
    org: Organization,
    pack_id: uuid.UUID,
    *,
    method: str = "manual_transfer",
) -> dict[str, Any]:
    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(user, org.id),
        json={"pack_id": str(pack_id), "method": method},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _upload_proof(
    api: AsyncClient,
    user: User,
    org: Organization,
    order_id: str,
    *,
    data: bytes = PNG,
    mime: str = "image/png",
    filename: str = "proof.png",
) -> Any:
    return await api.post(
        f"/api/ai/topup/orders/{order_id}/proof",
        headers=_auth(user, org.id),
        files={"file": (filename, data, mime)},
    )


async def _ledger_rows(db: AsyncSession, order_id: uuid.UUID | str) -> list[AiWalletLedger]:
    rows = (
        (await db.execute(select(AiWalletLedger).where(AiWalletLedger.topup_order_id == uuid.UUID(str(order_id)))))
        .scalars()
        .all()
    )
    return list(rows)


# --- create ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_order_copies_server_amount_and_reference(api, ctx, ai_on) -> None:
    body = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id, method="manual_transfer")

    assert body["amount_idr"] == 100_000
    assert body["credit_idr"] == 100_000
    assert body["bonus_idr"] == 0
    assert body["payment_method"] == "manual_transfer"
    assert body["status"] == "pending_payment"
    assert REFERENCE_RE.match(body["reference_code"])
    assert body["bank"]["bank_name"] == "BCA"
    assert body["expires_at"] is not None


@pytest.mark.asyncio
async def test_create_order_ignores_client_amount(api, ctx, ai_on) -> None:
    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(ctx["owner"], ctx["org"].id),
        json={"pack_id": str(ctx["pack"].id), "method": "manual_transfer", "amount_idr": 1},
    )
    assert response.status_code == 201, response.text
    assert response.json()["amount_idr"] == 100_000


@pytest.mark.asyncio
async def test_create_order_applies_bonus_to_credit(api, ctx, ai_on) -> None:
    body = await _create_order(api, ctx["owner"], ctx["org"], ctx["bonus_pack"].id)
    assert body["amount_idr"] == 200_000
    assert body["bonus_idr"] == 20_000
    assert body["credit_idr"] == 220_000


@pytest.mark.asyncio
async def test_create_order_rejects_inactive_pack(api, ctx, ai_on) -> None:
    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(ctx["owner"], ctx["org"].id),
        json={"pack_id": str(ctx["inactive"].id), "method": "manual_transfer"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_order_rejects_midtrans_in_s2(api, ctx, ai_on) -> None:
    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(ctx["owner"], ctx["org"].id),
        json={"pack_id": str(ctx["pack"].id), "method": "midtrans"},
    )
    assert response.status_code == 409
    assert "checkout" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_order_requires_bank_copy(api, ctx, ai_on, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "invoice_bank_name", "")
    monkeypatch.setattr(settings, "invoice_bank_account", "")
    monkeypatch.setattr(settings, "invoice_bank_holder", "")

    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(ctx["owner"], ctx["org"].id),
        json={"pack_id": str(ctx["pack"].id), "method": "manual_transfer"},
    )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_create_order_service_retries_reference_collision(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = datetime.now(UTC)
    db_session.add(
        AiTopupOrder(
            organization_id=ctx["other_org"].id,
            reference_code="260101-BBBBBB",
            amount_idr=1000,
            credit_idr=1000,
            bonus_idr=0,
            payment_method="manual_transfer",
            status="pending_payment",
            expires_at=now,
        )
    )
    await db_session.commit()

    codes = iter(["260101-BBBBBB", "260101-BBBBBB", "260101-CCCCCC"])
    monkeypatch.setattr(service, "_reference_code", lambda now: next(codes))

    order, _bank = await service.create_order(
        db_session,
        org_id=ctx["org"].id,
        actor=ctx["owner"],
        pack_id=ctx["pack"].id,
        method="manual_transfer",
        now=now,
    )
    assert order.reference_code == "260101-CCCCCC"


# --- auth -----------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("role_key", ["owner", "org_admin"])
async def test_create_order_allows_org_owner_and_admin(api, ctx, ai_on, role_key) -> None:
    body = await _create_order(api, ctx[role_key], ctx["org"], ctx["pack"].id)
    assert body["status"] == "pending_payment"


@pytest.mark.asyncio
@pytest.mark.parametrize("role_key", ["member", "viewer"])
async def test_create_order_denies_member_and_viewer(api, ctx, ai_on, role_key) -> None:
    response = await api.post(
        "/api/ai/topup/orders",
        headers=_auth(ctx[role_key], ctx["org"].id),
        json={"pack_id": str(ctx["pack"].id), "method": "manual_transfer"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_foreign_org_cannot_read_order(api, ctx, ai_on) -> None:
    body = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await api.get(
        f"/api/ai/topup/orders/{body['id']}",
        headers=_auth(ctx["outsider"], ctx["other_org"].id),
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_customer_routes_404_when_flag_off(api, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", False)

    response = await api.get("/api/ai/topup/packs", headers=_auth(ctx["owner"], ctx["org"].id))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_past_due_org_can_still_top_up(api, db_session: AsyncSession, ctx, ai_on) -> None:
    db_session.add(
        Subscription(
            organization_id=ctx["org"].id,
            sku="basic",
            status="past_due",
            cycle="monthly",
        )
    )
    await db_session.commit()

    body = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    assert body["status"] == "pending_payment"


# --- proof ----------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("data", "mime", "filename"),
    [
        (JPEG, "image/jpeg", "proof.jpg"),
        (PNG, "image/png", "proof.png"),
        (PDF, "application/pdf", "proof.pdf"),
    ],
)
async def test_upload_proof_accepts_allowed_magic_bytes(api, ctx, ai_on, data: bytes, mime: str, filename: str) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=data, mime=mime, filename=filename)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "awaiting_verification"
    assert body["has_proof"] is True
    assert body["proof_uploaded_at"] is not None
    assert "proof_object_key" not in body


@pytest.mark.asyncio
async def test_upload_proof_uses_sniffed_mime_not_client_type(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await _upload_proof(
        api, ctx["owner"], ctx["org"], order["id"], data=JPEG, mime="application/pdf", filename="x.pdf"
    )
    assert response.status_code == 200, response.text

    row = await db_session.get(AiTopupOrder, uuid.UUID(order["id"]))
    assert row is not None
    assert row.proof_mime == "image/jpeg"
    assert row.proof_size_bytes == len(JPEG)


@pytest.mark.asyncio
async def test_upload_proof_rejects_spoofed_content(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=b"not an image", mime="image/png")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_upload_proof_rejects_oversize(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    oversized = b"\xff\xd8\xff" + b"\x00" * (5 * 1024 * 1024)

    response = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=oversized, mime="image/jpeg")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_proof_can_be_replaced(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    first = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=PNG)
    assert first.status_code == 200

    second = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=PDF, mime="application/pdf")
    assert second.status_code == 200, second.text

    row = await db_session.get(AiTopupOrder, uuid.UUID(order["id"]))
    assert row is not None
    assert row.proof_mime == "application/pdf"
    assert row.status == "awaiting_verification"


@pytest.mark.asyncio
async def test_proof_rejected_after_paid(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])
    approved = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={"bank_ref": "TRX-1"},
    )
    assert approved.status_code == 200, approved.text

    response = await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])
    assert response.status_code == 409


# --- approve --------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_credits_once_and_creates_manual_attempt(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])

    response = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={"bank_ref": "TRX-123"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "paid"
    assert body["bank_ref"] == "TRX-123"
    assert body["verified_by_user_id"] == str(ctx["platform_admin"].id)
    assert "proof_object_key" not in body

    ledger = await _ledger_rows(db_session, order["id"])
    assert len(ledger) == 1
    assert ledger[0].kind == "topup"
    assert ledger[0].note == order["reference_code"]
    assert ledger[0].delta_idr == order["credit_idr"]

    wallet = await get_wallet(db_session, ctx["org"].id)
    assert wallet is not None
    assert wallet.balance_idr == order["credit_idr"]

    attempt = (
        await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.topup_order_id == uuid.UUID(order["id"])))
    ).scalar_one()
    assert attempt.provider == "manual"
    assert attempt.payable_kind == "topup"
    assert attempt.status == "succeeded"
    assert attempt.amount_idr == order["amount_idr"]
    assert attempt.method == "bank_transfer"
    assert attempt.provider_ref == "TRX-123"
    assert attempt.created_by_user_id == ctx["platform_admin"].id

    total = (await db_session.execute(select(func.sum(AiWalletLedger.delta_idr)))).scalar() or 0
    assert total == wallet.balance_idr


@pytest.mark.asyncio
async def test_approve_is_idempotent(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])

    first = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={},
    )
    assert first.status_code == 200, first.text

    second = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={},
    )
    assert second.status_code == 200, second.text

    ledger = await _ledger_rows(db_session, order["id"])
    assert len(ledger) == 1
    wallet = await get_wallet(db_session, ctx["org"].id)
    assert wallet is not None
    assert wallet.balance_idr == order["credit_idr"]


@pytest.mark.asyncio
async def test_approve_rejects_pending_attempt_without_force(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])
    db_session.add(
        PaymentAttempt(
            organization_id=ctx["org"].id,
            provider="midtrans",
            payable_kind="topup",
            topup_order_id=uuid.UUID(order["id"]),
            amount_idr=order["amount_idr"],
            status="pending",
            method="qris",
        )
    )
    await db_session.commit()

    blocked = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={},
    )
    assert blocked.status_code == 409

    forced = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={"force": True},
    )
    assert forced.status_code == 200, forced.text

    attempt = (
        (
            await db_session.execute(
                select(PaymentAttempt).where(PaymentAttempt.topup_order_id == uuid.UUID(order["id"]))
            )
        )
        .scalars()
        .all()
    )
    statuses = {row.status for row in attempt}
    assert "pending" not in statuses
    assert len(await _ledger_rows(db_session, order["id"])) == 1


@pytest.mark.asyncio
async def test_approve_requires_awaiting_verification(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={},
    )
    assert response.status_code == 409


# --- reject ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_reject_sets_status_without_credit(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])

    response = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/reject",
        headers=_auth(ctx["platform_admin"]),
        json={"reason": "Nominal tidak sesuai"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] == "Nominal tidak sesuai"
    assert "proof_object_key" not in body

    assert await _ledger_rows(db_session, order["id"]) == []
    wallet = await get_wallet(db_session, ctx["org"].id)
    assert wallet is None or wallet.balance_idr == 0


@pytest.mark.asyncio
async def test_reject_is_idempotent(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])

    first = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/reject",
        headers=_auth(ctx["platform_admin"]),
        json={"reason": "Bukti tidak jelas"},
    )
    assert first.status_code == 200

    second = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/reject",
        headers=_auth(ctx["platform_admin"]),
        json={"reason": "other"},
    )
    assert second.status_code == 200
    assert second.json()["rejection_reason"] == "Bukti tidak jelas"


# --- cancel ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancel_order_and_blocks_later_approve(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)

    response = await api.post(
        f"/api/ai/topup/orders/{order['id']}/cancel",
        headers=_auth(ctx["owner"], ctx["org"].id),
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "canceled"

    assert await _ledger_rows(db_session, order["id"]) == []

    approve = await api.post(
        f"/api/admin/ai/topup/orders/{order['id']}/approve",
        headers=_auth(ctx["platform_admin"]),
        json={},
    )
    assert approve.status_code == 409


@pytest.mark.asyncio
async def test_cancel_also_stops_pending_attempt(api, db_session, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    attempt = PaymentAttempt(
        organization_id=ctx["org"].id,
        provider="midtrans",
        payable_kind="topup",
        topup_order_id=uuid.UUID(order["id"]),
        amount_idr=order["amount_idr"],
        status="pending",
        method="qris",
    )
    db_session.add(attempt)
    await db_session.commit()

    response = await api.post(
        f"/api/ai/topup/orders/{order['id']}/cancel",
        headers=_auth(ctx["owner"], ctx["org"].id),
    )
    assert response.status_code == 200, response.text

    await db_session.refresh(attempt)
    # PAYMENT_ATTEMPT_STATUSES has no "canceled"; S2 retires it as "expired".
    assert attempt.status == "expired"


# --- admin proof download -------------------------------------------------


@pytest.mark.asyncio
async def test_admin_downloads_proof_with_nosniff(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"], data=PDF, mime="application/pdf")

    response = await api.get(
        f"/api/admin/ai/topup/orders/{order['id']}/proof",
        headers=_auth(ctx["platform_admin"]),
    )
    assert response.status_code == 200, response.text
    assert response.content == PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]
    assert "attachment" in response.headers["content-disposition"]


@pytest.mark.asyncio
async def test_admin_proof_download_404_when_missing(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    response = await api.get(
        f"/api/admin/ai/topup/orders/{order['id']}/proof",
        headers=_auth(ctx["platform_admin"]),
    )
    assert response.status_code == 404


# --- admin queue availability --------------------------------------------


@pytest.mark.asyncio
async def test_admin_queue_survives_flag_off(api, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", False)

    listed = await api.get("/api/admin/ai/topup/orders", headers=_auth(ctx["platform_admin"]))
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 0


@pytest.mark.asyncio
async def test_admin_list_filters_and_names(api, ctx, ai_on) -> None:
    order = await _create_order(api, ctx["owner"], ctx["org"], ctx["pack"].id)
    await _upload_proof(api, ctx["owner"], ctx["org"], order["id"])

    listed = await api.get(
        "/api/admin/ai/topup/orders?status=awaiting_verification",
        headers=_auth(ctx["platform_admin"]),
    )
    assert listed.status_code == 200, listed.text
    payload = listed.json()
    assert payload["total"] == 1
    assert payload["items"][0]["organization_name"] == ctx["org"].name
    assert "proof_object_key" not in payload["items"][0]

    filtered = await api.get(
        f"/api/admin/ai/topup/orders?organization_id={ctx['other_org'].id}",
        headers=_auth(ctx["platform_admin"]),
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 0


# --- service guards -------------------------------------------------------


@pytest.mark.asyncio
async def test_service_create_rejects_unknown_method(db_session, ctx) -> None:
    with pytest.raises(HTTPException) as exc:
        await service.create_order(
            db_session,
            org_id=ctx["org"].id,
            actor=ctx["owner"],
            pack_id=ctx["pack"].id,
            method="cash",
            now=datetime.now(UTC),
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_service_list_and_get_are_org_scoped(db_session, ctx) -> None:
    order, _bank = await service.create_order(
        db_session,
        org_id=ctx["org"].id,
        actor=ctx["owner"],
        pack_id=ctx["pack"].id,
        method="manual_transfer",
        now=datetime.now(UTC),
    )
    rows, total = await service.list_orders(db_session, ctx["org"].id, page=1, limit=10)
    assert total == 1
    assert rows[0].id == order.id

    with pytest.raises(HTTPException) as exc:
        await service.get_order(db_session, ctx["other_org"].id, order.id)
    assert exc.value.status_code == 404
