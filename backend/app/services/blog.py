from __future__ import annotations

import html
import re
from datetime import UTC, datetime
from typing import Any

import bleach
import markdown

from app.models.blog import SLUG_MAX

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")

ALLOWED_TAGS = [
    "p",
    "br",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "hr",
]
ALLOWED_ATTRS = {"a": ["href", "title", "rel"]}
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


class BlogValidationError(ValueError):
    pass


def validate_slug(slug: str) -> str:
    s = slug.strip().lower()
    if not s or len(s) > SLUG_MAX or not SLUG_RE.match(s):
        raise BlogValidationError("Invalid slug")
    return s


def reject_markdown_images(body_md: str) -> None:
    if MD_IMAGE_RE.search(body_md):
        raise BlogValidationError("Images are not allowed in blog markdown")


def render_body_html(body_md: str) -> str:
    reject_markdown_images(body_md)
    raw = markdown.markdown(
        body_md,
        extensions=["extra", "sane_lists", "nl2br"],
        output_format="html",
    )
    cleaned = bleach.clean(
        raw,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )
    callbacks: list[Any] = [_rel_nofollow]
    return bleach.linkify(cleaned, callbacks=callbacks, skip_tags=["pre", "code"])


def _rel_nofollow(attrs: dict[Any, Any], new: bool = False) -> dict[Any, Any] | None:
    del new
    href = attrs.get((None, "href"), "")
    if href.startswith(("javascript:", "data:", "vbscript:")):
        return None
    attrs[(None, "rel")] = "nofollow noopener noreferrer"
    return attrs


def is_publicly_visible(status: str, published_at: datetime | None, now: datetime | None = None) -> bool:
    if status != "published" or published_at is None:
        return False
    clock = now or datetime.now(UTC)
    pub = published_at if published_at.tzinfo else published_at.replace(tzinfo=UTC)
    return pub <= clock


def escape_text(value: str) -> str:
    return html.escape(value, quote=True)
