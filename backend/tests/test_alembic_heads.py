from __future__ import annotations

import re
from pathlib import Path


def test_alembic_has_single_head() -> None:
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    revs: dict[str, str] = {}
    pointed: set[str] = set()
    for path in versions.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        match = re.search(r"^revision:\s*str\s*=\s*[\"']([^\"']+)", text, re.M)
        down = re.search(r"^down_revision:.*=\s*(.+)$", text, re.M)
        if not match:
            continue
        rid = match.group(1)
        revs[rid] = path.name
        ids = re.findall(r"[\"']([^\"']+)[\"']", down.group(1) if down else "")
        pointed.update(ids)
    heads = sorted(k for k in revs if k not in pointed)
    assert len(heads) == 1, f"multiple Alembic heads: {heads}"


def test_revision_ids_fit_alembic_version_column() -> None:
    """``alembic_version.version_num`` is varchar(32).

    A longer revision id makes ``alembic upgrade head`` fail at runtime with
    ``StringDataRightTruncation`` — after every earlier migration has already
    run. This guard keeps that failure out of deploy/e2e.
    """
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    too_long: list[tuple[str, int]] = []
    for path in versions.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        match = re.search(r"^revision:\s*str\s*=\s*[\"']([^\"']+)", text, re.M)
        if not match:
            continue
        rid = match.group(1)
        if len(rid) > 32:
            too_long.append((rid, len(rid)))
    assert not too_long, f"revision ids exceed varchar(32): {too_long}"
