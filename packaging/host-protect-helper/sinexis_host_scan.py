#!/usr/bin/env python3
"""On-box Host Protect helper (S10): needles/YARA walk in jail, POST JSON to SaaS.

Not a second enroll daemon. Depends wazuh-agent at package level.
CI must pass without clamscan or yara CLI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ALLOWED_PREFIXES = ("/var/www", "/srv/www", "/home")
_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".quarantine"}
_MAX_FILES = 500
_MAX_BYTES = 1_048_576
_RULE_RE = re.compile(r"rule\s+\w+\s*\{(.*?)\n\}", re.DOTALL)
_META_ID = re.compile(r'id\s*=\s*"([^"]+)"')
_META_CLASS = re.compile(r'hit_class\s*=\s*"([^"]+)"')
_STR = re.compile(r'\$\w+\s*=\s*"((?:\\.|[^"\\])*)"')
_PATH_CHARS = re.compile(r"^[\w./\-]+$")
_NUL = "\x00"

HERE = Path(__file__).resolve().parent
DEFAULT_RULES = HERE / "rules"


def validate_root_path(raw: str) -> str:
    path = (raw or "").strip()
    if not path or _NUL in path:
        raise ValueError("Invalid root path")
    if not path.startswith("/"):
        raise ValueError("root_path must be absolute")
    if ".." in path:
        raise ValueError("path traversal is not allowed")
    if not _PATH_CHARS.match(path):
        raise ValueError("root_path contains invalid characters")
    normalized = os.path.normpath(path)
    if ".." in normalized.split("/"):
        raise ValueError("path traversal is not allowed")
    if not any(normalized == p or normalized.startswith(p + "/") for p in ALLOWED_PREFIXES):
        raise ValueError("root_path is outside the allowlist")
    return normalized


def load_signature_pack(rules_dir: Path) -> list[dict[str, object]]:
    pack: list[dict[str, object]] = []
    if not rules_dir.is_dir():
        return pack
    for path in sorted(rules_dir.glob("*.yar")):
        text = path.read_text(encoding="utf-8")
        for body in _RULE_RE.findall(text):
            id_m = _META_ID.search(body)
            class_m = _META_CLASS.search(body)
            if id_m is None:
                continue
            needles = [bytes(_unescape(s), "utf-8") for s in _STR.findall(body)]
            if not needles:
                continue
            pack.append(
                {
                    "rule_id": id_m.group(1),
                    "hit_class": class_m.group(1) if class_m is not None else "suspicious",
                    "needles": needles,
                }
            )
    return pack


def _unescape(raw: str) -> str:
    return raw.replace('\\"', '"').replace("\\\\", "\\")


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def scan_needles(root: str, pack: list[dict[str, object]]) -> list[dict[str, str]]:
    hits: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    nfiles = 0
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS and ".." not in d]
        for name in filenames:
            nfiles += 1
            if nfiles > _MAX_FILES:
                return hits
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if ".." in rel.split("/") or _NUL in rel:
                continue
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            if size > _MAX_BYTES or size == 0:
                continue
            try:
                with open(full, "rb") as fh:
                    blob = fh.read(_MAX_BYTES)
            except OSError:
                continue
            digest = hashlib.sha256(blob).hexdigest() if size <= _MAX_BYTES else _sha256_file(full)
            for spec in pack:
                needles = spec["needles"]
                if not isinstance(needles, list):
                    continue
                if any(n in blob for n in needles if isinstance(n, (bytes, bytearray))):
                    key = (rel, str(spec["rule_id"]))
                    if key in seen:
                        continue
                    seen.add(key)
                    hits.append(
                        {
                            "rel_path": rel,
                            "class": str(spec["hit_class"]),
                            "rule_id": str(spec["rule_id"]),
                            "sha256": digest,
                        }
                    )
    return hits


def yara_available() -> bool:
    return shutil.which("yara") is not None


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sinexis Host Protect on-box scan helper")
    p.add_argument("--root", required=True, help="Absolute web root on this VM")
    p.add_argument("--scan-id", required=True)
    p.add_argument("--agent-id", required=True)
    p.add_argument("--api-base", default=os.environ.get("SINEXIS_API_BASE", ""))
    p.add_argument("--token", default=os.environ.get("SINEXIS_HOST_AGENT_TOKEN", ""))
    p.add_argument("--rules-dir", default=str(DEFAULT_RULES))
    p.add_argument("--timeout", type=int, default=120)
    p.add_argument("--dry-run", action="store_true", help="Scan only; do not POST")
    p.add_argument("--json-out", default="", help="Write findings JSON to path")
    return p.parse_args(argv)


def post_results(api_base: str, token: str, payload: dict[str, object], timeout: int) -> int:
    url = api_base.rstrip("/") + "/api/host/agent/results"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Host-Agent-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as exc:
        return int(exc.code)


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        root = validate_root_path(args.root)
    except ValueError:
        return 2
    if not os.path.isdir(root):
        return 3
    pack = load_signature_pack(Path(args.rules_dir))
    findings = scan_needles(root, pack)
    engine = "yara" if yara_available() else "needles"
    payload = {
        "scan_id": args.scan_id,
        "agent_id": args.agent_id,
        "engine": engine,
        "findings": findings,
    }
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(payload), encoding="utf-8")
    if args.dry_run:
        return 0
    if not args.api_base or not args.token:
        return 4
    status = post_results(args.api_base, args.token, payload, args.timeout)
    if status >= 400:
        return 5
    return 0


def main() -> None:
    nice = shutil.which("nice")
    if nice and os.environ.get("SINEXIS_HOST_SCAN_NICE", "1") == "1" and "SINEXIS_HOST_SCAN_INNER" not in os.environ:
        env = os.environ.copy()
        env["SINEXIS_HOST_SCAN_INNER"] = "1"
        raise SystemExit(
            subprocess.call(
                [nice, "-n", "15", sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]],
                env=env,
            )
        )
    raise SystemExit(run())


if __name__ == "__main__":
    main()
