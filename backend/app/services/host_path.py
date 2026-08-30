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
