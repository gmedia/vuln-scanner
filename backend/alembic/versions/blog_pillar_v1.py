"""Add nullable ``blog_posts.pillar`` with a fixed vocabulary.

Revision ID: blog_pillar_v1
Revises: hpp_setting_history_v1
Create Date: 2026-11-04

The blog index groups published posts by the four public pillars
(``exposure``, ``onbox``, ``availability``, ``ai``). ``NULL`` stays valid so
legacy or future posts still render (the index shows them under "More").

The backfill targets the eight seeded editorial slugs. Each statement is a
no-op when the row is absent, so fresh databases and renamed posts are safe.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "blog_pillar_v1"
down_revision: str | None = "hpp_setting_history_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL: tuple[tuple[str, str], ...] = (
    ("apa-itu-sinexis", "exposure"),
    ("scan-ip-server", "exposure"),
    ("scan-domain-website", "exposure"),
    ("jadwal-scan-attach", "exposure"),
    ("kredit-dan-paket", "exposure"),
    ("aset-dan-workspace", "exposure"),
    ("guard-dan-siem", "onbox"),
    ("uptime-situs-nyala", "availability"),
)

def upgrade() -> None:
    op.add_column("blog_posts", sa.Column("pillar", sa.String(length=32), nullable=True))
    for slug, pillar in _BACKFILL:
        op.execute(
            sa.text("UPDATE blog_posts SET pillar = :pillar WHERE slug = :slug").bindparams(
                pillar=pillar,
                slug=slug,
            )
        )
    op.create_check_constraint(
        "ck_blog_posts_pillar",
        "blog_posts",
        "pillar IS NULL OR pillar IN ('exposure', 'onbox', 'availability', 'ai')",
    )
    op.create_index("ix_blog_posts_pillar", "blog_posts", ["pillar"])

def downgrade() -> None:
    op.drop_index("ix_blog_posts_pillar", table_name="blog_posts")
    op.drop_constraint("ck_blog_posts_pillar", "blog_posts", type_="check")
    op.drop_column("blog_posts", "pillar")
