#!/usr/bin/env python3
"""Fail when an Alembic revision does not descend from the base branch's head.

``backend/tests/test_alembic_heads.py`` already guarantees a single head inside one
tree. That is not enough: two pull requests can each add a revision from the same
parent, each stay green against its own base, and only break ``main`` once both
merge. That happened twice — #1177 vs the SKU audit trail, then this scripted guard.

Run before opening a PR that touches ``backend/alembic/versions/``:

    python3 scripts/check-alembic-lineage.py

Exit codes: 0 ok, 1 lineage problem, 2 usage/environment problem.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

VERSIONS = Path("backend/alembic/versions")
REVISION = re.compile(r"^revision:\s*str\s*=\s*[\"']([^\"']+)", re.MULTILINE)
DOWN = re.compile(r"^down_revision:.*=\s*(.+)$", re.MULTILINE)
MAX_ID = 32


def parse(text: str) -> tuple[str, list[str]] | None:
    match = REVISION.search(text)
    if not match:
        return None
    down = DOWN.search(text)
    parents = re.findall(r"[\"']([^\"']+)[\"']", down.group(1)) if down else []
    return match.group(1), parents


def load_tree() -> dict[str, list[str]]:
    graph: dict[str, list[str]] = {}
    for path in sorted(VERSIONS.glob("*.py")):
        parsed = parse(path.read_text(encoding="utf-8"))
        if parsed:
            graph[parsed[0]] = parsed[1]
    return graph


def load_git(ref: str) -> dict[str, list[str]]:
    listing = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", ref, str(VERSIONS)],
        capture_output=True,
        text=True,
        check=False,
    )
    if listing.returncode != 0:
        raise RuntimeError(f"cannot read {ref}: {listing.stderr.strip()}")
    graph: dict[str, list[str]] = {}
    for name in listing.stdout.splitlines():
        if not name.endswith(".py"):
            continue
        blob = subprocess.run(
            ["git", "show", f"{ref}:{name}"],
            capture_output=True,
            text=True,
            check=False,
        )
        if blob.returncode != 0:
            continue
        parsed = parse(blob.stdout)
        if parsed:
            graph[parsed[0]] = parsed[1]
    return graph


def heads(graph: dict[str, list[str]]) -> list[str]:
    pointed = {parent for parents in graph.values() for parent in parents}
    return sorted(revision for revision in graph if revision not in pointed)


def ancestry(graph: dict[str, list[str]], head: str) -> set[str]:
    seen: set[str] = set()
    stack = [head]
    while stack:
        revision = stack.pop()
        if revision in seen or revision not in graph:
            continue
        seen.add(revision)
        stack.extend(graph[revision])
    return seen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/main", help="ref to compare against")
    args = parser.parse_args()

    if not VERSIONS.is_dir():
        print(f"error: run from the repo root ({VERSIONS} not found)", file=sys.stderr)
        return 2

    current = load_tree()
    if not current:
        print("error: no revisions parsed", file=sys.stderr)
        return 2

    too_long = sorted(rid for rid in current if len(rid) > MAX_ID)
    if too_long:
        print(
            f"FAIL: revision ids exceed varchar({MAX_ID}): {too_long}", file=sys.stderr
        )
        return 1

    current_heads = heads(current)
    if len(current_heads) != 1:
        print(f"FAIL: multiple heads in this tree: {current_heads}", file=sys.stderr)
        print(
            "      add an empty merge revision, or fix unrelated branches.",
            file=sys.stderr,
        )
        return 1

    try:
        base = load_git(args.base)
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"skip: {exc}", file=sys.stderr)
        print("      fetch the base ref first: git fetch origin main", file=sys.stderr)
        return 0

    base_heads = heads(base)
    reached = ancestry(current, current_heads[0])
    missing = [head for head in base_heads if head not in reached]
    if missing:
        print(
            f"FAIL: {args.base} has head(s) this branch does not descend from:",
            file=sys.stderr,
        )
        for head in missing:
            print(f"        {head}", file=sys.stderr)
        print(file=sys.stderr)
        print(
            "      Merging this as-is leaves two heads on the target branch and",
            file=sys.stderr,
        )
        print(
            "      blocks `alembic upgrade head`, which every deploy runs.",
            file=sys.stderr,
        )
        print(
            "      Fix: rebase onto the base, then add an empty merge revision that",
            file=sys.stderr,
        )
        print(
            "      lists both heads in down_revision (ids must be <= 32 chars).",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: single head {current_heads[0]}, descends from {len(base_heads)} {args.base} head(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
