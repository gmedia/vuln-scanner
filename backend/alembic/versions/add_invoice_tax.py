"""Invoice tax breakdown (DPP, PPN, PPh 23, total).

Revision ID: add_invoice_tax
Revises: add_subscription_cancel_note
Create Date: 2026-10-21

Existing invoices keep their payable amount: DPP and total are backfilled to
``amount_idr`` with zero tax, so the pay loop and historical PDFs are unchanged.
New invoices for a PKP buyer store DPP 11/12 and PPN 12% of DPP.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_invoice_tax"
down_revision: str | None = "add_subscription_cancel_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("org_invoices", sa.Column("dpp_idr", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("org_invoices", sa.Column("ppn_idr", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("org_invoices", sa.Column("pph23_idr", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("org_invoices", sa.Column("total_idr", sa.Integer(), nullable=False, server_default="0"))
    op.execute(sa.text("UPDATE org_invoices SET dpp_idr = amount_idr, total_idr = amount_idr"))


def downgrade() -> None:
    op.drop_column("org_invoices", "total_idr")
    op.drop_column("org_invoices", "pph23_idr")
    op.drop_column("org_invoices", "ppn_idr")
    op.drop_column("org_invoices", "dpp_idr")
