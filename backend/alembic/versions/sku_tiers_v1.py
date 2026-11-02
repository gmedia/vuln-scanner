"""Introduce first-class SKU tiers and replace closed-set SKU checks with FKs.

Revision ID: sku_tiers_v1
Revises: add_ai_model_upstreams
Create Date: 2026-11-02

``sku_tiers`` becomes the source of truth for tier labels, ranking, feature
gates and capacity caps. The four existing tiers are seeded with exactly the
values the runtime already behaves as (enterprise keeps the effective
10/10/200/10 cap it inherits from the ``multi`` fallback today).

``sku_catalog`` stays the per-product price table: its ``sku`` becomes a
CASCADE FK (deleting an unused tier drops its prices), while history tables
(``organizations``, ``subscriptions``, ``org_invoices``,
``subscription_requests``) use RESTRICT so a used tier cannot be deleted.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "sku_tiers_v1"
down_revision: str | None = "add_ai_model_upstreams"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SEED_CODES = ("basic", "pro", "multi", "enterprise")

_SKUS_IN_SQL = """
    SELECT DISTINCT sku FROM organizations
    UNION SELECT DISTINCT sku FROM subscriptions
    UNION SELECT DISTINCT sku FROM org_invoices
    UNION SELECT DISTINCT current_sku FROM subscription_requests
    UNION SELECT DISTINCT target_sku FROM subscription_requests
    UNION SELECT DISTINCT sku FROM sku_catalog
"""

_ENTERPRISE_OFFENDERS_SQL = """
    SELECT 'sku_catalog' AS source FROM sku_catalog WHERE sku = 'enterprise'
    UNION ALL SELECT 'org_invoices' FROM org_invoices WHERE sku = 'enterprise'
    UNION ALL SELECT 'subscription_requests.target_sku'
        FROM subscription_requests WHERE target_sku = 'enterprise'
"""

_SEED_SQL = """
    INSERT INTO sku_tiers (
        code, label, rank, active, requestable, sales_led, is_default, bundle_idr,
        limit_scan, limit_host, limit_uptime, limit_guard,
        allow_status_page, allow_custom_host, allow_waf_protect, allow_siem,
        billing_unrestricted, workspace_editor_limit, workspace_viewer_limit,
        created_at, updated_at
    ) VALUES
        ('basic', 'Basic', 1, true, true, false, true, 450000, 1, 1, 10, 1,
         false, false, false, false, false, 1, 1, now(), now()),
        ('pro', 'Pro', 2, true, true, false, false, 1000000, 3, 3, 50, 3,
         true, false, true, false, false, NULL, NULL, now(), now()),
        ('multi', 'Multi', 3, true, true, false, false, 2900000, 10, 10, 200, 10,
         true, true, true, false, false, NULL, NULL, now(), now()),
        ('enterprise', 'Enterprise', 4, true, false, true, false, NULL, 10, 10, 200, 10,
         true, true, true, true, true, NULL, NULL, now(), now())
"""


def upgrade() -> None:
    bind = op.get_bind()

    existing = bind.execute(sa.text(_SKUS_IN_SQL)).scalars().all()
    unknown = sorted(set(existing) - set(_SEED_CODES))
    if unknown:
        raise RuntimeError(f"sku_tiers_v1: unknown SKU value(s) {unknown}; expected one of {list(_SEED_CODES)}")

    offenders = bind.execute(sa.text(_ENTERPRISE_OFFENDERS_SQL)).scalars().all()
    if offenders:
        raise RuntimeError(f"sku_tiers_v1: 'enterprise' is quote-only and cannot appear in {sorted(set(offenders))}")

    op.create_table(
        "sku_tiers",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=60), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("requestable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sales_led", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("bundle_idr", sa.Integer(), nullable=True),
        sa.Column("limit_scan", sa.Integer(), nullable=False),
        sa.Column("limit_host", sa.Integer(), nullable=False),
        sa.Column("limit_uptime", sa.Integer(), nullable=False),
        sa.Column("limit_guard", sa.Integer(), nullable=False),
        sa.Column("allow_status_page", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allow_custom_host", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allow_waf_protect", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allow_siem", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("billing_unrestricted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("workspace_editor_limit", sa.Integer(), nullable=True),
        sa.Column("workspace_viewer_limit", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], name="fk_sku_tiers_updated_by", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("code"),
        sa.CheckConstraint("code ~ '^[a-z][a-z0-9_]{1,19}$'", name="ck_sku_tiers_code"),
        sa.CheckConstraint("rank >= 1", name="ck_sku_tiers_rank"),
        sa.CheckConstraint("bundle_idr IS NULL OR bundle_idr >= 0", name="ck_sku_tiers_bundle"),
        sa.CheckConstraint(
            "limit_scan >= 1 AND limit_host >= 1 AND limit_uptime >= 1 AND limit_guard >= 1",
            name="ck_sku_tiers_limits",
        ),
        sa.CheckConstraint(
            "(workspace_editor_limit IS NULL OR workspace_editor_limit >= 1) AND "
            "(workspace_viewer_limit IS NULL OR workspace_viewer_limit >= 1)",
            name="ck_sku_tiers_workspace",
        ),
    )
    op.create_index("uq_sku_tiers_rank", "sku_tiers", ["rank"], unique=True)
    op.create_index(
        "uq_sku_tiers_default",
        "sku_tiers",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )
    op.create_index("ix_sku_tiers_active", "sku_tiers", ["active"])

    bind.execute(sa.text(_SEED_SQL))

    op.create_index("ix_sku_catalog_sku", "sku_catalog", ["sku"])
    op.create_foreign_key("fk_sku_catalog_sku", "sku_catalog", "sku_tiers", ["sku"], ["code"], ondelete="CASCADE")

    op.create_index("ix_organizations_sku", "organizations", ["sku"])
    op.create_foreign_key("fk_organization_sku", "organizations", "sku_tiers", ["sku"], ["code"], ondelete="RESTRICT")

    op.create_index("ix_subscriptions_sku", "subscriptions", ["sku"])
    op.create_foreign_key("fk_subscriptions_sku", "subscriptions", "sku_tiers", ["sku"], ["code"], ondelete="RESTRICT")

    op.create_index("ix_org_invoices_sku", "org_invoices", ["sku"])
    op.execute(
        "ALTER TABLE org_invoices ADD CONSTRAINT fk_org_invoices_sku "
        "FOREIGN KEY (sku) REFERENCES sku_tiers(code) ON DELETE RESTRICT NOT VALID"
    )
    op.execute("ALTER TABLE org_invoices VALIDATE CONSTRAINT fk_org_invoices_sku")

    op.create_index("ix_subscription_requests_current_sku", "subscription_requests", ["current_sku"])
    op.execute(
        "ALTER TABLE subscription_requests ADD CONSTRAINT fk_subscription_requests_current_sku "
        "FOREIGN KEY (current_sku) REFERENCES sku_tiers(code) ON DELETE RESTRICT NOT VALID"
    )
    op.execute("ALTER TABLE subscription_requests VALIDATE CONSTRAINT fk_subscription_requests_current_sku")

    op.create_index("ix_subscription_requests_target_sku", "subscription_requests", ["target_sku"])
    op.execute(
        "ALTER TABLE subscription_requests ADD CONSTRAINT fk_subscription_requests_target_sku "
        "FOREIGN KEY (target_sku) REFERENCES sku_tiers(code) ON DELETE RESTRICT NOT VALID"
    )
    op.execute("ALTER TABLE subscription_requests VALIDATE CONSTRAINT fk_subscription_requests_target_sku")

    op.drop_constraint("ck_organization_sku", "organizations", type_="check")
    op.drop_constraint("ck_subscriptions_sku", "subscriptions", type_="check")
    op.drop_constraint("ck_sku_catalog_sku", "sku_catalog", type_="check")
    op.drop_constraint("ck_org_invoices_sku", "org_invoices", type_="check")
    op.drop_constraint("ck_subscription_request_current_sku", "subscription_requests", type_="check")
    op.drop_constraint("ck_subscription_request_target_sku", "subscription_requests", type_="check")


def downgrade() -> None:
    custom = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT code FROM sku_tiers WHERE code NOT IN ('basic', 'pro', 'multi', 'enterprise') ORDER BY code"
            )
        )
        .scalars()
        .all()
    )
    if custom:
        raise RuntimeError(
            f"Downgrade tidak didukung setelah tier kustom dibuat; hapus/nonaktifkan dulu ({', '.join(custom)})"
        )

    op.drop_constraint("fk_subscription_requests_target_sku", "subscription_requests", type_="foreignkey")
    op.drop_constraint("fk_subscription_requests_current_sku", "subscription_requests", type_="foreignkey")
    op.drop_constraint("fk_org_invoices_sku", "org_invoices", type_="foreignkey")
    op.drop_constraint("fk_subscriptions_sku", "subscriptions", type_="foreignkey")
    op.drop_constraint("fk_organization_sku", "organizations", type_="foreignkey")
    op.drop_constraint("fk_sku_catalog_sku", "sku_catalog", type_="foreignkey")

    op.drop_index("ix_subscription_requests_target_sku", table_name="subscription_requests")
    op.drop_index("ix_subscription_requests_current_sku", table_name="subscription_requests")
    op.drop_index("ix_org_invoices_sku", table_name="org_invoices")
    op.drop_index("ix_subscriptions_sku", table_name="subscriptions")
    op.drop_index("ix_organizations_sku", table_name="organizations")
    op.drop_index("ix_sku_catalog_sku", table_name="sku_catalog")

    op.create_check_constraint("ck_organization_sku", "organizations", "sku IN ('basic', 'pro', 'multi', 'enterprise')")
    op.create_check_constraint(
        "ck_subscriptions_sku", "subscriptions", "sku IN ('basic', 'pro', 'multi', 'enterprise')"
    )
    op.create_check_constraint("ck_sku_catalog_sku", "sku_catalog", "sku IN ('basic', 'pro', 'multi')")
    op.create_check_constraint("ck_org_invoices_sku", "org_invoices", "sku IN ('basic', 'pro', 'multi')")
    op.create_check_constraint(
        "ck_subscription_request_current_sku",
        "subscription_requests",
        "current_sku IN ('basic', 'pro', 'multi', 'enterprise')",
    )
    op.create_check_constraint(
        "ck_subscription_request_target_sku",
        "subscription_requests",
        "target_sku IN ('basic', 'pro', 'multi')",
    )

    op.drop_index("ix_sku_tiers_active", table_name="sku_tiers")
    op.drop_index("uq_sku_tiers_default", table_name="sku_tiers")
    op.drop_index("uq_sku_tiers_rank", table_name="sku_tiers")
    op.drop_table("sku_tiers")
