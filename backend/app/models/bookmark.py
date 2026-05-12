"""
Database model for user-saved bookmarks of search results.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Bookmark(Base):  # type: ignore[misc]
    """
    A user-saved snapshot of a search result.

    Stores the data needed to act on the result later (send/copy/download)
    without depending on the originating search being re-runnable. Source
    instance and indexer are denormalized for the same reason.

    ``dedup_key`` is a normalized stable identity (see ``compute_dedup_key``)
    derived from the magnet info-hash, a content signature of the release, or
    a normalized URL — used to detect "is this current search result already
    bookmarked?"
    """

    __tablename__ = "bookmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    info_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    torrent_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    magnet_link: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    source_instance_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_instance_name: Mapped[str] = mapped_column(String(255), nullable=False)
    indexer: Mapped[str] = mapped_column(String(255), nullable=False)

    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ``Text`` (not ``String(N)``) because the content-signature form of the
    # key embeds the release title, and proxied URL forms can run long.
    dedup_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    def __repr__(self) -> str:
        return f"<Bookmark(id={self.id}, title='{self.title[:40]}')>"
