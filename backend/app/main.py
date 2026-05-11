"""
Main FastAPI application module.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.v1.router import api_router as v1_router
from app.config import settings
from app.core.database import get_engine, get_session_factory
from app.services import FeedPoller

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Lifespan context manager for FastAPI application.

    Schema management is owned by Alembic and is expected to have run before
    the app starts (the deployment entrypoint runs ``alembic upgrade head``).
    For local development, run ``poetry run alembic upgrade head`` once after
    the database file is created or destroyed.

    Starts the ``FeedPoller`` so saved feeds accumulate ``feed_items`` history
    in the background. The poller is exposed on ``app.state.feed_poller`` so
    the synchronous refresh endpoint can ride the same upsert path.
    """
    logger.info("Starting up application...")
    engine = get_engine()

    poller = FeedPoller(get_session_factory())
    poller_task = asyncio.create_task(poller.run_forever(), name="feed-poller")
    app.state.feed_poller = poller

    logger.info("Application started successfully")
    try:
        yield
    finally:
        logger.info("Shutting down application...")
        poller.stop()
        try:
            await asyncio.wait_for(poller_task, timeout=10)
        except TimeoutError:
            logger.warning("FeedPoller did not stop within 10s; cancelling")
            poller_task.cancel()
            try:
                await poller_task
            except (asyncio.CancelledError, Exception):
                pass
        await engine.dispose()


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Configure CORS - allow all origins for simplicity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, tags=["health"])
app.include_router(v1_router, prefix="/api/v1")


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    """Custom 404 handler."""
    return JSONResponse(
        status_code=404,
        content={"detail": "Not found"},
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Custom 500 handler."""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
