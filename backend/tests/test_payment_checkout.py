from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org
from app.services.payments.base import CheckoutResult, PaymentProviderError, ProviderUnavailable
from app.services.payments.service import PaymentService


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


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "pay-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "pay-owner@example.com")
    org_admin = await _make_user(db_session, "pay-org-admin@example.com")
    viewer = await _make_user(db_session, "pay-viewer@example.com")
    outsider = await _make_user(db_session, "pay-outsider@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Payment Org",
        slug=f"pay-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    other_org = Organization(
        id=uuid.uuid4(),
        name="Other Payment Org",
        slug=f"other-pay-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=outsider.id,
    )
    db_session.add_all([org, other_org])
    await db_session.flush()
    for user, role in ((owner, "owner"), (org_admin, "admin"), (viewer, "viewer")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role=role,
            )
        )
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=other_org.id,
            user_id=outsider.id,
            role="owner",
        )
    )
    await db_session.commit()
    return {
        "admin": admin,
        "owner": owner,
        "org_admin": org_admin,
        "viewer": viewer,
        "outsider": outsider,
        "org": org,
        "other_org": other_org,
    }


async def _invoice(
    db: AsyncSession,
    org: Organization,
    *,
    status: str = "sent",
    total_idr: int = 715_000,
    amount_idr: int | None = None,
) -> OrgInvoice:
    now = datetime.now(UTC)
    inv = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number=f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku="pro",
        amount_idr=total_idr if amount_idr is None else amount_idr,
        dpp_idr=total_idr,
        ppn_idr=0,
        pph23_idr=0,
        total_idr=total_idr,
        period_start=now,
        period_end=now + timedelta(days=30),
        due_date=now + timedelta(days=7),
        status=status,
        sent_at=now if status != "draft" else None,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


class FakeProvider:
    name = "midtrans"

    def __init__(self) -> None:
        self.amounts: list[int] = []
        self.fail: Exception | None = None

    def enabled(self) -> bool:
        return True

    async def create_checkout(self, req):  # noqa: ANN001 - protocol stub
        self.amounts.append(req.amount_idr)
        if self.fail is not None:
            raise self.fail
        return CheckoutResult(
            provider=self.name,
            provider_order_id=req.order_id,
            provider_payment_id="trx-1",
            provider_token="snap-token",
            redirect_url="https://app.sandbox.midtrans.com/snap/v2/vtweb/snap-token",
            expires_at=datetime.now(UTC) + timedelta(hours=24),
            amount_idr=req.amount_idr,
            currency="IDR",
            raw={},
        )

    async def fetch_status(self, attempt):  # noqa: ANN001 - protocol stub
        del attempt
        raise AssertionError("not used")

    async def cancel(self, attempt):  # noqa: ANN001 - protocol stub
        del attempt
        return True


class OtherProvider(FakeProvider):
    name = "xendit"


async def _post_checkout(
    client: AsyncClient,
    invoice: OrgInvoice,
    user: User,
    provider: str = "midtrans",
    *,
    token_org: uuid.UUID | None = None,
):
    return await client.post(
        f"/api/orgs/{invoice.organization_id}/invoices/{invoice.id}/checkout",
        headers=_auth(user, token_org or invoice.organization_id),
        json={"provider": provider},
    )


@pytest.mark.asyncio
async def test_checkout_owner_and_admin_allowed_viewer_and_outsider_denied(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            owner = await _post_checkout(client, inv, ctx["owner"])
            assert owner.status_code == 200, owner.text
            admin = await _post_checkout(client, inv, ctx["org_admin"])
            assert admin.status_code == 200, admin.text
            viewer = await _post_checkout(client, inv, ctx["viewer"])
            assert viewer.status_code == 403
            outsider = await _post_checkout(client, inv, ctx["outsider"], token_org=ctx["other_org"].id)
            assert outsider.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["draft", "paid", "void"])
async def test_checkout_rejects_unpayable_invoice(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch, status: str
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"], status=status)
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 409, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_rejects_zero_total(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"], total_idr=0)
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 409, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_gateway_disabled_is_503(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 503, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_unknown_provider_is_400(db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)

    def _raise(name: str):
        raise ProviderUnavailable(f"unknown payment provider: {name}")

    monkeypatch.setattr("app.services.payments.service.build_provider", _raise)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            response = await _post_checkout(client, inv, ctx["owner"], provider="stripe")
            assert response.status_code == 400, response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_same_provider_is_idempotent(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            first = await _post_checkout(client, inv, ctx["owner"])
            second = await _post_checkout(client, inv, ctx["owner"])
            assert first.status_code == 200
            assert second.status_code == 200
            assert first.json()["attempt_id"] == second.json()["attempt_id"]
            assert first.json()["redirect_url"] == second.json()["redirect_url"]
            count = (
                await db_session.execute(
                    select(func.count()).select_from(PaymentAttempt).where(PaymentAttempt.invoice_id == inv.id)
                )
            ).scalar_one()
            assert count == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_different_provider_while_pending_is_409(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            first = await _post_checkout(client, inv, ctx["owner"])
            assert first.status_code == 200
            monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: OtherProvider())
            second = await _post_checkout(client, inv, ctx["owner"], provider="xendit")
            assert second.status_code == 409, second.text
            assert first.json()["attempt_id"] in second.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_charges_discounted_total_not_amount(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    fake = FakeProvider()
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: fake)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"], amount_idr=1_000_000, total_idr=750_000)
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 200, response.text
            assert response.json()["amount_idr"] == 750_000
            assert fake.amounts == [750_000]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_provider_failure_marks_attempt_failed(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    fake = FakeProvider()
    fake.fail = PaymentProviderError("Midtrans create failed (500)", transient=True, code=500)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: fake)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            inv = await _invoice(db_session, ctx["org"])
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 502, response.text
            attempt = (
                await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.invoice_id == inv.id))
            ).scalar_one()
            assert attempt.status == "failed"
            assert attempt.failure_code == "500"
            assert attempt.failure_message is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_integrity_error_returns_existing_attempt(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr("app.services.payments.service.build_provider", lambda name: FakeProvider())
    inv = await _invoice(db_session, ctx["org"])
    existing = PaymentAttempt(
        provider="midtrans",
        provider_order_id=f"{inv.number}-A1",
        invoice_id=inv.id,
        organization_id=inv.organization_id,
        amount_idr=inv.total_idr,
        currency="IDR",
        status="pending",
        attempt_seq=1,
        checkout_url="https://app.sandbox.midtrans.com/snap/v2/vtweb/existing",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db_session.add(existing)
    await db_session.commit()
    await db_session.refresh(existing)

    real_blocking = PaymentService.blocking_attempt
    calls = {"n": 0}

    async def fake_blocking(self, invoice_id):  # noqa: ANN001
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_blocking(self, invoice_id)

    monkeypatch.setattr(PaymentService, "blocking_attempt", fake_blocking)

    original_commit = AsyncSession.commit
    state = {"raised": False}

    async def failing_commit(self):  # noqa: ANN001
        if not state["raised"]:
            state["raised"] = True
            raise IntegrityError("insert", {}, Exception("duplicate pending attempt"))
        await original_commit(self)

    monkeypatch.setattr(AsyncSession, "commit", failing_commit)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post_checkout(client, inv, ctx["owner"])
            assert response.status_code == 200, response.text
            assert response.json()["attempt_id"] == str(existing.id)
    finally:
        app.dependency_overrides.clear()
