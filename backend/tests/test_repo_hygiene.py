"""No editor or merge leftovers may be tracked.

``backend/app/services/auth.py.bak`` sat in the tree for months: an older copy of the auth
module next to the real one, imported by nothing, invisible to ruff and mypy because it is
not a ``.py`` file. It was not a security hole — it was worse than noise, because a reader
could take it for the live implementation.

``.gitignore`` now covers these extensions, but ignore rules do not stop ``git add -f``,
``git mv`` or a file that was already tracked. This checks what is actually in the index.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

LEFTOVER = r"\.(bak|orig|rej|swp|swo|save|copy|old)$"


def _tracked_files() -> list[str]:
    try:
        probe = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        pytest.skip("git is not installed")
    if probe.returncode != 0:
        pytest.skip("not a git checkout")
    listed = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if listed.returncode != 0:
        pytest.skip(f"git ls-files failed: {listed.stderr.strip()}")
    return [name for name in listed.stdout.split("\0") if name]


def test_no_editor_or_merge_leftovers_are_tracked() -> None:
    import re

    pattern = re.compile(LEFTOVER, re.IGNORECASE)
    offenders = sorted(name for name in _tracked_files() if pattern.search(name))
    assert not offenders, (
        "stale copy tracked in git:\n  "
        + "\n  ".join(offenders)
        + "\n\nDelete it. A `.bak` of a live module is read as the current implementation "
        "and is invisible to ruff and mypy."
    )


def test_the_scan_actually_sees_the_tree() -> None:
    """A guard that silently inspects nothing is worse than no guard."""
    files = _tracked_files()
    assert len(files) > 200, f"only {len(files)} tracked files visible; the scan is broken"
    assert "backend/app/services/auth.py" in files, "expected a known file to be listed"
