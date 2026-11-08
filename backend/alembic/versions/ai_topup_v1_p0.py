"""AI wallet top-up v1 (P0): idempotent admin direct credit.

Revision ID: ai_topup_v1_p0
Revises: ai_topup_v1_s6
Create Date: 2026-11-08

The legacy admin direct top-up credited the wallet with no order, so a double
click credited twice. Admin credits now create an ``admin_credit`` order; this
column makes the operation idempotent at the database boundary with a partial
unique index. NULL keys are unaffected, so ordinary customer orders need no key.

The predicate is declared for both Postgres and SQLite: a Postgres-only
predicate makes the SQLite test schema create a full unique index, which would
reject every order after the first NULL-keyed one.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ai_topup_v1_p0"
down_revision: str | None = "ai_topup_v1_s6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX_NAME = "uq_ai_topup_orders_idempotency_key"
PREDICATE = sa.text("idempotency_key IS NOT NULL")


def upgrade() -> None:
    with op.batch_alter_table("ai_topup_orders") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=80), nullable=True))
    op.create_index(
        INDEX_NAME,
        "ai_topup_orders",
        ["idempotency_key"],
        unique=True,
        postgresql_where=PREDICATE,
        sqlite_where=PREDICATE,
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="ai_topup_orders")
    with op.batch_alter_table("ai_topup_orders") as batch_op:
        batch_op.drop_column("idempotency_key")
