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
