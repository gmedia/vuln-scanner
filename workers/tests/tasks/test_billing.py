import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tasks.billing import (
    MAX_REMINDER_ATTEMPTS,
    PAST_DUE_CANCEL_DAYS,
    PAST_DUE_GRACE_DAYS,
    RENEWAL_DRAFT_LEAD_DAYS,
    _next_annual_start,
    _reconcile_gateway_attempts,
    draft_annual_renewals,
    finalize_periods,
    reconcile_gateway_attempts,
    send_due_reminders,
)


class TestFinalizePeriodsMeta:
    def test_is_shared_task(self):
        assert finalize_periods.name == "billing.finalize_periods"

    def test_has_acks_late(self):
        assert finalize_periods.acks_late is True

    def test_has_single_retry(self):
        assert finalize_periods.max_retries == 1

    def test_default_grace_is_seven_days(self):
        assert PAST_DUE_GRACE_DAYS == 7

    def test_default_terminal_deadline_is_forty_five_days(self):
        assert PAST_DUE_CANCEL_DAYS == 45


class TestFinalizePeriodsRun:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.billing.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            cancel_result = MagicMock()
            cancel_result.all.return_value = [SimpleNamespace(id="a"), SimpleNamespace(id="b")]
            past_due_result = MagicMock()
            past_due_result.all.return_value = [SimpleNamespace(id="c")]
            terminal_result = MagicMock()
            terminal_result.all.return_value = [SimpleNamespace(id="d")]
            mock_session.execute.side_effect = [cancel_result, past_due_result, terminal_result]
            mock_get_session.return_value = mock_session
            self.mock_get_session = mock_get_session
            self.mock_session = mock_session
            yield

    def test_returns_counts(self):
        result = finalize_periods()
        assert result == {
            "canceled_count": 2,
            "past_due_count": 1,
            "terminal_count": 1,
        }

    def test_runs_three_updates(self):
        finalize_periods()
        assert self.mock_session.execute.call_count == 3

    def test_passes_grace_days(self):
        finalize_periods()
        params = self.mock_session.execute.call_args_list[1][0][1]
        assert params["grace_days"] == PAST_DUE_GRACE_DAYS
        assert "now" in params

    def test_closes_canceled_before_marking_past_due(self):
        finalize_periods()
        first_sql = str(self.mock_session.execute.call_args_list[0][0][0])
        second_sql = str(self.mock_session.execute.call_args_list[1][0][0])
        assert "cancel_at_period_end = true" in first_sql
        assert "status = 'past_due'" in second_sql
        assert "status = 'active'" in second_sql

    def test_terminal_past_due_uses_its_own_deadline(self):
        finalize_periods()
        terminal_sql = str(self.mock_session.execute.call_args_list[2][0][0])
        params = self.mock_session.execute.call_args_list[2][0][1]
        assert "status = 'past_due'" in terminal_sql
        assert "status = 'canceled'" in terminal_sql
        assert params["terminal_days"] == PAST_DUE_CANCEL_DAYS
        assert params["terminal_days"] != params["grace_days"] if "grace_days" in params else True

    def test_past_due_reads_the_invoice_due_date(self):
        finalize_periods()
        second_sql = str(self.mock_session.execute.call_args_list[1][0][0])
        assert "org_invoices" in second_sql
        assert "due_date" in second_sql
        assert "current_period_end" not in second_sql

    def test_commits_and_closes(self):
        finalize_periods()
        self.mock_session.commit.assert_called_once()
        self.mock_session.rollback.assert_not_called()
        self.mock_session.close.assert_called_once()

    def test_rolls_back_on_error(self):
        self.mock_session.execute.side_effect = RuntimeError("db down")
        with pytest.raises(RuntimeError):
            finalize_periods()
        self.mock_session.rollback.assert_called_once()
        self.mock_session.commit.assert_not_called()
        self.mock_session.close.assert_called_once()


def _invoice(*, days_ago: int = 1) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        number="SX-202610-0001",
        amount_idr=1_000_000,
        total_idr=1_000_000,
        due_date=now - timedelta(days=days_ago),
        period_start=now - timedelta(days=30),
        period_end=now + timedelta(days=1),
        status="sent",
        paid_at=None,
        sent_at=now - timedelta(days=30),
    )


def _session(
    *,
    invoice: SimpleNamespace,
    existing=None,
    recipients=None,
    billing_emails=None,
    billing_email="",
) -> MagicMock:
    session = MagicMock()
    invoice_result = MagicMock()
    invoice_result.all.return_value = [(invoice, "Acme")]
    existing_result = MagicMock()
    existing_result.scalars.return_value.all.return_value = existing or []
    billing_result = MagicMock()
    billing_result.scalars.return_value.all.return_value = billing_emails or []
    recipients_result = MagicMock()
    recipients_result.all.return_value = (
        recipients if recipients is not None else [("owner@example.com", "en")]
    )
    session.get.return_value = (
        SimpleNamespace(billing_email=billing_email) if billing_email else None
    )
    session.execute.side_effect = [
        invoice_result,
        existing_result,
        billing_result,
        recipients_result,
    ]
    return session


class TestSendDueRemindersMeta:
    def test_is_shared_task(self):
        assert send_due_reminders.name == "billing.send_reminders"

    def test_has_acks_late(self):
        assert send_due_reminders.acks_late is True

    def test_retry_cap_is_three(self):
        assert MAX_REMINDER_ATTEMPTS == 3


class TestSendDueRemindersRun:
    def _run(self, session, email_result=True):
        with (
            patch("tasks.billing.get_sync_session", return_value=session),
            patch(
                "tasks.billing.send_billing_reminder_email",
                new=AsyncMock(return_value=email_result),
            ) as send,
        ):
            result = send_due_reminders()
        return result, send

    def test_sends_the_due_stage_and_records_it(self):
        invoice = _invoice(days_ago=1)
        session = _session(invoice=invoice)

        result, send = self._run(session)

        assert result == {"sent_count": 1, "failed_count": 0, "skipped_count": 0}
        send.assert_awaited_once()
        kwargs = send.await_args.kwargs
        assert kwargs["stage"] == "due_today"
        assert kwargs["invoice_number"] == "SX-202610-0001"
        assert kwargs["organization_name"] == "Acme"
        assert kwargs["amount_idr"] == invoice.total_idr

        recorded = session.add.call_args[0][0]
        assert recorded.stage == "due_today"
        assert recorded.sent_count == 1
        assert recorded.attempts == 1
        session.commit.assert_called_once()
        session.close.assert_called_once()

    def test_reminder_uses_total_idr_when_total_is_zero(self):
        invoice = _invoice(days_ago=1)
        invoice.amount_idr = 650_000
        invoice.total_idr = 0
        session = _session(invoice=invoice)

        _, send = self._run(session)

        send.assert_awaited_once()
        assert send.await_args.kwargs["amount_idr"] == 0

    def test_skips_a_stage_that_was_already_sent(self):
        invoice = _invoice(days_ago=1)
        sent = SimpleNamespace(stage="due_today", stage_rank=2, sent_count=1, attempts=1)
        session = _session(invoice=invoice, existing=[sent])

        result, send = self._run(session)

        assert result["sent_count"] == 0
        assert result["skipped_count"] == 1
        send.assert_not_awaited()
        session.add.assert_not_called()

    def test_retries_a_failed_stage_instead_of_suppressing_it(self):
        invoice = _invoice(days_ago=1)
        failed = SimpleNamespace(
            stage="due_today", stage_rank=2, sent_count=0, failed_count=1, attempts=1
        )
        session = _session(invoice=invoice, existing=[failed])

        result, send = self._run(session)

        assert result == {"sent_count": 1, "failed_count": 0, "skipped_count": 0}
        send.assert_awaited_once()
        assert failed.attempts == 2
        assert failed.sent_count == 1
        session.add.assert_not_called()

    def test_stops_retrying_after_the_attempt_cap(self):
        invoice = _invoice(days_ago=1)
        exhausted = SimpleNamespace(
            stage="due_today",
            stage_rank=2,
            sent_count=0,
            failed_count=MAX_REMINDER_ATTEMPTS,
            attempts=MAX_REMINDER_ATTEMPTS,
        )
        session = _session(invoice=invoice, existing=[exhausted])

        result, send = self._run(session)

        assert result["skipped_count"] == 1
        send.assert_not_awaited()

    def test_does_not_walk_back_to_an_earlier_stage(self):
        invoice = _invoice(days_ago=1)
        later = SimpleNamespace(
            stage="overdue_1", stage_rank=3, sent_count=1, failed_count=0, attempts=1
        )
        session = _session(invoice=invoice, existing=[later])

        result, send = self._run(session)

        assert result["skipped_count"] == 1
        send.assert_not_awaited()

    def test_billing_recipient_replaces_the_owner_fallback(self):
        invoice = _invoice(days_ago=1)
        session = _session(
            invoice=invoice,
            billing_emails=["ap@example.com", "controller@example.com"],
        )

        result, send = self._run(session)

        assert result["sent_count"] == 2
        addresses = [call.args[0] for call in send.await_args_list]
        assert addresses == ["ap@example.com", "controller@example.com"]

    def test_profile_billing_email_is_the_first_recipient(self):
        invoice = _invoice(days_ago=1)
        session = _session(
            invoice=invoice,
            billing_email="finance@example.com",
            billing_emails=["ap@example.com"],
        )

        result, send = self._run(session)

        assert result["sent_count"] == 2
        assert send.await_args_list[0].args[0] == "finance@example.com"

    def test_records_no_recipients_without_sending(self):
        invoice = _invoice(days_ago=1)
        session = _session(invoice=invoice, recipients=[])

        result, send = self._run(session)

        assert result["sent_count"] == 0
        assert result["skipped_count"] == 1
        send.assert_not_awaited()
        recorded = session.add.call_args[0][0]
        assert recorded.last_error == "no recipients"

    def test_counts_failures_and_keeps_the_ledger(self):
        invoice = _invoice(days_ago=1)
        session = _session(invoice=invoice)

        result, send = self._run(session, email_result=False)

        assert result == {"sent_count": 0, "failed_count": 1, "skipped_count": 0}
        send.assert_awaited_once()
        recorded = session.add.call_args[0][0]
        assert recorded.failed_count == 1
        assert recorded.sent_count == 0

    def test_rolls_back_on_error(self):
        session = MagicMock()
        session.execute.side_effect = RuntimeError("db down")
        with patch("tasks.billing.get_sync_session", return_value=session), pytest.raises(RuntimeError):
            send_due_reminders()
        session.rollback.assert_called_once()
        session.commit.assert_not_called()
        session.close.assert_called_once()


class TestNextAnnualStart:
    def test_mid_year_rolls_to_next_month(self):
        assert _next_annual_start(datetime(2027, 8, 31, 23, 59, 59, tzinfo=UTC)) == datetime(
            2027, 9, 1, tzinfo=UTC
        )

    def test_december_rolls_to_january_next_year(self):
        assert _next_annual_start(datetime(2027, 12, 31, 23, 59, 59, tzinfo=UTC)) == datetime(
            2028, 1, 1, tzinfo=UTC
        )


class TestDraftAnnualRenewals:
    def test_lead_defaults_to_forty_five_days(self):
        assert RENEWAL_DRAFT_LEAD_DAYS == 45

    def test_task_is_registered(self):
        assert draft_annual_renewals.name == "billing.draft_annual_renewals"

    def test_returns_zero_when_nothing_is_due(self):
        session = MagicMock()
        empty = MagicMock()
        empty.all.return_value = []
        session.execute.return_value = empty
        with patch("tasks.billing.get_sync_session", return_value=session):
            result = draft_annual_renewals()
        assert result == {"created_count": 0, "skipped_count": 0}
        session.commit.assert_called_once()
        session.close.assert_called_once()

    def test_rolls_back_on_error(self):
        session = MagicMock()
        session.execute.side_effect = RuntimeError("db down")
        with patch("tasks.billing.get_sync_session", return_value=session), pytest.raises(RuntimeError):
            draft_annual_renewals()
        session.rollback.assert_called_once()
        session.commit.assert_not_called()
        session.close.assert_called_once()

    def test_creates_one_annual_draft_at_ten_months_price(self):
        from app.models.invoice import OrgInvoice

        now = datetime.now(UTC)
        sub = SimpleNamespace(
            organization_id=uuid.uuid4(),
            sku="pro",
            cycle="annual",
            status="active",
            cancel_at_period_end=False,
            current_period_end=now + timedelta(days=30),
        )
        rows_result = MagicMock()
        rows_result.all.return_value = [(sub, "Acme")]
        catalog_result = MagicMock()
        catalog_result.scalar_one_or_none.return_value = SimpleNamespace(list_idr=650_000)
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = None
        number_result = MagicMock()
        number_result.scalar_one.return_value = 0

        session = MagicMock()
        session.execute.side_effect = [
            rows_result,
            catalog_result,
            existing_result,
            number_result,
        ]
        session.get.return_value = SimpleNamespace(
            pkp_status="unknown", payment_terms_days=0
        )

        with patch("tasks.billing.get_sync_session", return_value=session):
            result = draft_annual_renewals()

        assert result == {"created_count": 1, "skipped_count": 0}
        session.add.assert_called_once()
        draft = session.add.call_args[0][0]
        assert isinstance(draft, OrgInvoice)
        assert draft.status == "draft"
        assert draft.amount_idr == 6_500_000  # 10 x 650_000
        assert draft.total_idr == 6_500_000
        assert (draft.period_end - draft.period_start).days >= 364
        session.commit.assert_called_once()

    def test_skips_when_the_next_period_already_has_an_invoice(self):
        now = datetime.now(UTC)
        sub = SimpleNamespace(
            organization_id=uuid.uuid4(),
            sku="pro",
            cycle="annual",
            status="active",
            cancel_at_period_end=False,
            current_period_end=now + timedelta(days=30),
        )
        rows_result = MagicMock()
        rows_result.all.return_value = [(sub, "Acme")]
        catalog_result = MagicMock()
        catalog_result.scalar_one_or_none.return_value = SimpleNamespace(list_idr=650_000)
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = uuid.uuid4()

        session = MagicMock()
        session.execute.side_effect = [rows_result, catalog_result, existing_result]

        with patch("tasks.billing.get_sync_session", return_value=session):
            result = draft_annual_renewals()

        assert result == {"created_count": 0, "skipped_count": 1}
        session.add.assert_not_called()

    def test_grandfathered_inactive_tier_still_gets_renewal_draft(self):
        from app.models.invoice import OrgInvoice

        now = datetime.now(UTC)
        sub = SimpleNamespace(
            organization_id=uuid.uuid4(),
            sku="multi",
            cycle="annual",
            status="active",
            cancel_at_period_end=False,
            current_period_end=now + timedelta(days=30),
            tier_active=False,
        )
        rows_result = MagicMock()
        rows_result.all.return_value = [(sub, "Acme")]
        catalog_result = MagicMock()
        catalog_result.scalar_one_or_none.return_value = SimpleNamespace(list_idr=2_000_000)
        existing_result = MagicMock()
        existing_result.scalar_one_or_none.return_value = None
        number_result = MagicMock()
        number_result.scalar_one.return_value = 0

        session = MagicMock()
        session.execute.side_effect = [
            rows_result,
            catalog_result,
            existing_result,
            number_result,
        ]
        session.get.return_value = SimpleNamespace(pkp_status="unknown", payment_terms_days=0)

        with patch("tasks.billing.get_sync_session", return_value=session):
            result = draft_annual_renewals()

        assert result == {"created_count": 1, "skipped_count": 0}
        draft = session.add.call_args[0][0]
        assert isinstance(draft, OrgInvoice)
        assert draft.sku == "multi"
        assert draft.amount_idr == 20_000_000


class TestReconcileGatewayAttempts:
    def test_task_runs_while_gateway_flag_is_off(self, monkeypatch):
        from app.config import settings


        monkeypatch.setattr(settings, "payment_gateway_enabled", False)
        expected = {"reconciled_count": 1, "error_count": 0, "skipped_count": 0}

        def fake_run(coro):
            coro.close()
            return expected

        with patch("tasks.billing._reconcile_gateway_attempts", new=AsyncMock(return_value=expected)), patch(
            "tasks.billing._run", side_effect=fake_run
        ) as run:
            outcome = reconcile_gateway_attempts()

        assert outcome == expected
        run.assert_called_once()

    @pytest.mark.asyncio
    async def test_reconciles_configured_provider_with_flag_off(self, monkeypatch):
        from app.config import settings
        from app.services.payments.base import NormalizedEvent, StatusResult
        from app.services.payments.midtrans import MidtransProvider


        monkeypatch.setattr(settings, "payment_gateway_enabled", False)
        monkeypatch.setattr(settings, "midtrans_server_key", "SB-Mid-server-test-123")
        monkeypatch.setattr(settings, "midtrans_is_production", False)

        attempt = SimpleNamespace(id=uuid.uuid4(), provider="midtrans")
        event = NormalizedEvent(
            event_id="trx-reconcile:settlement:200:accept",
            kind="succeeded",
            provider_order_id="SX-1-A1",
            provider_payment_id="trx-reconcile",
            amount_idr=1_000_000,
            currency="IDR",
        )
        rows_result = MagicMock()
        rows_result.scalars.return_value.all.return_value = [attempt]
        session = MagicMock()
        session.execute = AsyncMock(return_value=rows_result)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        @asynccontextmanager
        async def fake_session():
            yield session

        applied: list[tuple[str, NormalizedEvent]] = []

        class FakeBillingService:
            def __init__(self, db):
                self.db = db

            async def apply_gateway_event(self, provider, normalized):
                applied.append((provider, normalized))

        async def fake_fetch_status(self, attempt):
            return StatusResult(found=True, event=event)

        monkeypatch.setattr("app.database.async_session", fake_session)
        monkeypatch.setattr("app.services.billing.BillingService", FakeBillingService)
        monkeypatch.setattr(MidtransProvider, "fetch_status", fake_fetch_status)

        outcome = await _reconcile_gateway_attempts()

        assert outcome == {"reconciled_count": 1, "error_count": 0, "skipped_count": 0}
        assert applied == [("midtrans", event)]
        session.commit.assert_awaited_once()
        session.rollback.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_skips_unconfigured_provider_without_error(self, monkeypatch):
        from app.config import settings
        from app.services.payments.midtrans import MidtransProvider


        monkeypatch.setattr(settings, "payment_gateway_enabled", False)
        monkeypatch.setattr(settings, "midtrans_server_key", "")
        monkeypatch.setattr(settings, "midtrans_is_production", False)

        attempt = SimpleNamespace(id=uuid.uuid4(), provider="midtrans")
        rows_result = MagicMock()
        rows_result.scalars.return_value.all.return_value = [attempt]
        session = MagicMock()
        session.execute = AsyncMock(return_value=rows_result)
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        @asynccontextmanager
        async def fake_session():
            yield session

        fetch_status = AsyncMock()
        monkeypatch.setattr("app.database.async_session", fake_session)
        monkeypatch.setattr(MidtransProvider, "fetch_status", fetch_status)

        outcome = await _reconcile_gateway_attempts()

        assert outcome == {"reconciled_count": 0, "error_count": 0, "skipped_count": 1}
        fetch_status.assert_not_awaited()
        session.commit.assert_not_awaited()
        session.rollback.assert_not_awaited()
