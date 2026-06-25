import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEV_API_KEY_PREFIXES = ("dev-", "dev-api-key")
DEV_SECRET_PREFIXES = ("dev-secret", "dev-secret-key")
RECOMMENDED_STRENGTH = 32

_SENTINEL = "__UNSET__"


class Settings(BaseSettings):
    """Application settings loaded from environment and .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://vuln_scanner:change_me_in_production@postgres:5432/vuln_scanner"
    database_url_sync: str = "postgresql://vuln_scanner:change_me_in_production@postgres:5432/vuln_scanner"
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/0"

    api_key: str = _SENTINEL
    secret_key: str = _SENTINEL
    osv_base_url: str = "https://api.osv.dev/v1"
    max_upload_size_mb: int = 500
    cors_origins: str = "http://localhost:5173,http://localhost,http://localhost:8000"

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 7
    cookie_secure: bool = True

    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "VulnScanner <noreply@vs.appmedia.id>"
    frontend_url: str = "https://vs.appmedia.id"

    admin_email: str = ""
    admin_password: str = ""
    default_register_credits: int = 30
    ip_scan_credit_cost: int = 1
    domain_scan_credit_cost: int = 2
    apk_scan_credit_cost: int = 3
    ipa_scan_credit_cost: int = 3


settings = Settings()

def _is_dev_value(val: str, prefixes: tuple[str, ...]) -> bool:
    return val.startswith(prefixes)


def _warn_dev_value(name: str, val: str) -> None:
    logger.warning(
        "[SECURITY] %s is set to a development placeholder (%s…). "
        "Generate a strong key: python3 -c \"import secrets; print(secrets.token_hex(%d))\"",
        name,
        val[:16],
        RECOMMENDED_STRENGTH,
    )


def check_settings() -> None:
    """Validate security-critical settings and warn on insecure defaults."""
    if settings.api_key == _SENTINEL:
        logger.warning(
            "[SECURITY] API_KEY is not set.  All API requests will be rejected. "
            "Set the API_KEY environment variable."
        )
    elif _is_dev_value(settings.api_key, DEV_API_KEY_PREFIXES):
        _warn_dev_value("API_KEY", settings.api_key)

    if settings.secret_key == _SENTINEL:
        logger.warning(
            "[SECURITY] SECRET_KEY is not set.  Set the SECRET_KEY environment variable."
        )
    elif _is_dev_value(settings.secret_key, DEV_SECRET_PREFIXES):
        _warn_dev_value("SECRET_KEY", settings.secret_key)

    if settings.cors_origins == "*":
        logger.warning("[SECURITY] CORS_ORIGINS is set to wildcard (*).  Restrict to specific origins.")

    if not settings.cors_origins.strip():
        logger.warning("[SECURITY] CORS_ORIGINS is empty. No origins will be allowed.")
