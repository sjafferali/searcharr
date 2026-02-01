"""
Application configuration module.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # Application
    APP_NAME: str = "Searcharr"
    APP_VERSION: str = "0.1.0"
    APP_DESCRIPTION: str = "Unified torrent search aggregator"

    # Database
    DATABASE_TYPE: str = Field(default="postgresql", description="Database type (sqlite or postgresql)")

    # PostgreSQL settings
    POSTGRES_HOST: str = Field(default="localhost", description="PostgreSQL host")
    POSTGRES_PORT: int = Field(default=5432, description="PostgreSQL port")
    POSTGRES_USER: str = Field(default="searcharr", description="PostgreSQL user")
    POSTGRES_PASSWORD: str = Field(default="searcharr", description="PostgreSQL password")
    POSTGRES_DB: str = Field(default="searcharr", description="PostgreSQL database name")

    # SQLite settings (for local development/testing)
    SQLITE_DATABASE_PATH: str = Field(default="./searcharr.db", description="SQLite database file path")

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # Testing
    TESTING: bool = Field(default=False, description="Testing mode flag")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    @property
    def database_url_async(self) -> str:
        """Get async database URL."""
        if self.DATABASE_TYPE == "postgresql":
            return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        else:
            return f"sqlite+aiosqlite:///{self.SQLITE_DATABASE_PATH}"

    @property
    def database_url_sync(self) -> str:
        """Get sync database URL (for Alembic migrations)."""
        if self.DATABASE_TYPE == "postgresql":
            return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        else:
            return f"sqlite:///{self.SQLITE_DATABASE_PATH}"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Create settings instance
settings = get_settings()
