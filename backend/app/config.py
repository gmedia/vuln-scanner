import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEV_API_KEY_PREFIXES = ("dev-", "dev-api-key")
DEV_SECRET_PREFIXES = ("dev-secret", "dev-secret-key")
RECOMMENDED_STRENGTH = 32

_SENTINEL = "__UNSET__"


def _build_redis_url() -> str:
    """Build a Redis URL, including password if REDIS_PASSWORD is set."""
    password = os.environ.get("REDIS_PASSWORD", "")
    if password:
        return f"redis://:{password}@redis:6379/0"
    return "redis://redis:6379/0"


class Settings(BaseSettings):
    """Application settings loaded from environment and .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = os.environ["DATABASE_URL"]
    database_url_sync: str = os.environ["DATABASE_URL_SYNC"]
    redis_url: str = _build_redis_url()
    celery_broker_url: str = _build_redis_url()
    celery_result_backend: str = _build_redis_url()

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

    sentry_dsn: str = ""

    admin_email: str = ""
    admin_password: str = ""
    default_register_credits: int = 30
    ip_scan_credit_cost: int = 1
    domain_scan_credit_cost: int = 2
    apk_scan_credit_cost: int = 3
    ipa_scan_credit_cost: int = 3

    upload_dir: str = "/tmp/scans"

    @property
    def scan_type_pricing_map(self) -> dict[str, str]:
        return {
            "ip": "ip_scan_credit_cost",
            "domain": "domain_scan_credit_cost",
            "apk": "apk_scan_credit_cost",
            "ipa": "ipa_scan_credit_cost",
        }

    @property
    def valid_scan_types(self) -> tuple[str, ...]:
        return ("ip", "domain", "apk", "ipa")

    # Rate limiting — env-configurable for operational tuning without code changes
    ip_rate_limit: int = 300  # requests per hour per IP (ApiKeyMiddleware)
    ip_rate_limit_window: int = 3600  # seconds (1 hour)
    ws_rate_limit_max: int = 10  # WebSocket connections per minute per IP
    ws_rate_limit_window: int = 60  # seconds
    ws_key_rate_limit_max: int = 5  # WebSocket connections per minute per API key
    ws_key_rate_limit_window: int = 60  # seconds
    auth_login_limit: int = 5  # requests per minute per IP
    auth_register_limit: int = 3  # requests per minute per IP
    auth_refresh_limit: int = 10  # requests per minute per IP
    auth_verify_email_limit: int = 5  # requests per minute per IP
    auth_forgot_password_limit: int = 5  # requests per minute per IP
    auth_reset_password_limit: int = 5  # requests per minute per IP
    auth_resend_verification_limit: int = 3  # requests per minute per IP
    auth_change_password_limit: int = 3  # requests per minute per IP
    jwt_rate_limit: int = 300  # requests per hour per IP for JWT-authenticated endpoints
    jwt_rate_limit_window: int = 3600  # seconds (1 hour)
    admin_rate_limit: int = 60  # requests per minute per IP for admin endpoints
    admin_rate_limit_window: int = 60  # seconds
    scan_submit_limit: int = 30  # scan submissions per hour per IP
    scan_submit_window: int = 3600  # seconds (1 hour)
    auth_rate_limit_window: int = 60  # seconds for auth endpoint limiters


settings = Settings()


def _is_dev_value(val: str, prefixes: tuple[str, ...]) -> bool:
    return val.startswith(prefixes)


def _warn_dev_value(name: str, val: str) -> None:
    logger.warning(
        "[SECURITY] %s is set to a development placeholder (%s…). "
        'Generate a strong key: python3 -c "import secrets; print(secrets.token_hex(%d))"',
        name,
        val[:16],
        RECOMMENDED_STRENGTH,
    )


def check_settings() -> None:
    """Validate security-critical settings and warn on insecure defaults."""
    if settings.api_key == _SENTINEL:
        logger.warning(
            "[SECURITY] API_KEY is not set.  All API requests will be rejected. Set the API_KEY environment variable."
        )
    elif _is_dev_value(settings.api_key, DEV_API_KEY_PREFIXES):
        _warn_dev_value("API_KEY", settings.api_key)

    if settings.secret_key == _SENTINEL:
        logger.warning("[SECURITY] SECRET_KEY is not set.  Set the SECRET_KEY environment variable.")
    elif _is_dev_value(settings.secret_key, DEV_SECRET_PREFIXES):
        _warn_dev_value("SECRET_KEY", settings.secret_key)

    if settings.cors_origins == "*":
        logger.warning("[SECURITY] CORS_ORIGINS is set to wildcard (*).  Restrict to specific origins.")

    if not settings.cors_origins.strip():
        logger.warning("[SECURITY] CORS_ORIGINS is empty. No origins will be allowed.")
