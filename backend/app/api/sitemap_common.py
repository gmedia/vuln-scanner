from __future__ import annotations

from datetime import UTC, datetime


def lastmod_tag(value: datetime | None) -> str:
    """W3C datetime for `<lastmod>`, or nothing when the date is unknown.

    Only real modification timestamps are emitted. Inventing a date (e.g. build
    time) would change on every deploy without the content changing, and Google
    starts ignoring a `lastmod` it cannot trust.
    """
    if value is None:
        return ""
    stamp = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return f"\n    <lastmod>{stamp.isoformat()}</lastmod>"
