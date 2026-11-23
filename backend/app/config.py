from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment
    WHENCE_ENV: str = "development"
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000

    # Cryptography
    WHENCE_MASTER_KEY: str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

    # Query Guardrails (Section 6)
    MAX_BYTES_SCANNED_PER_QUERY: int = 10 * 1024 * 1024 * 1024  # 10 GB
    QUERY_TIMEOUT_SECONDS: int = 60
    WHENCE_QUERY_LABEL: str = "whence"

    # LLM Settings (Section 9)
    LLM_PROVIDER: str = "gemini"
    LLM_API_KEY: str | None = None
    LLM_MODEL: str | None = None
    LLM_BASE_URL: str | None = None
    LLM_DAILY_TOKEN_LIMIT: int = 500000

    # Database
    DATABASE_URL: str = "sqlite:///./whence_local.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
