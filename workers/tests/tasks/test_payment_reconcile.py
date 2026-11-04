from __future__ import annotations

from unittest.mock import MagicMock, patch

from tasks.billing import expire_stale_checkouts, reconcile_gateway_attempts


def test_expire_stale_checkouts_marks_pending_rows_expired() -> None:
    session = MagicMock()
    result = MagicMock()
    result.rowcount = 3
    session.execute.return_value = result
    with patch("tasks.billing.get_sync_session", return_value=session):
        outcome = expire_stale_checkouts()

    assert outcome == {"expired_count": 3}
    session.commit.assert_called_once()
    statement, params = session.execute.call_args[0]
    sql = str(statement)
    assert "UPDATE payment_attempts" in sql
    assert "status = 'pending'" in sql
    assert "expires_at < :now" in sql
    assert "now" in params


def test_expire_stale_checkouts_rolls_back_on_error() -> None:
    session = MagicMock()
    session.execute.side_effect = RuntimeError("db down")
    with patch("tasks.billing.get_sync_session", return_value=session):
        try:
            expire_stale_checkouts()
        except RuntimeError:
            pass
        else:
            raise AssertionError("expected the error to propagate")

    session.rollback.assert_called_once()
    session.commit.assert_not_called()


def test_reconcile_gateway_attempts_skips_when_gateway_disabled(monkeypatch) -> None:
    import tasks.billing as billing

    monkeypatch.setattr(billing.settings, "payment_gateway_enabled", False)
    with patch("tasks.billing._run") as run:
        outcome = reconcile_gateway_attempts()

    assert outcome["skipped"] is True
    assert outcome["reconciled_count"] == 0
    run.assert_not_called()
