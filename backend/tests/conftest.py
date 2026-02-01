"""
Pytest configuration and fixtures.
"""

import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from app.config import settings
from app.core.database import Base, get_db
from app.main import app
from app.models import ClientType, DownloadClient, JackettInstance, ProwlarrInstance
from app.services import encrypt_credential
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Override settings for testing
settings.TESTING = True
settings.DATABASE_TYPE = "sqlite"
settings.SQLITE_DATABASE_PATH = ":memory:"

# Create test engine
test_engine = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    echo=False,
    future=True,
)

# Create test session factory
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with overridden database dependency."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# =============================================================================
# Test Data Fixtures
# =============================================================================


@pytest_asyncio.fixture
async def jackett_instance(db_session: AsyncSession) -> JackettInstance:
    """Create a test Jackett instance."""
    instance = JackettInstance(
        name="Test Jackett",
        url="http://localhost:9117",
        api_key=encrypt_credential("test-api-key-123"),
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)
    return instance


@pytest_asyncio.fixture
async def prowlarr_instance(db_session: AsyncSession) -> ProwlarrInstance:
    """Create a test Prowlarr instance."""
    instance = ProwlarrInstance(
        name="Test Prowlarr",
        url="http://localhost:9696",
        api_key=encrypt_credential("test-api-key-456"),
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)
    return instance


@pytest_asyncio.fixture
async def download_client(db_session: AsyncSession) -> DownloadClient:
    """Create a test download client."""
    client = DownloadClient(
        name="Test qBittorrent",
        client_type=ClientType.QBITTORRENT,
        url="http://localhost:8080",
        username=encrypt_credential("admin"),
        password=encrypt_credential("password123"),
    )
    db_session.add(client)
    await db_session.commit()
    await db_session.refresh(client)
    return client
