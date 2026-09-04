"""Fernet wrap for wholesale provider credentials. Key derived from SECRET_KEY."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256((settings.secret_key or settings.api_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_credential(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_credential(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("invalid credential token") from exc
