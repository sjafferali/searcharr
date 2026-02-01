"""
Database configuration and session management.
"""

from collections.abc import AsyncGenerator
from functools import lru_cache
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from app.config import settings

# Create base class for models
Base = declarative_base()


@lru_cache
def get_engine() -> AsyncEngine:
    """Get or create the async database engine (lazily initialized)."""
    # Build engine options based on database type
    engine_options: dict[str, Any] = {
        "echo": False,
        "future": True,
    }

    # Only add connection pool settings for databases that support them (not SQLite)
    if settings.DATABASE_TYPE == "postgresql":
        engine_options.update(
            {
                "pool_pre_ping": True,
                "pool_size": 5,
                "max_overflow": 10,
            }
        )

    return create_async_engine(
        settings.database_url_async,
        **engine_options,
    )


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get or create the async session factory (lazily initialized)."""
    return async_sessionmaker(
        get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


# For backward compatibility
engine = property(lambda self: get_engine())


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency to get database session.
    Yields an async database session and ensures it's closed after use.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
