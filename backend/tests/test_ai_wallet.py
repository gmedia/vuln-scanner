from __future__ import annotations

import uuid
from datetime import date
from decimal import ROUND_CEILING, Decimal

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.ai_gateway import (
    AiApiKey,
    AiFxRate,
    AiModel,
    AiProvider,
    AiReservation,
    AiUsageEvent,
    AiWallet,
    AiWalletLedger,
)
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.ai_wallet import (
    PriceSnapshot,
    affordable_max_tokens,
    affordable_prompt_tokens,
    billed_idr,
    billed_usd,
    cogs_idr,
    cogs_usd,
    get_wallet,
    hold_idr,
    record_usage,
    release,
    reserve,
    resolve_snapshot,
    settle,
    snapshot_from_reservation,
    topup,
)
from app.services.auth import create_access_token, get_current_admin, hash_password
from app.services.organization import ensure_personal_org


def _snap(
    *,
    price_in: str = "0.15",
    price_out: str = "0.60",
    hpp_in: str = "0.075",
    hpp_out: str = "0.30",
    fx: str = "16300",
) -> PriceSnapshot:
    return PriceSnapshot(
        price_usd_per_1m_in=Decimal(price_in),
        price_usd_per_1m_out=Decimal(price_out),
        hpp_usd_per_1m_in=Decimal(hpp_in),
        hpp_usd_per_1m_out=Decimal(hpp_out),
        fx_rate=Decimal(fx),
        fx_source="test",
        fx_effective_date=None,
    )


@pytest.fixture
def ai_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=10,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User, org_id: uuid.UUID) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id),
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession, ai_on):
    owner = await _make_user(db_session, "ai-owner@example.com")
    outsider = await _make_user(db_session, "ai-out@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="AI Org",
        slug=f"ai-org-{uuid.uuid4().hex[:6]}",
        kind="hotel",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.flush()
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    provider = AiProvider(
        name="OR",
        base_url="https://example.com/v1",
        credential_enc="x",
    )
    db_session.add(provider)
    await db_session.flush()
    model = AiModel(
        provider_id=provider.id,
        public_id="sinexis/test",
        upstream_id="test",
        price_usd_per_1m_in=Decimal("0.15"),
        price_usd_per_1m_out=Decimal("0.60"),
        hpp_usd_per_1m_in=Decimal("0.075"),
        hpp_usd_per_1m_out=Decimal("0.30"),
        max_tokens_cap=100,
    )
    db_session.add(model)
    await db_session.commit()
    return {"owner": owner, "outsider": outsider, "org": org, "model": model}


def test_billed_idr_one_token_each_is_one_rupiah() -> None:
    snapshot = _snap(price_in="0.15", price_out="0.15")
    assert billed_idr(prompt_tokens=1, completion_tokens=1, snapshot=snapshot) == 1


def test_billed_idr_zero_tokens_is_zero() -> None:
    assert billed_idr(prompt_tokens=0, completion_tokens=0, snapshot=_snap()) == 0


def test_zero_price_model_bills_zero() -> None:
    free = _snap(price_in="0", price_out="0", hpp_in="0", hpp_out="0")
    assert billed_idr(prompt_tokens=1000, completion_tokens=1000, snapshot=free) == 0
    assert cogs_idr(prompt_tokens=1000, completion_tokens=1000, snapshot=free) == 0
    assert billed_usd(prompt_tokens=1000, completion_tokens=1000, snapshot=free) == 0


def test_billed_usd_is_exact_decimal() -> None:
    snapshot = _snap()
    assert billed_usd(prompt_tokens=1_000_000, completion_tokens=0, snapshot=snapshot) == Decimal("0.150000000000")
    assert billed_usd(prompt_tokens=0, completion_tokens=1_000_000, snapshot=snapshot) == Decimal("0.600000000000")


def test_billed_idr_ceils_the_combined_total_once() -> None:
    snapshot = _snap(price_in="0.15", price_out="0.15")
    exact_usd = (Decimal(1) * Decimal("0.15") + Decimal(1) * Decimal("0.15")) / Decimal(1_000_000)
    expected = int((exact_usd * Decimal("16300")).to_integral_value(rounding=ROUND_CEILING))
    assert expected == 1
    assert billed_idr(prompt_tokens=1, completion_tokens=1, snapshot=snapshot) == expected


def test_cogs_idr_not_above_billed_idr_at_markup() -> None:
    snapshot = _snap(price_in="1.00", price_out="2.00", hpp_in="0.40", hpp_out="0.80")
    for prompt_tokens, completion_tokens in ((0, 0), (1, 1), (1000, 2000), (123_456, 7)):
        billed = billed_idr(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=snapshot)
        cogs = cogs_idr(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=snapshot)
        assert cogs <= billed


def test_hold_idr_matches_billed_for_same_snapshot() -> None:
    snapshot = _snap(price_in="10", price_out="20")
    assert hold_idr(max_tokens=5, snapshot=snapshot, prompt_tokens=2) == billed_idr(
        prompt_tokens=2, completion_tokens=5, snapshot=snapshot
    )
    assert hold_idr(max_tokens=0, snapshot=snapshot, prompt_tokens=0) == billed_idr(
        prompt_tokens=1, completion_tokens=1, snapshot=snapshot
    )


def test_affordable_max_tokens_fits_hold() -> None:
    snapshot = _snap(price_in="1000", price_out="2000", fx="16000")
    assert affordable_max_tokens(balance_idr=0, snapshot=snapshot, max_tokens_cap=4096) == 0
    assert affordable_max_tokens(balance_idr=1, snapshot=snapshot, max_tokens_cap=4096) == 0
    cap = affordable_max_tokens(balance_idr=10_000, snapshot=snapshot, max_tokens_cap=4096)
    assert cap >= 1
    assert hold_idr(max_tokens=cap, snapshot=snapshot) <= 10_000
    assert hold_idr(max_tokens=min(cap + 1, 4096), snapshot=snapshot) > 10_000 or cap == 4096


def test_affordable_prompt_tokens_clamps_huge_context() -> None:
    snapshot = _snap(price_in="10000", price_out="20000", fx="16000")
    huge = 200_000
    assert hold_idr(max_tokens=1, snapshot=snapshot, prompt_tokens=huge) > 10_000
    clamped = affordable_prompt_tokens(balance_idr=10_000, snapshot=snapshot, prompt_tokens=huge)
    assert clamped >= 1
    assert hold_idr(max_tokens=1, snapshot=snapshot, prompt_tokens=clamped) <= 10_000
    assert affordable_max_tokens(balance_idr=10_000, snapshot=snapshot, max_tokens_cap=4096, prompt_tokens=clamped) >= 1
    assert affordable_prompt_tokens(balance_idr=0, snapshot=snapshot, prompt_tokens=10) == 0


@pytest.mark.asyncio
async def test_resolve_snapshot_derives_legacy_usd_from_locked_rate(db_session: AsyncSession, ctx) -> None:
    provider = AiProvider(name="legacy", base_url="https://legacy.example/v1", credential_enc="x")
    db_session.add(provider)
    await db_session.flush()
    model = AiModel(
        provider_id=provider.id,
        public_id="sinexis/legacy",
        upstream_id="legacy",
        price_idr_per_1k_in=1000,
        price_idr_per_1k_out=2000,
        hpp_usd_per_1k_in=1,
        hpp_usd_per_1k_out=2,
    )
    db_session.add(model)
    db_session.add(
        AiFxRate(
            base="USD",
            quote="IDR",
            rate=Decimal("16300"),
            source="manual",
            effective_date=date.today(),
        )
    )
    await db_session.commit()

    snapshot = await resolve_snapshot(db_session, model)
    assert snapshot.price_usd_per_1m_in == Decimal("61.349693")
    assert snapshot.price_usd_per_1m_out == Decimal("122.699387")
    assert snapshot.hpp_usd_per_1m_in == Decimal("1000.000000")
    assert snapshot.hpp_usd_per_1m_out == Decimal("2000.000000")
    assert snapshot.fx_rate == Decimal("16300.000000")
    assert snapshot.fx_source == "manual"
    assert snapshot.fx_effective_date == date.today()


def test_flag_off_customer_404(client) -> None:
    r = client.get("/api/ai/wallet", headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_wallet_idor_and_topup(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    outsider = ctx["outsider"]
    org = ctx["org"]
    model = ctx["model"]
    snapshot = await resolve_snapshot(db_session, model)

    async def override_get_db():
        yield db_session

    async def override_admin() -> User:
        owner.is_admin = True
        return owner

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_admin] = override_admin
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            empty = await ac.get("/api/ai/wallet", headers=_auth(owner, org.id))
            assert empty.status_code == 200, empty.text
            assert empty.json()["balance_idr"] == 0

            out_org = outsider.last_active_organization_id
            assert out_org is not None
            other = await ac.get("/api/ai/wallet", headers=_auth(outsider, out_org))
            assert other.status_code == 200
            assert other.json()["organization_id"] != str(org.id)
            stolen = await ac.get("/api/ai/wallet", headers=_auth(outsider, org.id))
            assert stolen.status_code == 401

            top = await ac.post(
                f"/api/admin/ai/wallets/{org.id}/topup",
                headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"},
                json={"amount_idr": 10_000},
            )
            assert top.status_code == 200, top.text
            assert top.json()["balance_idr"] == 10_000

            after = await ac.get("/api/ai/wallet", headers=_auth(owner, org.id))
            assert after.json()["balance_idr"] == 10_000

            hold = hold_idr(max_tokens=10, snapshot=snapshot)
            first = await reserve(db_session, organization_id=org.id, hold=hold, snapshot=snapshot)
            leftover = 10_000 - hold
            with pytest.raises(HTTPException) as exc:
                await reserve(db_session, organization_id=org.id, hold=leftover + 1, snapshot=snapshot)
            assert exc.value.status_code == 402
            billed = billed_idr(prompt_tokens=10, completion_tokens=20, snapshot=snapshot)
            event = await record_usage(
                db_session,
                organization_id=org.id,
                user_id=owner.id,
                key_id=None,
                source="customer",
                model=model,
                prompt_tokens=10,
                completion_tokens=20,
                billed=billed,
                cogs=cogs_idr(prompt_tokens=10, completion_tokens=20, snapshot=snapshot),
                billed_usd=billed_usd(prompt_tokens=10, completion_tokens=20, snapshot=snapshot),
                cogs_usd=cogs_usd(prompt_tokens=10, completion_tokens=20, snapshot=snapshot),
                snapshot=snapshot,
                reservation_id=first.id,
                request_payload={"messages": [{"role": "user", "content": "secret-prompt"}]},
            )
            await settle(db_session, reservation=first, billed=billed, usage_event=event)
            await db_session.commit()

            usage = await ac.get("/api/ai/usage", headers=_auth(owner, org.id))
            assert usage.status_code == 200
            body = usage.json()
            assert body["total"] == 1
            assert "messages" not in usage.text
            assert "secret-prompt" not in usage.text
            assert "request_payload" not in usage.text
            assert "cogs" not in usage.text

            res2 = await reserve(db_session, organization_id=org.id, hold=hold, snapshot=snapshot)
            await release(db_session, res2)
            await db_session.commit()

            models = await ac.get("/api/ai/models", headers=_auth(owner, org.id))
            assert models.status_code == 200
            assert models.json()["total"] >= 1
            assert "upstream_id" not in models.text

            admin_usage = await ac.get(
                "/api/admin/ai/usage",
                headers={"X-API-Key": settings.api_key, "X-E2E-Test": "1"},
            )
            assert admin_usage.status_code == 200
            assert admin_usage.json()["total"] >= 1
            admin_item = admin_usage.json()["items"][0]
            assert admin_item.get("request_payload", {}).get("messages")[0]["content"] == "secret-prompt"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_admin, None)


@pytest.mark.asyncio
async def test_wallet_get_is_read_only(db_session: AsyncSession, ctx) -> None:
    owner = ctx["owner"]
    org = ctx["org"]

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            got = await ac.get("/api/ai/wallet", headers=_auth(owner, org.id))
            assert got.status_code == 200, got.text
            assert got.json()["balance_idr"] == 0
            result = await db_session.execute(select(AiWallet).where(AiWallet.organization_id == org.id))
            rows = result.scalars().all()
            assert rows == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_topup_writes_ledger_row(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    wallet = await topup(db_session, org.id, 5000)
    assert wallet.balance_idr == 5000
    row = (
        await db_session.execute(
            select(AiWalletLedger).where(AiWalletLedger.organization_id == org.id, AiWalletLedger.kind == "topup")
        )
    ).scalar_one()
    assert row.delta_idr == 5000
    assert row.balance_after_idr == 5000


@pytest.mark.asyncio
async def test_reserve_persists_snapshot_and_ledger(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    snapshot = _snap(price_in="1.00", price_out="2.00", hpp_in="0.4", hpp_out="0.8", fx="16300")
    await topup(db_session, org.id, 10_000)

    reservation = await reserve(
        db_session,
        organization_id=org.id,
        hold=1000,
        snapshot=snapshot,
        model_public_id=model.public_id,
        prompt_tokens_est=7,
        completion_tokens_max=42,
    )
    assert reservation.price_usd_per_1m_in == Decimal("1.000000")
    assert reservation.price_usd_per_1m_out == Decimal("2.000000")
    assert reservation.hpp_usd_per_1m_in == Decimal("0.400000")
    assert reservation.hpp_usd_per_1m_out == Decimal("0.800000")
    assert reservation.fx_rate == Decimal("16300.000000")
    assert reservation.fx_source == "test"
    assert reservation.model_public_id == model.public_id
    assert reservation.prompt_tokens_est == 7
    assert reservation.completion_tokens_max == 42
    assert snapshot_from_reservation(reservation) == snapshot

    ledger = (
        await db_session.execute(
            select(AiWalletLedger).where(
                AiWalletLedger.reservation_id == reservation.id, AiWalletLedger.kind == "reserve"
            )
        )
    ).scalar_one()
    assert ledger.delta_idr == -1000
    assert ledger.balance_after_idr == 9000


@pytest.mark.asyncio
async def test_ledger_sum_matches_wallet_after_full_cycle(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    snapshot = await resolve_snapshot(db_session, model)
    await topup(db_session, org.id, 10_000)
    hold_one = 10
    hold_two = 7

    first = await reserve(db_session, organization_id=org.id, hold=hold_one, snapshot=snapshot)
    billed = 4
    event = await record_usage(
        db_session,
        organization_id=org.id,
        user_id=ctx["owner"].id,
        key_id=None,
        source="customer",
        model=model,
        prompt_tokens=1,
        completion_tokens=1,
        billed=billed,
        cogs=1,
        snapshot=snapshot,
        reservation_id=first.id,
    )
    await settle(db_session, reservation=first, billed=billed, usage_event=event)
    second = await reserve(db_session, organization_id=org.id, hold=hold_two, snapshot=snapshot)
    await release(db_session, second)
    await db_session.commit()

    wallet = await get_wallet(db_session, org.id)
    assert wallet is not None
    assert wallet.balance_idr == 10_000 - billed
    rows = list(
        (await db_session.execute(select(AiWalletLedger).where(AiWalletLedger.organization_id == org.id)))
        .scalars()
        .all()
    )
    assert sum(row.delta_idr for row in rows) == wallet.balance_idr
    by_kind = {(row.kind, row.reservation_id): row for row in rows}
    assert by_kind[("topup", None)].balance_after_idr == 10_000
    assert by_kind[("reserve", first.id)].balance_after_idr == 10_000 - hold_one
    assert by_kind[("settle_adjust", first.id)].delta_idr == hold_one - billed
    assert by_kind[("settle_adjust", first.id)].usage_event_id == event.id
    assert by_kind[("reserve", second.id)].balance_after_idr == 10_000 - billed - hold_two
    assert by_kind[("release", second.id)].delta_idr == hold_two
    assert by_kind[("release", second.id)].balance_after_idr == 10_000 - billed


@pytest.mark.asyncio
async def test_shortfall_recorded_when_billed_exceeds_hold(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    snapshot = _snap(price_in="100", price_out="100", hpp_in="50", hpp_out="50", fx="16000")
    await topup(db_session, org.id, 20)

    reservation = await reserve(db_session, organization_id=org.id, hold=10, snapshot=snapshot)
    billed = billed_idr(prompt_tokens=10, completion_tokens=10, snapshot=snapshot)
    assert billed == 32
    event = await record_usage(
        db_session,
        organization_id=org.id,
        user_id=ctx["owner"].id,
        key_id=None,
        source="customer",
        model=model,
        prompt_tokens=10,
        completion_tokens=10,
        billed=billed,
        cogs=cogs_idr(prompt_tokens=10, completion_tokens=10, snapshot=snapshot),
        billed_usd=billed_usd(prompt_tokens=10, completion_tokens=10, snapshot=snapshot),
        snapshot=snapshot,
        reservation_id=reservation.id,
    )
    await settle(db_session, reservation=reservation, billed=billed, usage_event=event)
    await db_session.commit()

    wallet = await get_wallet(db_session, org.id)
    assert wallet is not None
    assert wallet.balance_idr == 0
    assert event.shortfall_idr == 12
    ledger = (
        await db_session.execute(
            select(AiWalletLedger).where(
                AiWalletLedger.reservation_id == reservation.id, AiWalletLedger.kind == "settle_adjust"
            )
        )
    ).scalar_one()
    assert ledger.delta_idr == -10
    assert ledger.balance_after_idr == 0


@pytest.mark.asyncio
async def test_second_settle_and_release_are_rejected(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    snapshot = await resolve_snapshot(db_session, model)
    await topup(db_session, org.id, 10_000)
    reservation = await reserve(db_session, organization_id=org.id, hold=10, snapshot=snapshot)
    event = await record_usage(
        db_session,
        organization_id=org.id,
        user_id=ctx["owner"].id,
        key_id=None,
        source="customer",
        model=model,
        prompt_tokens=1,
        completion_tokens=1,
        billed=1,
        cogs=1,
        snapshot=snapshot,
        reservation_id=reservation.id,
    )
    await settle(db_session, reservation=reservation, billed=1, usage_event=event)
    await db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await settle(db_session, reservation=reservation, billed=1)
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc2:
        await release(db_session, reservation)
    assert exc2.value.status_code == 409

    usage_rows = (
        (await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.reservation_id == reservation.id)))
        .scalars()
        .all()
    )
    assert len(usage_rows) == 1
    ledger_rows = (
        (await db_session.execute(select(AiWalletLedger).where(AiWalletLedger.reservation_id == reservation.id)))
        .scalars()
        .all()
    )
    assert sum(1 for row in ledger_rows if row.kind == "settle_adjust") == 1
    assert sum(1 for row in ledger_rows if row.kind == "release") == 0


@pytest.mark.asyncio
async def test_rate_lock_survives_model_and_fx_changes(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    locked = await resolve_snapshot(db_session, model)
    await topup(db_session, org.id, 10_000)
    reservation = await reserve(db_session, organization_id=org.id, hold=10, snapshot=locked)

    model.price_usd_per_1m_in = Decimal("99")
    model.price_usd_per_1m_out = Decimal("199")
    db_session.add(
        AiFxRate(
            base="USD",
            quote="IDR",
            rate=Decimal("30000"),
            source="manual",
            effective_date=date.today(),
        )
    )
    await db_session.commit()

    current = await resolve_snapshot(db_session, model)
    assert current.price_usd_per_1m_in == Decimal("99.000000")
    assert current.fx_rate == Decimal("30000.000000")

    readonly = snapshot_from_reservation(reservation)
    assert readonly == locked
    assert billed_idr(prompt_tokens=1, completion_tokens=1, snapshot=readonly) == 1
    assert billed_idr(prompt_tokens=1_000_000, completion_tokens=0, snapshot=readonly) == billed_idr(
        prompt_tokens=1_000_000, completion_tokens=0, snapshot=locked
    )


@pytest.mark.asyncio
async def test_legacy_open_reservation_resolves_snapshot_at_settle(db_session: AsyncSession, ctx) -> None:
    from app.services.ai_proxy import _settle_usage

    org = ctx["org"]
    model = ctx["model"]
    owner = ctx["owner"]
    await topup(db_session, org.id, 10_000)
    key = AiApiKey(
        organization_id=org.id,
        created_by_user_id=owner.id,
        name="legacy",
        prefix="sx-legacy",
        key_hash="a" * 64,
    )
    db_session.add(key)
    reservation = AiReservation(organization_id=org.id, hold_idr=5, status="open")
    db_session.add(reservation)
    await db_session.commit()

    await _settle_usage(
        db_session,
        reservation_id=reservation.id,
        model=model,
        organization_id=org.id,
        user_id=owner.id,
        key_id=key.id,
        prompt_tokens=1,
        completion_tokens=1,
        usage_missing=False,
        billed_estimated=False,
        latency_ms=None,
        http_status=200,
        finish_reason="stop",
        provider_request_id=None,
    )

    event = (
        await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.reservation_id == reservation.id))
    ).scalar_one()
    assert event.fx_rate == Decimal("16000")
    assert event.fx_source == "env"
    assert event.price_usd_per_1m_in == Decimal("0.150000")
    assert event.billed_idr == 1
    assert event.shortfall_idr == 0


@pytest.mark.asyncio
async def test_record_usage_provider_override(db_session: AsyncSession, ctx) -> None:
    org = ctx["org"]
    model = ctx["model"]
    owner = ctx["owner"]
    other_provider = AiProvider(
        name="Override",
        base_url="https://override.example/v1",
        credential_enc="x",
    )
    db_session.add(other_provider)
    await db_session.flush()
    snapshot = _snap()

    common = {
        "organization_id": org.id,
        "user_id": owner.id,
        "key_id": None,
        "source": "customer",
        "model": model,
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "billed": 1,
        "cogs": 0,
        "reservation_id": None,
        "snapshot": snapshot,
    }
    overridden = await record_usage(db_session, provider_id=other_provider.id, **common)
    defaulted = await record_usage(db_session, **common)
    await db_session.commit()

    rows = {
        event.id: event
        for event in (
            await db_session.execute(select(AiUsageEvent).where(AiUsageEvent.id.in_([overridden.id, defaulted.id])))
        )
        .scalars()
        .all()
    }
    assert rows[overridden.id].provider_id == other_provider.id
    assert rows[defaulted.id].provider_id == model.provider_id
