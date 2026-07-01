"""add admin, credits, pricing

Revision ID: b0d39330c1b8
Revises: add_users_auth
Create Date: 2026-06-22 13:25:02.477918
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from passlib.context import CryptContext
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "b0d39330c1b8"
down_revision: str | None = "add_users_auth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _seed_pricing() -> None:
    op.execute(
        sa.text(
            """
        INSERT INTO pricing (id, scan_type, credit_cost, updated_at)
        VALUES
          (gen_random_uuid(), 'ip', 1, now()),
          (gen_random_uuid(), 'domain', 2, now()),
          (gen_random_uuid(), 'apk', 3, now()),
          (gen_random_uuid(), 'ipa', 3, now())
        ON CONFLICT (scan_type) DO NOTHING
        """
        )
    )


def _seed_admin_user() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "").strip()
    if not admin_email or not admin_password:
        return
    password_hash = pwd_context.hash(admin_password)
    op.execute(
        sa.text(
            """
        INSERT INTO users (id, email, password_hash, is_verified, is_admin,
                          credits, verified_at, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          :email,
          :password_hash,
          true,
          true,
          999999,
          now(),
          now(),
          now()
        )
        ON CONFLICT (email) DO UPDATE SET
          is_admin = true,
          credits = 999999,
          updated_at = now()
        """
        ).bindparams(email=admin_email, password_hash=password_hash),
    )


def upgrade() -> None:
    # 1. Add is_admin and credits to users
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("credits", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.create_check_constraint("ck_user_credits_non_negative", "users", "credits >= 0")

    # 2. Add user_id and credit_cost to scan_jobs
    op.add_column("scan_jobs", sa.Column("user_id", postgresql.UUID(), nullable=True))
    op.add_column("scan_jobs", sa.Column("credit_cost", sa.Integer(), nullable=False, server_default=sa.text("0")))

    # Backfill user_id: if any scan_jobs exist without user_id, we can't make it NOT NULL yet.
    # Assign to the admin user if one exists, otherwise leave NULL for migration safety.
    op.execute(
        sa.text(
            """
        UPDATE scan_jobs
        SET user_id = (
            SELECT id FROM users WHERE is_admin = true LIMIT 1
        )
        WHERE user_id IS NULL
        """
        )
    )

    # Now make user_id NOT NULL
    op.alter_column("scan_jobs", "user_id", nullable=False)
    op.create_foreign_key("fk_scan_jobs_user_id", "scan_jobs", "users", ["user_id"], ["id"])

    # 3. Create credit_logs table
    op.create_table(
        "credit_logs",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("user_id", postgresql.UUID(), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("reference_id", postgresql.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.CheckConstraint("type IN ('credit', 'deduct', 'refund')", name="ck_credit_log_type"),
    )

    # 4. Create pricing table
    op.create_table(
        "pricing",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("scan_type", sa.String(length=10), nullable=False),
        sa.Column("credit_cost", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scan_type"),
        sa.CheckConstraint("credit_cost >= 0", name="ck_pricing_credit_cost_non_negative"),
    )

    # 5. Seed pricing defaults
    _seed_pricing()

    # 6. Seed admin user from env vars
    _seed_admin_user()


def downgrade() -> None:
    op.drop_table("pricing")
    op.drop_table("credit_logs")

    op.drop_constraint("fk_scan_jobs_user_id", "scan_jobs", type_="foreignkey")
    op.drop_column("scan_jobs", "credit_cost")
    op.drop_column("scan_jobs", "user_id")

    op.drop_constraint("ck_user_credits_non_negative", "users", type_="check")
    op.drop_column("users", "credits")
    op.drop_column("users", "is_admin")
