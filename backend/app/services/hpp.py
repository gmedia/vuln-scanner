"""Append-only HPP setting history writes.

The two HPP PUT handlers call :func:`record_setting_change` before their own
``commit()`` so the setting update and its history row land in one transaction.
Nothing is committed here; the caller owns the transaction.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hpp_history import HppSettingHistory


async def record_setting_change(
    db: AsyncSession,
    *,
    scope: str,
    key: str | None,
    amount_from: int | None,
    amount_to: int,
    actor_id: uuid.UUID | None,
) -> None:
    """Append one history row for a changed HPP setting.

    ``amount_from`` is ``None`` when the setting had no previous value. Callers
    must only call this when the amount actually changed; an identical PUT is
    not a change and writes nothing.
    """
    db.add(
        HppSettingHistory(
            scope=scope,
            key=key,
            amount_from=amount_from,
            amount_to=amount_to,
            actor_user_id=actor_id,
        )
    )
