from __future__ import annotations

import posixpath
import re

ALLOWED_PREFIXES = ("/var/www", "/srv/www", "/home")
_NUL = "\x00"
_PATH_CHARS = re.compile(r"^[\w./\-]+$")


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
