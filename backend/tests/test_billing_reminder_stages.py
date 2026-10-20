from datetime import UTC, datetime

from app.services.billing_reminders import (
    REMINDER_STAGES,
    due_stage,
    first_contact_stage,
    next_stage,
    stage_rank,
)

DUE = datetime(2026, 10, 15, 12, tzinfo=UTC)


def _at(day: int, month: int = 10) -> datetime:
    return datetime(2026, month, day, 9, tzinfo=UTC)


def test_stage_order_is_stable() -> None:
    assert [name for name, _ in REMINDER_STAGES] == [
        "due_soon",
        "due_today",
        "overdue_1",
        "overdue_2",
        "final",
        "suspend_notice",
    ]
    assert stage_rank("due_soon") < stage_rank("due_today") < stage_rank("final")


def test_no_reminder_before_the_pre_due_window() -> None:
    assert due_stage(DUE, _at(10)) is None


def test_due_soon_three_days_before() -> None:
    assert due_stage(DUE, _at(12)) == "due_soon"
    assert due_stage(DUE, _at(13)) == "due_soon"


def test_due_today_and_after() -> None:
    assert due_stage(DUE, _at(15)) == "due_today"
    assert due_stage(DUE, _at(17)) == "due_today"


def test_overdue_stages() -> None:
    assert due_stage(DUE, _at(18)) == "overdue_1"
    assert due_stage(DUE, _at(22)) == "overdue_2"
    assert due_stage(DUE, _at(29)) == "final"
    assert due_stage(DUE, _at(31)) == "final"


def test_suspend_notice_after_thirty_days() -> None:
    assert due_stage(DUE, datetime(2026, 11, 14, 9, tzinfo=UTC)) == "suspend_notice"


def test_next_stage_skips_older_stages_after_an_outage() -> None:
    # Worker was down until day 8: send overdue_2 once, not the four older ones.
    assert next_stage(DUE, _at(23), None) == "overdue_2"
    assert next_stage(DUE, _at(23), "due_today") == "overdue_2"


def test_next_stage_returns_none_when_already_sent() -> None:
    assert next_stage(DUE, _at(23), "overdue_2") is None
    assert next_stage(DUE, datetime(2026, 11, 24, 9, tzinfo=UTC), "suspend_notice") is None


def test_first_contact_is_normal_when_sent_on_time() -> None:
    assert first_contact_stage(DUE, _at(18), datetime(2026, 10, 15, 8, tzinfo=UTC)) == "overdue_1"


def test_first_contact_is_capped_when_sent_late() -> None:
    # Sent 20 days after the due date; without the cap this would be `final`.
    sent_late = datetime(2026, 11, 4, 8, tzinfo=UTC)
    assert due_stage(DUE, _at(5, 11)) == "final"
    assert first_contact_stage(DUE, _at(5, 11), sent_late) == "overdue_1"


def test_first_contact_without_sent_at_is_unchanged() -> None:
    assert first_contact_stage(DUE, _at(5, 11), None) == "final"


def test_first_contact_before_the_window_is_none() -> None:
    assert first_contact_stage(DUE, _at(10), None) is None
