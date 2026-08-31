from __future__ import annotations

import os
import posixpath
import re

ALLOWED_PREFIXES = ("/var/www", "/srv/www", "/home")
DEFAULT_QUARANTINE_ROOT = "/var/lib/sinexis/quarantine"
_NUL = "\x00"
_PATH_CHARS = re.compile(r"^[\w./\-]+$")
_SITE_ID = re.compile(r"^[\w\-]+$")
_BASENAME = re.compile(r"^[\w.\-]+$")


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
    normalized = posixpath.normpath(path)
    if ".." in normalized.split("/"):
        raise ValueError("path traversal is not allowed")
    if not any(normalized == p or normalized.startswith(p + "/") for p in ALLOWED_PREFIXES):
        raise ValueError("root_path is outside the allowlist")
    return normalized


def jail_rel_path(root_path: str, rel_path: str) -> str:
    root = validate_root_path(root_path)
    rel = (rel_path or "").strip().lstrip("/")
    if not rel or _NUL in rel:
        raise ValueError("Invalid relative path")
    if ".." in rel.split("/") or ".." in rel:
        raise ValueError("path traversal is not allowed")
    if not _PATH_CHARS.match(rel):
        raise ValueError("relative path contains invalid characters")
    joined = posixpath.normpath(posixpath.join(root, rel))
    if joined != root and not joined.startswith(root + "/"):
        raise ValueError("path escapes site root")
    if ".." in joined.split("/"):
        raise ValueError("path traversal is not allowed")
    return joined


def quarantine_basename(hit_id: str, rel_path: str) -> str:
    leaf = posixpath.basename(rel_path.strip()) or "file"
    safe = re.sub(r"[^\w.\-]+", "_", leaf)[:80]
    return f"{hit_id[:8]}_{safe}"


def quarantine_dir(site_id: str, *, base: str | None = None) -> str:
    root = posixpath.normpath((base or DEFAULT_QUARANTINE_ROOT).strip() or DEFAULT_QUARANTINE_ROOT)
    if not root.startswith("/") or ".." in root.split("/"):
        raise ValueError("invalid quarantine root")
    sid = str(site_id).strip()
    if not _SITE_ID.match(sid):
        raise ValueError("invalid site id")
    dest = posixpath.normpath(posixpath.join(root, sid))
    if dest != root and not dest.startswith(root + "/"):
        raise ValueError("quarantine path escapes")
    if any(dest == p or dest.startswith(p + "/") for p in ALLOWED_PREFIXES):
        raise ValueError("quarantine must not sit under a web root")
    return dest


def move_to_quarantine(src: str, dest_dir: str, dest_basename: str) -> str:
    if not _BASENAME.match(dest_basename) or "/" in dest_basename:
        raise ValueError("invalid dest_basename")
    if not os.path.isfile(src):
        raise OSError("source file missing")
    os.makedirs(dest_dir, mode=0o700, exist_ok=True)
    os.chmod(dest_dir, 0o700)
    dest = os.path.join(dest_dir, dest_basename)
    if os.path.lexists(dest):
        raise OSError("quarantine dest exists")
    os.rename(src, dest)
    return dest


def restore_from_quarantine(dest_dir: str, dest_basename: str, original: str) -> None:
    if not _BASENAME.match(dest_basename) or "/" in dest_basename:
        raise ValueError("invalid dest_basename")
    src = os.path.join(dest_dir, dest_basename)
    if not os.path.isfile(src):
        raise OSError("quarantine file missing")
    parent = os.path.dirname(original)
    os.makedirs(parent, exist_ok=True)
    if os.path.lexists(original):
        raise OSError("restore target exists")
    os.rename(src, original)
