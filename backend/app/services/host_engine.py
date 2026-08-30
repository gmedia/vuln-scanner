from __future__ import annotations

import os
import re
from pathlib import Path

from app.services.host_path import jail_rel_path, validate_root_path

_RULES_DIR = Path(__file__).resolve().parent.parent / "host_protect_rules"
_MAX_FILES = 500
_MAX_BYTES = 1_048_576
_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".quarantine"}

_RULE_RE = re.compile(
    r"rule\s+\w+\s*\{(.*?)\n\}",
    re.DOTALL,
)
_META_ID = re.compile(r'id\s*=\s*"([^"]+)"')
_META_CLASS = re.compile(r'hit_class\s*=\s*"([^"]+)"')
_STR = re.compile(r'\$\w+\s*=\s*"((?:\\.|[^"\\])*)"')


def load_signature_pack(rules_dir: Path | None = None) -> list[dict[str, object]]:
    root = rules_dir or _RULES_DIR
    pack: list[dict[str, object]] = []
    if not root.is_dir():
        return pack
    for path in sorted(root.glob("*.yar")):
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


def scan_local_root(root_path: str, pack: list[dict[str, object]] | None = None) -> list[dict[str, str]]:
    root = validate_root_path(root_path)
    if not os.path.isdir(root):
        return []
    signatures = pack if pack is not None else load_signature_pack()
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
            try:
                jail_rel_path(root, rel)
            except ValueError:
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
            for spec in signatures:
                needles = spec["needles"]
                if not isinstance(needles, list):
                    continue
                if any(n in blob for n in needles if isinstance(n, bytes | bytearray)):
                    key = (rel, str(spec["rule_id"]))
                    if key in seen:
                        continue
                    seen.add(key)
                    hits.append(
                        {
                            "rel_path": rel,
                            "hit_class": str(spec["hit_class"]),
                            "rule_id": str(spec["rule_id"]),
                        }
                    )
    return hits
