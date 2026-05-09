"""
Database models package.

This module exports all SQLAlchemy models for the application.
"""

from app.models.base import BaseModel, TimestampMixin
from app.models.client import ClientType, DownloadClient
from app.models.history import DownloadHistory, HistoryAction, HistoryStatus
from app.models.instance import JackettInstance, ProwlarrInstance

__all__ = [
    "BaseModel",
    "TimestampMixin",
    "ClientType",
    "DownloadClient",
    "DownloadHistory",
    "HistoryAction",
    "HistoryStatus",
    "JackettInstance",
    "ProwlarrInstance",
]
