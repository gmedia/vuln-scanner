"""Seed one opening ledger row per pre-existing wallet.

Revision ID: add_ai_wallet_ledger_opening
Revises: add_ai_pricing_usd
Create Date: 2026-11-02

``ai_wallet_ledger`` shipped after ``ai_wallets`` had already taken balances, so
wallets that predate it have ``sum(delta_idr) != balance_idr``. One ``opening``
row per wallet closes the gap: its delta is ``balance_idr`` minus the sum of the
non-opening ledger rows, which makes ``sum(delta_idr) == balance_idr`` hold for
every wallet. The insert is idempotent — a wallet that already has an opening
row (e.g. a retried deploy) is skipped.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_ai_wallet_ledger_opening"
down_revision: str | None = "add_ai_pricing_usd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KINDS_WITHOUT_OPENING = "kind IN ('topup','reserve','settle_adjust','release','manual_adjust')"
_KINDS_WITH_OPENING = "kind IN ('topup','reserve','settle_adjust','release','manual_adjust','opening')"


def upgrade() -> None:
    op.drop_constraint("ck_ai_wallet_ledger_kind", "ai_wallet_ledger", type_="check")
    op.create_check_constraint("ck_ai_wallet_ledger_kind", "ai_wallet_ledger", _KINDS_WITH_OPENING)

    op.get_bind().execute(
        sa.text(
            """
            INSERT INTO ai_wallet_ledger (id, organization_id, kind, delta_idr, balance_after_idr, note, created_at)
            SELECT gen_random_uuid(), w.organization_id, 'opening',
                   w.balance_idr - COALESCE(l.total, 0),
                   w.balance_idr, 'pre-ledger balance', now()
            FROM ai_wallets w
            LEFT JOIN (
              SELECT organization_id, SUM(delta_idr) AS total
              FROM ai_wallet_ledger
              WHERE kind <> 'opening'
              GROUP BY organization_id
            ) l ON l.organization_id = w.organization_id
            WHERE NOT EXISTS (
              SELECT 1 FROM ai_wallet_ledger e
              WHERE e.organization_id = w.organization_id AND e.kind = 'opening'
            )
            """
        )
    )


def downgrade() -> None:
    op.get_bind().execute(sa.text("DELETE FROM ai_wallet_ledger WHERE kind = 'opening'"))
    op.drop_constraint("ck_ai_wallet_ledger_kind", "ai_wallet_ledger", type_="check")
    op.create_check_constraint("ck_ai_wallet_ledger_kind", "ai_wallet_ledger", _KINDS_WITHOUT_OPENING)
