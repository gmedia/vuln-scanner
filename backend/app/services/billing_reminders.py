"""Invoice reminder stage policy.

Pure functions so the worker sweep and the backend tests share one definition
of "which reminder is due". Offsets are relative to the invoice **due date**,
not the service period: a net-30 invoice must not be chased on day 7.
"""

from __future__ import annotations

from datetime import datetime

# (stage, days relative to due_date). The sweep sends only the latest stage
# that has come due, so a worker outage does not produce a burst of old mail.
REMINDER_STAGES: tuple[tuple[str, int], ...] = (
    ("due_soon", -3),
    ("due_today", 0),
    ("overdue_1", 3),
    ("overdue_2", 7),
    ("final", 14),
    ("suspend_notice", 30),
)

_STAGE_RANK: dict[str, int] = {name: rank for rank, (name, _) in enumerate(REMINDER_STAGES, start=1)}


def stage_rank(stage: str | None) -> int:
    if stage is None:
        return 0
    return _STAGE_RANK.get(stage, 0)


def due_stage(due_date: datetime, now: datetime) -> str | None:
    """Latest stage whose trigger date has passed, or ``None`` if not yet due."""
    days = (now.date() - due_date.date()).days
    candidate: str | None = None
    for name, offset in REMINDER_STAGES:
        if days >= offset:
            candidate = name
    return candidate


def next_stage(due_date: datetime, now: datetime, last_stage: str | None) -> str | None:
    """Stage to send now, skipping anything at or before ``last_stage``."""
    candidate = due_stage(due_date, now)
    if candidate is None:
        return None
    if stage_rank(candidate) <= stage_rank(last_stage):
        return None
    return candidate
