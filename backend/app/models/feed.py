"""
Database models for saved feeds.

A feed is a named, persisted "indexer subscription" — a curated set of
indexer references on Jackett/Prowlarr instances that the user wants to
poll for the latest releases. Optional filter fields narrow the items
that appear when the feed is fetched.
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Feed(BaseModel):
    """
    A saved feed configuration.

    Each feed has a display name, an optional category filter, and several
    result-shaping filters (freeleech-only, min seeders, size bounds,
    include/exclude regex). The actual indexer references live in
    ``FeedIndexer`` rows joined by ``feed_id``.
    """

    __tablename__ = "feeds"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    category: Mapped[str] = mapped_column(String(32), nullable=False, default="All")
    freeleech_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    min_seeders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    min_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    max_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    include_regex: Mapped[str | None] = mapped_column(Text, nullable=True)
    exclude_regex: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ``date_desc`` (default) sorts merged results by ``pubDate`` descending —
    # the natural newest-first order. ``indexer_order`` skips the merge sort
    # and concatenates each instance's results in the order the indexer
    # returned them, which lets a Prowlarr-side ``orderby=`` (e.g.
    # ``freeleechstart``) actually reach the UI.
    sort_strategy: Mapped[str] = mapped_column(String(32), nullable=False, default="date_desc")

    indexers: Mapped[list["FeedIndexer"]] = relationship(
        "FeedIndexer",
        back_populates="feed",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Feed(id={self.id}, name='{self.name}')>"


class FeedIndexer(BaseModel):
    """
    A single (instance, indexer) reference belonging to a feed.

    ``source_type`` is "jackett" or "prowlarr"; ``source_instance_id`` points
    at the corresponding ``jackett_instances`` or ``prowlarr_instances`` row.
    ``indexer_id`` is the indexer slug (Jackett) or numeric id (Prowlarr).
    Display fields are denormalized so feed UIs can render even if a
    referenced instance becomes unreachable.
    """

    __tablename__ = "feed_indexers"
    __table_args__ = (
        UniqueConstraint(
            "feed_id",
            "source_type",
            "source_instance_id",
            "indexer_id",
            name="uq_feed_indexer",
        ),
    )

    feed_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("feeds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_instance_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source_instance_name: Mapped[str] = mapped_column(String(255), nullable=False)
    indexer_id: Mapped[str] = mapped_column(String(255), nullable=False)
    indexer_name: Mapped[str] = mapped_column(String(255), nullable=False)

    feed: Mapped[Feed] = relationship("Feed", back_populates="indexers")

    def __repr__(self) -> str:
        return (
            f"<FeedIndexer(feed_id={self.feed_id}, "
            f"{self.source_type}:{self.source_instance_id}/{self.indexer_id})>"
        )
