import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

HPP_KEYS = ("ip", "domain", "apk", "ipa", "statushost")


class HppRate(Base):
    __tablename__ = "hpp_rates"

    key: Mapped[str] = mapped_column(String(20), primary_key=True)
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("amount_idr >= 0", name="ck_hpp_rates_amount_non_negative"),
        CheckConstraint("key IN ('ip', 'domain', 'apk', 'ipa', 'statushost')", name="ck_hpp_rates_key"),
    )


HPP_COST_CATEGORIES = ("opex", "variable")

HPP_OVERHEAD_SINGLETON_ID = 1


class HppOverhead(Base):
    __tablename__ = "hpp_overhead"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (CheckConstraint("amount_idr >= 0", name="ck_hpp_overhead_amount_non_negative"),)


class HppCostLine(Base):
    __tablename__ = "hpp_cost_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incurred_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("amount_idr >= 0", name="ck_hpp_cost_lines_amount_non_negative"),
        CheckConstraint("category IN ('opex', 'variable')", name="ck_hpp_cost_lines_category"),
    )
