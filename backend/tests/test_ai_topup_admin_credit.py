"""Admin direct wallet credit: idempotent through the top-up order + ledger."""

from __future__ import annotations

import uuid
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
from app.models.billing import PaymentAttempt
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services import ai_topup as service
from app.services.ai_wallet import get_wallet
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org

AMOUNT = 10_000


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=None,
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
def _ai_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", False)


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


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "admin-credit-admin@example.com", admin=True)
    owner = await _make_user(db_session, "admin-credit-owner@example.com")
    org = await _make_org(db_session, "Admin Credit Org", owner)
    other_org = await _make_org(db_session, "Admin Credit Other", owner)
    return {"admin": admin, "owner": owner, "org": org, "other_org": other_org}


async def _credit(
    db: AsyncSession,
    ctx: dict[str, Any],
    *,
    amount_idr: int = AMOUNT,
    idempotency_key: str | None = None,
    org: Organization | None = None,
    note: str | None = None,
) -> AiTopupOrder:
    return await service.admin_credit(
        db,
        org_id=(org or ctx["org"]).id,
        admin=ctx["admin"],
        amount_idr=amount_idr,
        note=note,
        idempotency_key=idempotency_key,
    )


async def _ledger_rows(db: AsyncSession, order_id: uuid.UUID) -> list[AiWalletLedger]:
    rows = (await db.execute(select(AiWalletLedger).where(AiWalletLedger.topup_order_id == order_id))).scalars().all()
    return list(rows)


async def _order_count(db: AsyncSession, *, key: str | None = None) -> int:
    stmt = select(func.count()).select_from(AiTopupOrder)
    if key is not None:
        stmt = stmt.where(AiTopupOrder.idempotency_key == key)
    return int((await db.execute(stmt)).scalar() or 0)


async def _balance(db: AsyncSession, org_id: uuid.UUID) -> int:
    wallet = await get_wallet(db, org_id)
    assert wallet is not None
    return int(wallet.balance_idr)


async def _ledger_sum(db: AsyncSession, org_id: uuid.UUID) -> int:
    value = (
        await db.execute(select(func.sum(AiWalletLedger.delta_idr)).where(AiWalletLedger.organization_id == org_id))
    ).scalar()
    return int(value or 0)


@pytest.mark.asyncio
async def test_same_key_credits_once_and_returns_the_same_order(db_session: AsyncSession, ctx) -> None:
    first = await _credit(db_session, ctx, idempotency_key="same-key")
    second = await _credit(db_session, ctx, idempotency_key="same-key")

    assert first.id == second.id
    assert await _order_count(db_session, key="same-key") == 1

    ledger = await _ledger_rows(db_session, first.id)
    assert len(ledger) == 1
    assert ledger[0].kind == "topup"
    assert ledger[0].delta_idr == AMOUNT

    balance = await _balance(db_session, ctx["org"].id)
    assert balance == AMOUNT
    assert await _ledger_sum(db_session, ctx["org"].id) == balance


@pytest.mark.asyncio
async def test_different_keys_create_two_orders_and_two_credits(db_session: AsyncSession, ctx) -> None:
    first = await _credit(db_session, ctx, idempotency_key="key-a")
    second = await _credit(db_session, ctx, idempotency_key="key-b")

    assert first.id != second.id
    assert await _order_count(db_session) == 2
    assert len(await _ledger_rows(db_session, first.id)) == 1
    assert len(await _ledger_rows(db_session, second.id)) == 1

    balance = await _balance(db_session, ctx["org"].id)
    assert balance == AMOUNT * 2
    assert await _ledger_sum(db_session, ctx["org"].id) == balance


@pytest.mark.asyncio
async def test_no_key_credits_each_call(db_session: AsyncSession, ctx) -> None:
    first = await _credit(db_session, ctx)
    second = await _credit(db_session, ctx)

    assert first.id != second.id
    assert first.idempotency_key is None
    assert second.idempotency_key is None
    assert await _order_count(db_session) == 2
    assert await _balance(db_session, ctx["org"].id) == AMOUNT * 2


@pytest.mark.asyncio
async def test_key_used_by_another_org_is_409_without_credit(db_session: AsyncSession, ctx) -> None:
    first = await _credit(db_session, ctx, idempotency_key="cross-org")

    with pytest.raises(HTTPException) as exc:
        await _credit(db_session, ctx, idempotency_key="cross-org", org=ctx["other_org"])
    assert exc.value.status_code == 409

    assert await _order_count(db_session, key="cross-org") == 1
    assert await _balance(db_session, ctx["org"].id) == AMOUNT
    assert await get_wallet(db_session, ctx["other_org"].id) is None
    assert len(await _ledger_rows(db_session, first.id)) == 1


@pytest.mark.asyncio
async def test_order_shape_and_one_manual_attempt(db_session: AsyncSession, ctx) -> None:
    order = await _credit(db_session, ctx, idempotency_key="shape-key", note="goodwill")

    assert order.amount_idr == 0
    assert order.bonus_idr == AMOUNT
    assert order.credit_idr == AMOUNT
    assert order.credit_idr == order.amount_idr + order.bonus_idr
    assert order.status == "paid"
    assert order.payment_method == "admin_credit"
    assert order.pack_id is None
    assert order.pack_code is None
    assert order.idempotency_key == "shape-key"
    assert order.verified_by_user_id == ctx["admin"].id
    assert order.verified_at is not None
    assert order.paid_at is not None

    ledger = await _ledger_rows(db_session, order.id)
    assert len(ledger) == 1
    assert ledger[0].note == "goodwill"
    assert ledger[0].actor_user_id == ctx["admin"].id

    attempts = (
        (await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.topup_order_id == order.id)))
        .scalars()
        .all()
    )
    assert len(attempts) == 1
    attempt = attempts[0]
    assert attempt.provider == "manual"
    assert attempt.payable_kind == "topup"
    assert attempt.status == "succeeded"
    assert attempt.method == "manual_credit"
    assert attempt.amount_idr == order.amount_idr
    assert attempt.provider_ref == order.reference_code
    assert attempt.created_by_user_id == ctx["admin"].id


@pytest.mark.asyncio
async def test_note_defaults_to_reference_code(db_session: AsyncSession, ctx) -> None:
    order = await _credit(db_session, ctx)
    ledger = await _ledger_rows(db_session, order.id)
    assert ledger[0].note == order.reference_code


@pytest.mark.asyncio
async def test_amount_must_be_positive(db_session: AsyncSession, ctx) -> None:
    with pytest.raises(HTTPException) as exc:
        await _credit(db_session, ctx, amount_idr=0)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_legacy_endpoint_returns_wallet_out_and_is_idempotent(
    api: AsyncClient,
    db_session: AsyncSession,
    ctx,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)
    headers = _auth(ctx["admin"])
    body = {"amount_idr": AMOUNT, "idempotency_key": "legacy-key"}

    first = await api.post(f"/api/admin/ai/wallets/{ctx['org'].id}/topup", headers=headers, json=body)
    assert first.status_code == 200, first.text
    assert first.json()["organization_id"] == str(ctx["org"].id)
    assert first.json()["balance_idr"] == AMOUNT

    second = await api.post(f"/api/admin/ai/wallets/{ctx['org'].id}/topup", headers=headers, json=body)
    assert second.status_code == 200, second.text
    assert second.json()["balance_idr"] == AMOUNT

    assert await _order_count(db_session, key="legacy-key") == 1
    assert await _balance(db_session, ctx["org"].id) == AMOUNT


@pytest.mark.asyncio
async def test_legacy_endpoint_stays_gated_when_ai_is_off(
    api: AsyncClient,
    ctx,
) -> None:
    response = await api.post(
        f"/api/admin/ai/wallets/{ctx['org'].id}/topup",
        headers=_auth(ctx["admin"]),
        json={"amount_idr": AMOUNT, "idempotency_key": "gated-key"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_new_admin_endpoint_is_ungated(api: AsyncClient, db_session: AsyncSession, ctx) -> None:
    response = await api.post(
        "/api/admin/ai/topup/orders/admin-credit",
        headers=_auth(ctx["admin"]),
        json={
            "organization_id": str(ctx["org"].id),
            "amount_idr": AMOUNT,
            "note": "support goodwill",
            "idempotency_key": "endpoint-key",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_method"] == "admin_credit"
    assert body["status"] == "paid"
    assert body["amount_idr"] == 0
    assert body["bonus_idr"] == AMOUNT
    assert body["credit_idr"] == AMOUNT
    assert body["organization_id"] == str(ctx["org"].id)

    order = await db_session.get(AiTopupOrder, uuid.UUID(body["id"]))
    assert order is not None
    assert order.idempotency_key == "endpoint-key"
    assert await _balance(db_session, ctx["org"].id) == AMOUNT


@pytest.mark.asyncio
async def test_new_admin_endpoint_requires_platform_admin(api: AsyncClient, ctx) -> None:
    response = await api.post(
        "/api/admin/ai/topup/orders/admin-credit",
        headers=_auth(ctx["owner"]),
        json={"organization_id": str(ctx["org"].id), "amount_idr": AMOUNT},
    )
    assert response.status_code == 403
