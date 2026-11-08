"""AI top-up S6: admin resolve-refund (clawback / write-off)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import AiTopupOrder, AiWalletLedger
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services import ai_topup as service
from app.services import ai_wallet
from app.services.ai_topup import create_pack
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org

AMOUNT = 100_000


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


@pytest.fixture(autouse=True)
def _bank(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "invoice_bank_name", "BCA")
    monkeypatch.setattr(settings, "invoice_bank_account", "1234567890")
    monkeypatch.setattr(settings, "invoice_bank_holder", "PT Sinexis")


@pytest_asyncio.fixture
async def api(db_session: AsyncSession):
    _bind(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


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


async def _make_org(db: AsyncSession, owner: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=f"Refund Org {uuid.uuid4().hex[:6]}",
        slug=f"refund-org-{uuid.uuid4().hex[:8]}",
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


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "refund-admin@example.com", admin=True)
    owner = await _make_user(db_session, "refund-owner@example.com")
    org = await _make_org(db_session, owner)
    pack = await create_pack(db_session, code="rp100", label="Rp 100.000", amount_idr=AMOUNT)
    return {"admin": admin, "owner": owner, "org": org, "pack": pack}


async def _paid_refund_review(db: AsyncSession, ctx) -> AiTopupOrder:
    order, _bank = await service.create_order(
        db,
        org_id=ctx["org"].id,
        actor=ctx["owner"],
        pack_id=ctx["pack"].id,
        method="manual_transfer",
        now=datetime.now(UTC) - timedelta(minutes=5),
    )
    order.status = "awaiting_verification"
    order.proof_object_key = "proof/refund-test"
    await db.commit()
    await service.approve(db, order_id=order.id, admin=ctx["admin"], bank_ref="TRX-1", force=False)
    order.status = "refund_review"
    await db.commit()
    await db.refresh(order)
    return order


async def _ledger(db: AsyncSession, order_id: uuid.UUID) -> list[AiWalletLedger]:
    return list(
        (await db.execute(select(AiWalletLedger).where(AiWalletLedger.topup_order_id == order_id))).scalars().all()
    )


def _resolve(api: AsyncClient, admin: User, order_id: uuid.UUID, body: dict[str, object]):
    return api.post(
        f"/api/admin/ai/topup/orders/{order_id}/resolve-refund",
        headers=_auth(admin),
        json=body,
    )


@pytest.mark.asyncio
async def test_clawback_reduces_balance_once_and_writes_refund_ledger(
    api: AsyncClient, db_session: AsyncSession, ctx
) -> None:
    order = await _paid_refund_review(db_session, ctx)

    response = await _resolve(api, ctx["admin"], order.id, {"action": "clawback", "note": "  chargeback  "})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "refunded"
    assert body["resolution_note"] == "chargeback"
    assert body["verified_by_user_id"] == str(ctx["admin"].id)

    await db_session.refresh(order)
    assert order.status == "refunded"
    assert order.resolution_note == "chargeback"
    wallet = await ai_wallet.get_wallet(db_session, ctx["org"].id)
    assert wallet is not None and wallet.balance_idr == 0

    rows = await _ledger(db_session, order.id)
    assert [row.kind for row in rows] == ["topup", "refund"]
    refund = rows[1]
    assert refund.delta_idr == -AMOUNT
    assert refund.topup_order_id == order.id
    assert refund.actor_user_id == ctx["admin"].id
    assert refund.note == "chargeback"


@pytest.mark.asyncio
async def test_clawback_with_insufficient_balance_is_409_and_moves_nothing(
    api: AsyncClient, db_session: AsyncSession, ctx
) -> None:
    order = await _paid_refund_review(db_session, ctx)
    await ai_wallet.adjust(
        db_session,
        organization_id=ctx["org"].id,
        delta_idr=-1,
        kind="manual_adjust",
        commit=True,
    )

    response = await _resolve(api, ctx["admin"], order.id, {"action": "clawback"})

    assert response.status_code == 409, response.text
    assert "insufficient" in response.json()["detail"].lower()
    await db_session.refresh(order)
    assert order.status == "refund_review"
    assert [row.kind for row in await _ledger(db_session, order.id)] == ["topup"]
    wallet = await ai_wallet.get_wallet(db_session, ctx["org"].id)
    assert wallet is not None and wallet.balance_idr == AMOUNT - 1


@pytest.mark.asyncio
async def test_write_off_keeps_balance_and_sets_resolution_note(
    api: AsyncClient, db_session: AsyncSession, ctx
) -> None:
    order = await _paid_refund_review(db_session, ctx)

    response = await _resolve(api, ctx["admin"], order.id, {"action": "write_off", "note": "goodwill"})

    assert response.status_code == 200, response.text
    await db_session.refresh(order)
    assert order.status == "refunded"
    assert order.resolution_note == "goodwill"
    wallet = await ai_wallet.get_wallet(db_session, ctx["org"].id)
    assert wallet is not None and wallet.balance_idr == AMOUNT
    assert [row.kind for row in await _ledger(db_session, order.id)] == ["topup"]


@pytest.mark.asyncio
async def test_wrong_status_is_409(api: AsyncClient, db_session: AsyncSession, ctx) -> None:
    order, _bank = await service.create_order(
        db_session,
        org_id=ctx["org"].id,
        actor=ctx["owner"],
        pack_id=ctx["pack"].id,
        method="manual_transfer",
        now=datetime.now(UTC),
    )

    response = await _resolve(api, ctx["admin"], order.id, {"action": "clawback"})

    assert response.status_code == 409
    assert await _ledger(db_session, order.id) == []


@pytest.mark.asyncio
async def test_second_resolution_is_idempotent(api: AsyncClient, db_session: AsyncSession, ctx) -> None:
    order = await _paid_refund_review(db_session, ctx)

    first = await _resolve(api, ctx["admin"], order.id, {"action": "clawback"})
    second = await _resolve(api, ctx["admin"], order.id, {"action": "clawback"})

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "refunded"
    assert [row.kind for row in await _ledger(db_session, order.id)] == ["topup", "refund"]


@pytest.mark.asyncio
async def test_invalid_action_is_rejected(api: AsyncClient, db_session: AsyncSession, ctx) -> None:
    order = await _paid_refund_review(db_session, ctx)

    response = await _resolve(api, ctx["admin"], order.id, {"action": "refund"})

    assert response.status_code == 422
    await db_session.refresh(order)
    assert order.status == "refund_review"


@pytest.mark.asyncio
async def test_customer_dto_does_not_expose_resolution_note(
    api: AsyncClient, db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)
    order = await _paid_refund_review(db_session, ctx)
    await _resolve(api, ctx["admin"], order.id, {"action": "write_off", "note": "internal only"})

    response = await api.get(
        f"/api/ai/topup/orders/{order.id}",
        headers=_auth(ctx["owner"], ctx["org"].id),
    )
    assert response.status_code == 200, response.text
    assert "resolution_note" not in response.json()


@pytest.mark.asyncio
async def test_resolve_refund_is_available_with_gateway_off(
    api: AsyncClient, db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", False)
    order = await _paid_refund_review(db_session, ctx)

    response = await _resolve(api, ctx["admin"], order.id, {"action": "write_off"})

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "refunded"
