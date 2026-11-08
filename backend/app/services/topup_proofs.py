"""Private storage for manual-transfer top-up proofs (S2).

The upload filename is never used to derive a storage key, the MIME type is
sniffed from the bytes (never the client ``Content-Type``), and the returned
reference is internal: it must never reach a customer response or a log line.

``LocalObjectStorage.put_file`` ignores its ``key`` argument, so local proofs
are written directly to ``<upload_dir>/proofs/<org>/<order>/<uuid>.<ext>`` with
private directory/file modes instead of going through it.
"""

from __future__ import annotations

import contextlib
import os
import tempfile
import uuid
from uuid import UUID

from fastapi import HTTPException, status

from app.config import settings
from app.services.object_storage import ObjectStorageError, get_object_storage, is_cos_ref

MAX_PROOF_BYTES = 5 * 1024 * 1024

_MIME_EXT: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}

_PROOF_DIR_MODE = 0o700
_PROOF_FILE_MODE = 0o600


def sniff_mime(data: bytes) -> str | None:
    """Return the allowlisted MIME type from magic bytes, or ``None``."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    return None


def extension_for_mime(mime: str) -> str:
    return _MIME_EXT.get(mime, "bin")


def _is_local_backend() -> bool:
    backend = (settings.object_storage_backend or "local").strip().lower()
    return backend in ("", "local", "disk", "filesystem")


def _local_path(org_id: UUID, order_id: UUID, ext: str) -> str:
    directory = os.path.join(settings.upload_dir, "proofs", str(org_id), str(order_id))
    os.makedirs(directory, mode=_PROOF_DIR_MODE, exist_ok=True)
    with contextlib.suppress(OSError):
        os.chmod(directory, _PROOF_DIR_MODE)
    return os.path.join(directory, f"{uuid.uuid4().hex}.{ext}")


def save_proof(org_id: UUID, order_id: UUID, data: bytes, mime: str) -> str:
    """Persist proof bytes privately and return an internal reference."""
    ext = extension_for_mime(mime)
    if _is_local_backend():
        path = _local_path(org_id, order_id, ext)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, _PROOF_FILE_MODE)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        return path

    fd, tmp_path = tempfile.mkstemp(prefix="topup-proof-", suffix=f".{ext}")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        key = f"topup-proofs/{org_id}/{order_id}/{uuid.uuid4().hex}.{ext}"
        return get_object_storage().put_file(tmp_path, key, mime)
    finally:
        with contextlib.suppress(OSError):
            os.remove(tmp_path)


def read_proof(ref: str) -> bytes:
    """Read proof bytes for the admin-only download endpoint."""
    if is_cos_ref(ref):
        fd, tmp_path = tempfile.mkstemp(prefix="topup-proof-read-")
        os.close(fd)
        try:
            get_object_storage().materialize(ref, tmp_path)
            with open(tmp_path, "rb") as handle:
                return handle.read()
        except ObjectStorageError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Proof storage unavailable") from exc
        finally:
            with contextlib.suppress(OSError):
                os.remove(tmp_path)
    try:
        with open(ref, "rb") as handle:
            return handle.read()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proof not found") from exc


def delete_proof(ref: str) -> None:
    """Best-effort delete; a failed cleanup must never fail the caller."""
    try:
        if is_cos_ref(ref):
            get_object_storage().delete(ref)
            return
        if os.path.isfile(ref):
            os.remove(ref)
    except (OSError, ObjectStorageError):
        pass
