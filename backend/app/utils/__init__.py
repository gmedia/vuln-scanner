import hashlib


def hash_key(key: str) -> str:
    """Hash an API key string with SHA-256 for secure storage.

    Used by key_routes, ApiKeyMiddleware, and WebSocket auth to ensure
    consistent hashing across all key validation paths.
    """
    return hashlib.sha256(key.encode()).hexdigest()
