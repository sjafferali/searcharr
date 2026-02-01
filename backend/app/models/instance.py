"""
Database models for Jackett and Prowlarr instances.
"""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel


class JackettInstance(BaseModel):
    """
    Represents a Jackett indexer instance.

    Jackett is a proxy server that translates queries from apps into
    tracker-site-specific HTTP queries.
    """

    __tablename__ = "jackett_instances"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted

    def __repr__(self) -> str:
        return f"<JackettInstance(id={self.id}, name='{self.name}', url='{self.url}')>"


class ProwlarrInstance(BaseModel):
    """
    Represents a Prowlarr indexer instance.

    Prowlarr is an indexer manager/proxy that integrates with various
    PVR apps and supports management of both torrent and usenet indexers.
    """

    __tablename__ = "prowlarr_instances"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted

    def __repr__(self) -> str:
        return f"<ProwlarrInstance(id={self.id}, name='{self.name}', url='{self.url}')>"
