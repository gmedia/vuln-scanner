#!/usr/bin/env python3
"""On-box Host Protect helper (S10): needles/YARA walk in jail, POST JSON to SaaS.

Not a second enroll daemon. Depends wazuh-agent at package level.
CI must pass without clamscan or yara CLI.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
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
USER_AGENT = "SinexisHostProtect/1"


def _agent_headers(token: str, *, json_body: bool = False) -> dict[str, str]:
    headers = {"User-Agent": USER_AGENT, "X-Host-Agent-Token": token}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


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


def clam_binary() -> str | None:
    return shutil.which("clamdscan") or shutil.which("clamscan")


def scan_clam(root: str, timeout: int = 120) -> list[dict[str, str]]:
    binary = clam_binary()
    if binary is None:
        return []
    cmd = [binary, "--no-summary", "-r", root]
    if os.path.basename(binary) == "clamdscan":
        cmd.insert(1, "--fdpass")
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    hits: list[dict[str, str]] = []
    seen: set[str] = set()
    for line in (proc.stdout or "").splitlines():
        if not line.endswith(" FOUND"):
            continue
        left, _, sig = line.rpartition(":")
        path = left.strip()
        rule = sig.strip().removesuffix(" FOUND").strip()
        if not path.startswith(root + os.sep) and path != root:
            continue
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        if ".." in rel.split("/") or _NUL in rel:
            continue
        if rel in seen:
            continue
        seen.add(rel)
        safe_rule = re.sub(r"[^\w.\-]+", "_", rule)[:80] or "hit"
        digest = ""
        try:
            digest = _sha256_file(path)
        except OSError:
            digest = ""
        item = {
            "rel_path": rel,
            "class": "malware",
            "rule_id": f"clam.{safe_rule}",
        }
        if digest:
            item["sha256"] = digest
        hits.append(item)
    return hits


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sinexis Host Protect on-box scan helper")
    p.add_argument(
        "action",
        nargs="?",
        default="scan",
        choices=("scan", "poll", "quarantine", "restore"),
    )
    p.add_argument("--root", default="", help="Absolute web root on this VM")
    p.add_argument("--scan-id", default="")
    p.add_argument("--agent-id", default=os.environ.get("SINEXIS_AGENT_ID", ""))
    p.add_argument("--rel-path", default="")
    p.add_argument("--site-id", default="")
    p.add_argument("--hit-id", default="")
    p.add_argument("--dest-basename", default="")
    p.add_argument(
        "--quarantine-root",
        default=os.environ.get("SINEXIS_QUARANTINE_ROOT", "/var/lib/sinexis/quarantine"),
    )
    p.add_argument("--api-base", default=os.environ.get("SINEXIS_API_BASE", ""))
    p.add_argument("--token", default=os.environ.get("SINEXIS_HOST_AGENT_TOKEN", ""))
    p.add_argument("--rules-dir", default=str(DEFAULT_RULES))
    p.add_argument("--timeout", type=int, default=120)
    p.add_argument("--dry-run", action="store_true", help="Scan only; do not POST")
    p.add_argument("--json-out", default="", help="Write findings JSON to path")
    return p.parse_args(argv)


def _jail_rel(root: str, rel: str) -> str:
    rel = (rel or "").strip().lstrip("/")
    if not rel or _NUL in rel or ".." in rel.split("/"):
        raise ValueError("bad rel")
    joined = os.path.normpath(os.path.join(root, rel))
    if joined != root and not joined.startswith(root + "/"):
        raise ValueError("escape")
    return joined


def _qdir(site_id: str, qroot: str) -> str:
    root = os.path.normpath(qroot)
    if not root.startswith("/") or ".." in root.split("/"):
        raise ValueError("bad qroot")
    if any(root == p or root.startswith(p + "/") for p in ALLOWED_PREFIXES):
        raise ValueError("qroot under web")
    sid = (site_id or "").strip()
    if not re.match(r"^[\w\-]+$", sid):
        raise ValueError("bad site")
    dest = os.path.normpath(os.path.join(root, sid))
    if dest != root and not dest.startswith(root + "/"):
        raise ValueError("escape")
    return dest


def _basename_ok(name: str) -> bool:
    return bool(re.match(r"^[\w.\-]+$", name or "")) and "/" not in name


def run_quarantine(args: argparse.Namespace) -> int:
    try:
        root = validate_root_path(args.root)
        src = _jail_rel(root, args.rel_path)
        dest_dir = _qdir(args.site_id, args.quarantine_root)
        dest_bn = args.dest_basename or ""
        if not _basename_ok(dest_bn):
            raise ValueError("bad dest")
    except ValueError:
        return 2
    dest = os.path.join(dest_dir, dest_bn)
    if os.path.isfile(dest) and not os.path.isfile(src):
        return 0
    if os.path.isfile(dest) and os.path.isfile(src):
        return 6
    if not os.path.isfile(src):
        return 6
    try:
        os.makedirs(dest_dir, mode=0o700, exist_ok=True)
        os.chmod(dest_dir, 0o700)
        if os.path.lexists(dest):
            return 6
        shutil.move(src, dest)
    except OSError:
        return 6
    return 0


def run_restore(args: argparse.Namespace) -> int:
    try:
        root = validate_root_path(args.root)
        original = _jail_rel(root, args.rel_path)
        dest_dir = _qdir(args.site_id, args.quarantine_root)
        dest_bn = args.dest_basename or ""
        if not _basename_ok(dest_bn):
            raise ValueError("bad dest")
    except ValueError:
        return 2
    src = os.path.join(dest_dir, dest_bn)
    if os.path.isfile(original) and not os.path.isfile(src):
        return 0
    if os.path.isfile(original) and os.path.isfile(src):
        return 6
    if not os.path.isfile(src):
        return 6
    try:
        os.makedirs(os.path.dirname(original), exist_ok=True)
        if os.path.lexists(original):
            return 6
        shutil.move(src, original)
    except OSError:
        return 6
    return 0


def fetch_jobs(api_base: str, token: str, agent_id: str, timeout: int) -> tuple[int, list[dict[str, str]]]:
    url = api_base.rstrip("/") + "/api/host/agent/jobs?agent_id=" + urllib.parse.quote(agent_id)
    req = urllib.request.Request(
        url,
        method="GET",
        headers=_agent_headers(token),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError):
        return 0, []
    jobs = body.get("jobs") if isinstance(body, dict) else None
    if not isinstance(jobs, list):
        return 0, []
    out: list[dict[str, str]] = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        kind = str(job.get("kind") or "scan")
        root = str(job.get("root_path") or "")
        if kind == "scan":
            scan_id = str(job.get("scan_id") or "")
            if scan_id and root:
                out.append({"kind": "scan", "scan_id": scan_id, "root_path": root})
        elif kind in ("quarantine", "restore"):
            command_id = str(job.get("command_id") or "")
            rel_path = str(job.get("rel_path") or "")
            dest_basename = str(job.get("dest_basename") or "")
            site_id = str(job.get("site_id") or "")
            if command_id and root and rel_path and dest_basename and site_id:
                out.append(
                    {
                        "kind": kind,
                        "command_id": command_id,
                        "root_path": root,
                        "rel_path": rel_path,
                        "dest_basename": dest_basename,
                        "site_id": site_id,
                    }
                )
            elif command_id:
                post_command_ack(api_base, token, agent_id, command_id, False, "incomplete job", timeout)
    return len(jobs), out


_WAF_ID_RE = re.compile(r'\[id\s+"(\d+)"\]')
_WAF_REQ_RE = re.compile(r"^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)", re.MULTILINE)
_MAX_WAF_EVENTS = 100


def parse_modsec_audit_events(text: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    stripped = (text or "").strip()
    if not stripped:
        return events
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            parsed = None
        rows = parsed if isinstance(parsed, list) else ([parsed] if isinstance(parsed, dict) else [])
        for row in rows:
            if not isinstance(row, dict):
                continue
            txn = row.get("transaction") if isinstance(row.get("transaction"), dict) else {}
            req = txn.get("request") if isinstance(txn.get("request"), dict) else {}
            resp = txn.get("response") if isinstance(txn.get("response"), dict) else {}
            msgs = row.get("messages") if isinstance(row.get("messages"), list) else []
            rule_id = "unknown"
            for msg in msgs:
                if not isinstance(msg, dict):
                    continue
                details = msg.get("details") if isinstance(msg.get("details"), dict) else {}
                rid = details.get("ruleId") or details.get("id")
                if rid:
                    rule_id = str(rid)[:128]
                    break
            method = str(req.get("method") or "GET").upper()
            path = str(req.get("uri") or req.get("uri_no_query") or "/")
            path = path.split("?", 1)[0][:256] or "/"
            status_code = resp.get("http_code") or resp.get("status")
            http_status = int(status_code) if isinstance(status_code, int) else None
            action = "block" if http_status == 403 else "log"
            events.append(
                {
                    "action": action,
                    "rule_id": rule_id[:128],
                    "method": method[:8],
                    "path": path,
                    "http_status": http_status,
                }
            )
            if len(events) >= _MAX_WAF_EVENTS:
                break
        return events
    for chunk in re.split(r"\n--[A-Za-z0-9]+--[A-Z]--\n", text):
        ids = _WAF_ID_RE.findall(chunk)
        req_m = _WAF_REQ_RE.search(chunk)
        if not ids and not req_m:
            continue
        method = (req_m.group(1) if req_m else "GET").upper()
        raw_path = req_m.group(2) if req_m else "/"
        path = raw_path.split("?", 1)[0][:256] or "/"
        http_status = 403 if "403" in chunk or "Intercepted" in chunk else None
        events.append(
            {
                "action": "block" if http_status == 403 else "log",
                "rule_id": (ids[0] if ids else "unknown")[:128],
                "method": method[:8],
                "path": path,
                "http_status": http_status,
            }
        )
        if len(events) >= _MAX_WAF_EVENTS:
            break
    return events


def _waf_cursor_path(agent_id: str) -> str:
    safe = re.sub(r"[^0-9a-fA-F-]", "_", agent_id)[:80] or "agent"
    lock_dir = os.environ.get("SINEXIS_POLL_LOCK_DIR", "/var/lib/sinexis")
    return os.path.join(lock_dir, f"waf-audit-{safe}.cursor")


def read_new_audit_text(path: str, agent_id: str) -> str:
    if not path or not os.path.isfile(path):
        return ""
    cursor_path = _waf_cursor_path(agent_id)
    offset = 0
    try:
        with open(cursor_path, encoding="utf-8") as fh:
            offset = int(fh.read().strip() or "0")
    except (OSError, ValueError):
        offset = 0
    try:
        size = os.path.getsize(path)
        if offset > size:
            offset = 0
        with open(path, "rb") as fh:
            fh.seek(offset)
            data = fh.read()
        new_offset = offset + len(data)
        os.makedirs(os.path.dirname(cursor_path), mode=0o700, exist_ok=True)
        with open(cursor_path, "w", encoding="utf-8") as fh:
            fh.write(str(new_offset))
        return data.decode("utf-8", errors="replace")
    except OSError:
        return ""


def post_waf_events(api_base: str, token: str, payload: dict[str, object], timeout: int) -> int:
    url = api_base.rstrip("/") + "/api/host/agent/waf-events"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers=_agent_headers(token, json_body=True),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except (urllib.error.URLError, OSError):
        return 5


def maybe_post_waf_events(args: argparse.Namespace) -> None:
    site_id = (os.environ.get("SINEXIS_WAF_SITE_ID") or "").strip()
    audit = (os.environ.get("SINEXIS_WAF_AUDIT_LOG") or "/var/log/modsec_audit.log").strip()
    if not site_id or not args.api_base or not args.token or not args.agent_id:
        return
    text = read_new_audit_text(audit, args.agent_id)
    events = parse_modsec_audit_events(text)
    if not events:
        return
    post_waf_events(
        args.api_base,
        args.token,
        {"agent_id": args.agent_id, "site_id": site_id, "events": events},
        args.timeout,
    )


def post_results(api_base: str, token: str, payload: dict[str, object], timeout: int) -> int:
    url = api_base.rstrip("/") + "/api/host/agent/results"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers=_agent_headers(token, json_body=True),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as exc:
        return int(exc.code)


def post_command_ack(
    api_base: str, token: str, agent_id: str, command_id: str, ok: bool, error: str, timeout: int
) -> int:
    url = api_base.rstrip("/") + "/api/host/agent/commands/ack"
    payload = {"command_id": command_id, "agent_id": agent_id, "ok": ok, "error": error or None}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers=_agent_headers(token, json_body=True),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return int(getattr(resp, "status", 200) or 200)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except (urllib.error.URLError, OSError):
        return 5


def _poll_lock_path(agent_id: str) -> str:
    safe = re.sub(r"[^0-9a-fA-F-]", "_", agent_id)[:80] or "agent"
    lock_dir = os.environ.get("SINEXIS_POLL_LOCK_DIR", "/var/lib/sinexis")
    return os.path.join(lock_dir, f"host-protect-poll-{safe}.lock")


def run_poll(args: argparse.Namespace) -> int:
    if not args.api_base or not args.token or not args.agent_id:
        return 4
    fetch_jobs(args.api_base, args.token, args.agent_id, args.timeout)
    lock_path = _poll_lock_path(args.agent_id)
    try:
        os.makedirs(os.path.dirname(lock_path), mode=0o700, exist_ok=True)
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    except OSError:
        lock_fd = None
    if lock_fd is not None:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(lock_fd)
            return 0
    try:
        deadline = time.monotonic() + 90
        for _ in range(40):
            n_raw, _rc = _run_poll_jobs(args)
            if n_raw < 5 or time.monotonic() >= deadline:
                break
        maybe_post_waf_events(args)
        return 0
    finally:
        if lock_fd is not None:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_UN)
            except OSError:
                pass
            os.close(lock_fd)


def _run_poll_jobs(args: argparse.Namespace) -> tuple[int, int]:
    n_raw, jobs = fetch_jobs(args.api_base, args.token, args.agent_id, args.timeout)
    jobs.sort(key=lambda j: 0 if (j.get("kind") or "") in ("quarantine", "restore") else 1)
    worst = 0
    for job in jobs:
        kind = job.get("kind") or "scan"
        if kind == "scan":
            rc = run(
                [
                    "scan",
                    "--root",
                    job["root_path"],
                    "--scan-id",
                    job["scan_id"],
                    "--agent-id",
                    args.agent_id,
                    "--api-base",
                    args.api_base,
                    "--token",
                    args.token,
                    "--rules-dir",
                    args.rules_dir,
                    "--timeout",
                    str(args.timeout),
                ]
            )
        else:
            argv = [
                kind,
                "--root",
                job["root_path"],
                "--rel-path",
                job["rel_path"],
                "--site-id",
                job["site_id"],
                "--dest-basename",
                job["dest_basename"],
                "--quarantine-root",
                args.quarantine_root,
            ]
            rc = run(argv)
            ack_ok = rc == 0
            err = "" if ack_ok else f"helper exit {rc}"
            post_command_ack(
                args.api_base, args.token, args.agent_id, job["command_id"], ack_ok, err, args.timeout
            )
        if rc != 0:
            worst = rc
    return n_raw, worst


def run(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.action == "quarantine":
        return run_quarantine(args)
    if args.action == "restore":
        return run_restore(args)
    if args.action == "poll":
        return run_poll(args)
    if not args.scan_id or not args.agent_id:
        return 4
    try:
        root = validate_root_path(args.root)
    except ValueError:
        return 2
    if not os.path.isdir(root):
        return 3
    pack = load_signature_pack(Path(args.rules_dir))
    findings = scan_needles(root, pack)
    engine = "yara" if yara_available() else "needles"
    clam_hits = scan_clam(root, args.timeout)
    payload = {
        "scan_id": args.scan_id,
        "agent_id": args.agent_id,
        "engine": engine,
        "findings": findings,
    }
    clam_payload = {
        "scan_id": args.scan_id,
        "agent_id": args.agent_id,
        "engine": "clam",
        "findings": clam_hits,
    }
    if args.json_out:
        dump = dict(payload)
        if clam_hits:
            dump["clam_findings"] = clam_hits
        Path(args.json_out).write_text(json.dumps(dump), encoding="utf-8")
    if args.dry_run:
        return 0
    if not args.api_base or not args.token:
        return 4
    status = post_results(args.api_base, args.token, payload, args.timeout)
    if status >= 400:
        return 5
    if clam_hits:
        cstatus = post_results(args.api_base, args.token, clam_payload, args.timeout)
        if cstatus >= 400:
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
