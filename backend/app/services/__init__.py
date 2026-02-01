"""
Services package.

This module exports all service classes for business logic.
"""

from app.services.encryption import (
    EncryptionService,
    decrypt_credential,
    encrypt_credential,
    encryption_service,
)
from app.services.jackett import JackettService
from app.services.prowlarr import ProwlarrService
from app.services.qbittorrent import QBittorrentService
from app.services.search_aggregator import SearchAggregator

__all__ = [
    "EncryptionService",
    "encryption_service",
    "encrypt_credential",
    "decrypt_credential",
    "JackettService",
    "ProwlarrService",
    "QBittorrentService",
    "SearchAggregator",
]
