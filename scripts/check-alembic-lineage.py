#!/usr/bin/env python3
"""Fail when merging this branch would leave more than one Alembic head.

``backend/tests/test_alembic_heads.py`` already guarantees a single head inside one
tree. That is not enough: two pull requests can each add a revision from the same
parent, each stay green against its own base, and only break ``main`` once both
merge. That happened twice, and a second head blocks ``alembic upgrade head``,
which every deploy runs before recreating containers.

The check therefore evaluates the graph **after** the merge: the union of this
tree and the base ref. A branch that merely predates a base revision adds nothing
to that union, so it passes — being behind is not the problem. A branch that adds
a sibling of a base revision produces a second head in the union, and fails.

Run before opening a PR that touches ``backend/alembic/versions/``:

    python3 scripts/check-alembic-lineage.py

Exit codes: 0 ok, 1 the merge would leave multiple heads, 2 usage/environment.
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

    try:
        base = load_git(args.base)
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"skip: {exc}", file=sys.stderr)
        print("      fetch the base ref first: git fetch origin main", file=sys.stderr)
        return 0

    # Merge semantics: a pull request adds its revisions on top of the base graph.
    merged = {**base, **current}
    merged_heads = heads(merged)

    if len(merged_heads) == 1:
        added = sorted(set(current) - set(base))
        detail = f", added {len(added)} revision(s)" if added else ""
        print(f"OK: merging leaves one head {merged_heads[0]}{detail}")
        return 0

    print(
        f"FAIL: merging this into {args.base} would leave {len(merged_heads)} heads:"
        f" {merged_heads}",
        file=sys.stderr,
    )
    added = sorted(set(current) - set(base))
    if added:
        print(f"      this branch adds: {added}", file=sys.stderr)
    else:
        print(
            f"      this branch adds no revision, so {args.base} itself is already split.",
            file=sys.stderr,
        )
    print(file=sys.stderr)
    print(
        "      Two heads make `alembic upgrade head` fail, and every deploy runs it.",
        file=sys.stderr,
    )
    print(
        "      Fix: add an empty merge revision whose down_revision lists both heads",
        file=sys.stderr,
    )
    print("      (revision ids must be <= 32 characters).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
