"""
Database model for download history.
"""

import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class HistoryAction(str, enum.Enum):
    """User action that produced a history entry."""

    SENT_TO_CLIENT = "sent_to_client"
    DOWNLOADED_TORRENT = "downloaded_torrent"


class HistoryStatus(str, enum.Enum):
    """Outcome of a history entry."""

    SUCCESS = "success"
    FAILED = "failed"


class DownloadHistory(Base):  # type: ignore[misc]
    """
    A single record of a user-initiated download action against a search result.

    Instance and client foreign keys are intentionally omitted: ``*_name`` /
    ``indexer`` columns hold denormalized snapshots so a row remains readable
    after the underlying instance or client is deleted.
    """

    __tablename__ = "download_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    action: Mapped[HistoryAction] = mapped_column(
        Enum(HistoryAction, name="historyaction"),
        nullable=False,
        index=True,
    )
    status: Mapped[HistoryStatus] = mapped_column(
        Enum(HistoryStatus, name="historystatus"),
        nullable=False,
        default=HistoryStatus.SUCCESS,
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    info_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    torrent_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    magnet_link: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    source_instance_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_instance_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    indexer: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    client_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    search_query: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<DownloadHistory(id={self.id}, action='{self.action.value}', "
            f"title='{self.title[:40]}')>"
        )
