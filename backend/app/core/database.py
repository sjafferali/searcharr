"""
Database configuration and session management.
"""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

# Build engine options based on database type
engine_options: dict[str, Any] = {
    "echo": settings.DEBUG and not settings.TESTING,
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

# Create async engine
engine = create_async_engine(
    settings.database_url_async,
    **engine_options,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Create base class for models
Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency to get database session.
    Yields an async database session and ensures it's closed after use.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
