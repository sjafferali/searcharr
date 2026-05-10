"""
Services package.

This module exports all service classes for business logic.
"""

from app.services.bookmark import compute_dedup_key
from app.services.encryption import decrypt_credential, encrypt_credential
from app.services.feed import FeedService
from app.services.history import format_size, record_history
from app.services.jackett import JackettService
from app.services.prowlarr import ProwlarrService
from app.services.qbittorrent import QBittorrentService
from app.services.search_aggregator import SearchAggregator

__all__ = [
    "compute_dedup_key",
    "encrypt_credential",
    "decrypt_credential",
    "format_size",
    "record_history",
    "FeedService",
    "JackettService",
    "ProwlarrService",
    "QBittorrentService",
    "SearchAggregator",
]
