"""
Blog seed importer.

`docs/content/blog/*.md` is the editorial source of truth; live copy lives in the
`blog_posts` table. This script copies the markdown into that table so the work
in S1/S3 (pillar grouping, meta description, JSON-LD) has something to render.

Safe by default:

- every new row is created as **draft** (nothing appears on the public site)
- an existing slug is **skipped**, never overwritten
- `--update` refreshes title/excerpt/body/pillar but preserves `status` and
  `published_at`, so it cannot publish or unpublish by accident
- `--dry-run` prints the plan and writes nothing

Usage (from `backend/`, after `alembic upgrade head`):

    python -m scripts.seed_blog_posts --dry-run
    python -m scripts.seed_blog_posts                  # create drafts
    python -m scripts.seed_blog_posts --update         # refresh drafts in place
    python -m scripts.seed_blog_posts --publish        # create AND publish

Publishing on a fresh database is the documented path when the copy has already
been reviewed; the default stays draft so an import never silently goes live.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.blog import BlogPost
from app.services.blog import (
    BlogValidationError,
    plain_excerpt,
    render_body_html,
    validate_slug,
)

# Repo root: backend/scripts/seed_blog_posts.py -> parents[2]
BLOG_DIR = Path(__file__).resolve().parents[2] / "docs" / "content" / "blog"

# Pillar per slug, mirroring docs/content/blog/README.md.
# Kept explicit (not derived from the files) so an unknown slug fails loudly
# instead of landing under "More" by accident.
PILLAR_BY_SLUG: dict[str, str] = {
    "apa-itu-sinexis": "exposure",
    "scan-domain-website": "exposure",
    "scan-ip-server": "exposure",
    "jadwal-scan-attach": "exposure",
    "kredit-dan-paket": "exposure",
    "aset-dan-workspace": "exposure",
    "uptime-situs-nyala": "availability",
    "guard-dan-siem": "onbox",
}

TITLE_MAX = 255
EXCERPT_MAX = 2000

_H1_RE = re.compile(r"^\s*#\s+(?P<title>.+?)\s*$")
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_TOKEN_RE = re.compile(r"[*_`>#]+")


@dataclass(frozen=True)
class SeedPost:
    slug: str
    title: str
    excerpt: str
    body_md: str
    pillar: str | None
    path: Path


def split_title(body: str) -> tuple[str, str]:
    """Return (title, body_without_leading_h1).

    The renderer strips a leading `#` heading anyway; removing it here keeps
    `body_md` stored the same way an admin-created post looks.
    """
    lines = body.splitlines()
    for index, line in enumerate(lines):
        match = _H1_RE.match(line)
        if match:
            title = match.group("title").strip()
            rest = "\n".join(lines[index + 1 :]).lstrip("\n")
            return title, rest
    return "", body.strip()


def first_paragraph(body_md: str) -> str:
    """First prose paragraph, skipping headings, lists, quotes and code fences."""
    in_fence = False
    paragraph: list[str] = []
    for raw in body_md.splitlines():
        line = raw.strip()
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not line:
            if paragraph:
                break
            continue
        if line.startswith(("#", "-", "*", ">", "|")) or re.match(r"^\d+\.\s", line):
            if paragraph:
                break
            continue
        paragraph.append(line)
    return " ".join(paragraph)


def build_excerpt(body_md: str) -> str:
    text = _MD_LINK_RE.sub(r"\1", first_paragraph(body_md))
    text = _MD_TOKEN_RE.sub("", text)
    return plain_excerpt(text, max_len=280)


def load_posts(blog_dir: Path = BLOG_DIR) -> list[SeedPost]:
    if not blog_dir.is_dir():
        raise SystemExit(f"blog source directory not found: {blog_dir}")

    posts: list[SeedPost] = []
    for path in sorted(blog_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        slug = path.stem.lower()
        try:
            slug = validate_slug(slug)
        except BlogValidationError as exc:
            raise SystemExit(f"{path.name}: {exc}") from exc

        title, body_md = split_title(path.read_text(encoding="utf-8"))
        if not title:
            raise SystemExit(f"{path.name}: no leading '# Title' heading")
        if len(title) > TITLE_MAX:
            raise SystemExit(f"{path.name}: title is {len(title)} chars (max {TITLE_MAX})")
        if not body_md.strip():
            raise SystemExit(f"{path.name}: empty body")

        excerpt = build_excerpt(body_md)
        if not excerpt:
            raise SystemExit(f"{path.name}: could not derive an excerpt")
        if len(excerpt) > EXCERPT_MAX:
            raise SystemExit(f"{path.name}: excerpt is {len(excerpt)} chars (max {EXCERPT_MAX})")

        # Raises on markdown images, matching what the admin API rejects.
        try:
            render_body_html(body_md)
        except BlogValidationError as exc:
            raise SystemExit(f"{path.name}: {exc}") from exc

        if slug not in PILLAR_BY_SLUG:
            raise SystemExit(
                f"{path.name}: slug '{slug}' has no pillar in PILLAR_BY_SLUG "
                "(add it to PILLAR_BY_SLUG and docs/content/blog/README.md)"
            )

        posts.append(
            SeedPost(
                slug=slug,
                title=title,
                excerpt=excerpt,
                body_md=body_md,
                pillar=PILLAR_BY_SLUG[slug],
                path=path,
            )
        )
    return posts


async def import_posts(
    posts: list[SeedPost],
    *,
    dry_run: bool,
    publish: bool,
    update: bool,
) -> int:
    """Create/refresh rows. Returns the process exit code."""
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    created = skipped = updated = 0
    try:
        async with session_factory() as session:
            existing = {
                row.slug: row
                for row in (await session.execute(select(BlogPost))).scalars().all()
            }

            for post in posts:
                current = existing.get(post.slug)
                body_html = render_body_html(post.body_md)

                if current is None:
                    created += 1
                    new_status = "published" if publish else "draft"
                    print(f"  create  {post.slug:<24} pillar={post.pillar} status={new_status}")
                    if dry_run:
                        continue
                    now = datetime.now(UTC)
                    session.add(
                        BlogPost(
                            slug=post.slug,
                            title=post.title,
                            excerpt=post.excerpt,
                            body_md=post.body_md,
                            body_html=body_html,
                            locale="id",
                            status="published" if publish else "draft",
                            pillar=post.pillar,
                            published_at=now if publish else None,
                            created_at=now,
                            updated_at=now,
                        )
                    )
                    continue

                if not update:
                    skipped += 1
                    print(
                        f"  skip    {post.slug:<24} already exists "
                        f"(status={current.status}); use --update to refresh"
                    )
                    continue

                updated += 1
                print(
                    f"  update  {post.slug:<24} pillar={post.pillar} "
                    f"status={current.status} (preserved)"
                )
                if dry_run:
                    continue
                current.title = post.title
                current.excerpt = post.excerpt
                current.body_md = post.body_md
                current.body_html = body_html
                current.pillar = post.pillar
                current.updated_at = datetime.now(UTC)

            if dry_run:
                await session.rollback()
            else:
                await session.commit()
    finally:
        await engine.dispose()

    verb = "would create/update" if dry_run else "created/updated"
    print(
        f"\n{verb}: created={created} updated={updated} skipped={skipped} "
        f"({'dry run — nothing written' if dry_run else 'committed'})"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import docs/content/blog/*.md into blog_posts.")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="publish newly created posts (existing rows are never republished)",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="refresh title/excerpt/body/pillar of existing rows; status and published_at are preserved",
    )
    parser.add_argument("--only", metavar="SLUG", help="limit to a single slug")
    parser.add_argument("--dir", metavar="PATH", default=str(BLOG_DIR), help="blog source directory")
    args = parser.parse_args(argv)

    posts = load_posts(Path(args.dir))
    if args.only:
        posts = [p for p in posts if p.slug == args.only]
        if not posts:
            print(f"no seed post found for slug '{args.only}'", file=sys.stderr)
            return 1

    if not settings.blog_enabled:
        print(
            "warning: BLOG_ENABLED is false — rows will be imported but /blog stays hidden.",
            file=sys.stderr,
        )

    print(f"source: {args.dir} ({len(posts)} post(s))")
    return asyncio.run(
        import_posts(posts, dry_run=args.dry_run, publish=args.publish, update=args.update)
    )


if __name__ == "__main__":
    raise SystemExit(main())
