from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://vuln_scanner:change_me_in_production@postgres:5432/vuln_scanner"
    database_url_sync: str = "postgresql://vuln_scanner:change_me_in_production@postgres:5432/vuln_scanner"
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/0"

    api_key: str = "dev-api-key-change-me"
    secret_key: str = "dev-secret-key"
    osv_base_url: str = "https://api.osv.dev/v1"
    max_upload_size_mb: int = 500
    cors_origins: str = "*"


settings = Settings()
