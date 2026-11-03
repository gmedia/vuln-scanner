"""Append-only audit trail for HPP settings.

``hpp_rates`` and ``hpp_overhead`` only keep ``updated_at`` + ``updated_by``
(the last writer). HPP feeds margin reporting, so every cost change is recorded
here as one immutable row with the previous and new amount. The two PUT
handlers append a row in the same transaction as the mutation; reads never
write.

``key`` is the HPP key for ``scope='rate'`` and ``NULL`` for the overhead
singleton. ``amount_from`` is ``NULL`` when the setting had no previous value
(a brand-new rate row or an overhead row created for the first time).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

HPP_HISTORY_SCOPES = ("rate", "overhead")

_SCOPE_CHECK = "scope IN ('rate', 'overhead')"
_SCOPE_KEY_CHECK = "(scope = 'overhead' AND key IS NULL) OR (scope = 'rate' AND key IS NOT NULL)"


class HppSettingHistory(Base):
    __tablename__ = "hpp_setting_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    key: Mapped[str | None] = mapped_column(String(20), nullable=True)
    amount_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_to: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint(
            "amount_from IS NULL OR amount_from >= 0",
            name="ck_hpp_setting_history_amount_from_non_negative",
        ),
        CheckConstraint(
            "amount_to >= 0",
            name="ck_hpp_setting_history_amount_to_non_negative",
        ),
        CheckConstraint(_SCOPE_CHECK, name="ck_hpp_setting_history_scope"),
        CheckConstraint(_SCOPE_KEY_CHECK, name="ck_hpp_setting_history_scope_key"),
        Index("ix_hpp_setting_history_scope_key_created", "scope", "key", "created_at"),
    )
