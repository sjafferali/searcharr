"""
Database models for download clients.
"""

import enum

from sqlalchemy import Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class ClientType(str, enum.Enum):
    """Supported download client types."""

    QBITTORRENT = "qbittorrent"
    # Future client types can be added here:
    # TRANSMISSION = "transmission"
    # DELUGE = "deluge"
    # RTORRENT = "rtorrent"
    # ARIA2 = "aria2"


class DownloadClient(BaseModel):
    """
    Represents a download client (torrent client) configuration.

    Stores connection details for torrent clients like qBittorrent.
    Credentials are stored encrypted.
    """

    __tablename__ = "download_clients"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    client_type: Mapped[ClientType] = mapped_column(
        Enum(ClientType),
        nullable=False,
        default=ClientType.QBITTORRENT,
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    username: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted
    password: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted

    def __repr__(self) -> str:
        return f"<DownloadClient(id={self.id}, name='{self.name}', type='{self.client_type.value}')>"
