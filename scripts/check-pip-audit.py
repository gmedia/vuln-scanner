#!/usr/bin/env python3
"""Dependency-audit gate for the Python side (backend + workers).

The frontend has `scripts/check-dependency-audit.mjs`; this is its Python
counterpart, so a stale pin cannot silently keep a CVE the way the npm
overrides did (see SECURITY.md).

`pip-audit` does not report severity, so **any** known vulnerability is
blocking. Accepted risks need an explicit entry in
`.github/dependency-audit-allowlist.json` with `ecosystem: "pip"`.

Usage: python3 scripts/check-pip-audit.py [requirements.txt ...]

With no arguments it audits backend/ and workers/ requirements. Explicit
paths are accepted so the gate itself can be tested.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ALLOWLIST = REPO_ROOT / ".github" / "dependency-audit-allowlist.json"
REQUIREMENTS = (
    REPO_ROOT / "backend" / "requirements.txt",
    REPO_ROOT / "workers" / "requirements.txt",
)


def read_allowlist() -> list[dict]:
    if not ALLOWLIST.exists():
        return []
    raw = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    entries = raw if isinstance(raw, list) else raw.get("entries")
    if not isinstance(entries, list):
        raise ValueError(f"{ALLOWLIST}: expected an array or {{ \"entries\": [] }}")
    return [e for e in entries if isinstance(e, dict) and (e.get("ecosystem") or "npm") == "pip"]


def _display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def run_pip_audit(requirements: Path) -> dict:
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip_audit",
            "-r",
            str(requirements),
            "-f",
            "json",
            "--progress-spinner",
            "off",
        ],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    # pip-audit exits 1 when vulnerabilities exist; the JSON is still on stdout.
    if not proc.stdout.strip():
        print(f"FAIL: pip-audit produced no JSON for {requirements}", file=sys.stderr)
        print(proc.stderr[-800:], file=sys.stderr)
        raise SystemExit(2)
    return json.loads(proc.stdout)


def main() -> int:
    try:
        allowlist = read_allowlist()
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 2

    paths = [Path(arg) for arg in sys.argv[1:]] or list(REQUIREMENTS)

    findings: list[dict] = []
    for requirements in paths:
        if not requirements.exists():
            print(f"FAIL: missing {requirements}", file=sys.stderr)
            return 2
        report = run_pip_audit(requirements)
        for dep in report.get("dependencies", []):
            for vuln in dep.get("vulns") or []:
                findings.append(
                    {
                        "package": str(dep.get("name", "")).lower(),
                        "version": dep.get("version"),
                        "id": str(vuln.get("id", "")).upper(),
                        "fix": ", ".join(vuln.get("fix_versions") or []) or "none",
                        "source": _display_path(requirements),
                    }
                )

    # pip-audit can emit the same advisory twice for one dependency; dedupe so the
    # report is readable and the counts mean something.
    deduped: dict[str, dict] = {}
    for item in findings:
        deduped.setdefault(f"{item['id']}|{item['package']}", item)
    findings = list(deduped.values())

    allowed = {f"{e.get('id', '').upper()}|{str(e.get('package', '')).lower()}" for e in allowlist}
    found = {f"{f['id']}|{f['package']}" for f in findings}

    unlisted = [f for f in findings if f"{f['id']}|{f['package']}" not in allowed]
    stale = [e for e in allowlist if f"{str(e.get('id', '')).upper()}|{str(e.get('package', '')).lower()}" not in found]

    now = datetime.now(UTC)
    expired = []
    for entry in allowlist:
        expires = entry.get("expires")
        if not expires:
            continue
        try:
            if datetime.fromisoformat(str(expires)).replace(tzinfo=UTC) < now:
                expired.append(entry)
        except ValueError:
            expired.append(entry)

    if stale:
        print("WARN: allowlist entries no longer detected (remove them):")
        for entry in stale:
            print(f"  {entry.get('package')} {entry.get('id')}")

    if expired:
        print("FAIL: allowlist entries have expired — re-review or fix:", file=sys.stderr)
        for entry in expired:
            print(f"  {entry.get('package')} {entry.get('id')} (expired {entry.get('expires')})", file=sys.stderr)

    if unlisted:
        print(f"FAIL: {len(unlisted)} unaccepted Python vulnerability(ies):", file=sys.stderr)
        for item in unlisted:
            print(f"  {item['package']}=={item['version']} — {item['id']} (fix: {item['fix']})", file=sys.stderr)
            print(f"      in {item['source']}", file=sys.stderr)
        print("", file=sys.stderr)
        print("Bump the pin, or record an accepted risk in", file=sys.stderr)
        print(f"{ALLOWLIST.relative_to(REPO_ROOT)} with ecosystem \"pip\", a reason and an expiry.", file=sys.stderr)

    if unlisted or expired:
        return 1

    print(
        f"OK: no unaccepted Python vulnerabilities "
        f"({len(paths)} requirement file(s), accepted: {len(allowlist)})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
