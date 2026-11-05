"""Link an invoice to the subscription request that authorized it.

Revision ID: invoice_request_link_v1
Revises: promo_approval_v1
Create Date: 2026-11-05

Before this revision a consumed request was only guarded through
``promo_redemptions.subscription_request_id``, so a request invoiced *without*
a promo code could be invoiced again for another period. The link now lives on
the invoice itself.

Uniqueness semantics
--------------------
A request may back at most one invoice row at a time. The partial unique index
predicate is deliberately ``subscription_request_id IS NOT NULL`` and does
**not** reference the mutable ``status`` column. PostgreSQL re-evaluates a
partial index predicate whenever an indexed row is updated, so a predicate like
``status <> 'void'`` would make a ``void -> sent`` transition collide with a
newer invoice that reused the request; that IntegrityError would surface inside
``create_invoice``'s three-attempt number-allocation retry as the misleading
"Could not allocate a unique invoice number". Instead, ``InvoiceService._void``
sets ``subscription_request_id = NULL`` in the same transaction as the void, so
the link column itself is the stable source of truth: non-NULL means "consumed
by exactly this invoice row".

The explicit 409 check in ``InvoiceService`` is the user-facing guard; the
index is the concurrency backstop.

Existing rows backfill as NULL (pre-existing invoices have no link); no data
migration is needed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "invoice_request_link_v1"
down_revision: str | None = "promo_approval_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "org_invoices",
        sa.Column(
            "subscription_request_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_org_invoices_subscription_request_id",
        "org_invoices",
        "subscription_requests",
        ["subscription_request_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_org_invoices_subscription_request_id",
        "org_invoices",
        ["subscription_request_id"],
    )
    op.create_index(
        "uq_org_invoices_subscription_request",
        "org_invoices",
        ["subscription_request_id"],
        unique=True,
        postgresql_where=sa.text("subscription_request_id IS NOT NULL"),
        sqlite_where=sa.text("subscription_request_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_org_invoices_subscription_request", table_name="org_invoices"
    )
    op.drop_index(
        "ix_org_invoices_subscription_request_id", table_name="org_invoices"
    )
    op.drop_constraint(
        "fk_org_invoices_subscription_request_id",
        "org_invoices",
        type_="foreignkey",
    )
    op.drop_column("org_invoices", "subscription_request_id")
