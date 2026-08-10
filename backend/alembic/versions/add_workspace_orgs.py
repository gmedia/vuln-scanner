"""add organizations, memberships, invites; org FK on jobs/schedules; backfill

Revision ID: add_workspace_orgs
Revises: add_scan_schedules
Create Date: 2026-08-10
"""

from __future__ import annotations

import re
import secrets
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_workspace_orgs"
down_revision: str | None = "add_scan_schedules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify_local(email: str) -> str:
    local = (email or "user").split("@", 1)[0].lower()
    cleaned = _SLUG_RE.sub("-", local).strip("-") or "user"
    return cleaned[:40]


def _backfill_personal_orgs() -> None:
    bind = op.get_bind()
    users = bind.execute(sa.text("SELECT id, email FROM users")).fetchall()
    now = datetime.now(UTC)

    for user_id, email in users:
        existing = bind.execute(
            sa.text(
                """
                SELECT o.id
                FROM organizations o
                JOIN organization_memberships m ON m.organization_id = o.id
                WHERE m.user_id = :uid AND o.kind = 'personal' AND m.role = 'owner'
                LIMIT 1
                """
            ),
            {"uid": user_id},
        ).fetchone()
        if existing:
            org_id = existing[0]
        else:
            org_id = uuid.uuid4()
            base = _slugify_local(str(email))
            suffix = secrets.token_hex(3)
            slug = f"{base}-{suffix}"[:64]
            for _ in range(5):
                clash = bind.execute(
                    sa.text("SELECT 1 FROM organizations WHERE slug = :slug"),
                    {"slug": slug},
                ).fetchone()
                if not clash:
                    break
                slug = f"{base}-{secrets.token_hex(3)}"[:64]

            local_name = (str(email).split("@", 1)[0] if email else "Personal")[:200]
            bind.execute(
                sa.text(
                    """
                    INSERT INTO organizations (id, name, slug, kind, created_by_user_id, created_at, updated_at)
                    VALUES (:id, :name, :slug, 'personal', :uid, :now, :now)
                    """
                ),
                {
                    "id": org_id,
                    "name": f"{local_name}'s workspace",
                    "slug": slug,
                    "uid": user_id,
                    "now": now,
                },
            )
            bind.execute(
                sa.text(
                    """
                    INSERT INTO organization_memberships
                        (id, organization_id, user_id, role, created_at, updated_at)
                    VALUES (:id, :org_id, :uid, 'owner', :now, :now)
                    """
                ),
                {"id": uuid.uuid4(), "org_id": org_id, "uid": user_id, "now": now},
            )

        bind.execute(
            sa.text(
                """
                UPDATE scan_jobs
                SET organization_id = :org_id
                WHERE user_id = :uid AND organization_id IS NULL
                """
            ),
            {"org_id": org_id, "uid": user_id},
        )
        bind.execute(
            sa.text(
                """
                UPDATE scan_schedules
                SET organization_id = :org_id
                WHERE user_id = :uid AND organization_id IS NULL
                """
            ),
            {"org_id": org_id, "uid": user_id},
        )
        bind.execute(
            sa.text(
                """
                UPDATE users
                SET last_active_organization_id = :org_id
                WHERE id = :uid AND last_active_organization_id IS NULL
                """
            ),
            {"org_id": org_id, "uid": user_id},
        )


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="personal"),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("slug"),
        sa.CheckConstraint("kind IN ('personal', 'company', 'hotel')", name="ck_organization_kind"),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_membership_org_user"),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'member', 'viewer')",
            name="ck_organization_membership_role",
        ),
    )
    op.create_index("ix_organization_memberships_organization_id", "organization_memberships", ["organization_id"])
    op.create_index("ix_organization_memberships_user_id", "organization_memberships", ["user_id"])

    op.create_table(
        "organization_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["accepted_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("token_hash"),
        sa.CheckConstraint("role IN ('admin', 'member', 'viewer')", name="ck_organization_invite_role"),
        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked', 'expired')",
            name="ck_organization_invite_status",
        ),
    )
    op.create_index("ix_organization_invites_organization_id", "organization_invites", ["organization_id"])
    op.create_index("ix_organization_invites_email", "organization_invites", ["email"])

    op.add_column(
        "scan_jobs",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_scan_jobs_organization_id", "scan_jobs", ["organization_id"])
    op.create_foreign_key(
        "fk_scan_jobs_organization_id",
        "scan_jobs",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_scan_schedules_organization_id", "scan_schedules", ["organization_id"])
    op.create_foreign_key(
        "fk_scan_schedules_organization_id",
        "scan_schedules",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "users",
        sa.Column("last_active_organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_last_active_org",
        "users",
        "organizations",
        ["last_active_organization_id"],
        ["id"],
        ondelete="SET NULL",
    )

    _backfill_personal_orgs()


def downgrade() -> None:
    op.drop_constraint("fk_users_last_active_org", "users", type_="foreignkey")
    op.drop_column("users", "last_active_organization_id")

    op.drop_constraint("fk_scan_schedules_organization_id", "scan_schedules", type_="foreignkey")
    op.drop_index("ix_scan_schedules_organization_id", table_name="scan_schedules")

    op.drop_constraint("fk_scan_jobs_organization_id", "scan_jobs", type_="foreignkey")
    op.drop_index("ix_scan_jobs_organization_id", table_name="scan_jobs")
    op.drop_column("scan_jobs", "organization_id")

    op.drop_index("ix_organization_invites_email", table_name="organization_invites")
    op.drop_index("ix_organization_invites_organization_id", table_name="organization_invites")
    op.drop_table("organization_invites")

    op.drop_index("ix_organization_memberships_user_id", table_name="organization_memberships")
    op.drop_index("ix_organization_memberships_organization_id", table_name="organization_memberships")
    op.drop_table("organization_memberships")

    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
