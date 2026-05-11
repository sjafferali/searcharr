"""
Database models for saved feeds.

A feed is a named, persisted "indexer subscription" — a curated set of
indexer references on Jackett/Prowlarr instances that the user wants to
poll for the latest releases. Optional filter fields narrow the items
that appear when the feed is fetched.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Feed(BaseModel):
    """
    A saved feed configuration.

    Each feed has a display name, an optional category filter, and several
    result-shaping filters (freeleech-only, min seeders, size bounds,
    include/exclude regex). The actual indexer references live in
    ``FeedIndexer`` rows joined by ``feed_id``. Polling fields drive the
    background ``FeedPoller`` that accumulates ``FeedItem`` history.
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

    poll_interval_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=15, server_default="15"
    )
    retention_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30, server_default="30"
    )
    polling_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    indexers: Mapped[list["FeedIndexer"]] = relationship(
        "FeedIndexer",
        back_populates="feed",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    items: Mapped[list["FeedItem"]] = relationship(
        "FeedItem",
        back_populates="feed",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def stale_after_seconds(self) -> int:
        """
        Seconds after which a polled item is considered stale (visually dimmed).

        Held at four polling intervals with a one-hour floor so manual refreshes
        or a tight ten-minute cadence still leave room for items that briefly
        drop out of an indexer's rolling window.
        """
        return max(3600, self.poll_interval_minutes * 60 * 4)

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


class FeedItem(BaseModel):
    """
    A release observed in a feed at some point.

    Rows are upserted by ``FeedPoller`` keyed by ``(feed_id, dedup_key)``.
    ``first_seen_at`` records when the item first appeared in this feed's
    history; ``last_seen_at`` is bumped on every poll that still finds the
    item upstream. The denormalized payload mirrors ``SearchResult`` so the
    feed list endpoint can return items without re-hitting the indexer —
    crucial once an item has aged out of the upstream rolling window.

    Freeleech/seeders/leechers are point-in-time snapshots from the most
    recent poll that observed the item; once the item drops out of the
    upstream window we hold the last-observed state and rely on the
    ``last_seen_at`` freshness signal to communicate the staleness.
    """

    __tablename__ = "feed_items"
    __table_args__ = (
        UniqueConstraint("feed_id", "dedup_key", name="uq_feed_item_dedup"),
        Index("ix_feed_items_feed_last_seen", "feed_id", "last_seen_at"),
        Index("ix_feed_items_feed_first_seen", "feed_id", "first_seen_at"),
        Index("ix_feed_items_feed_freeleech", "feed_id", "freeleech"),
    )

    feed_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("feeds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # ``Text`` (not ``String(N)``) because Prowlarr download URLs embed a
    # base64-encoded ``link=`` parameter that routinely pushes the URL —
    # and therefore the URL-derived dedup_key — past 255 characters.
    dedup_key: Mapped[str] = mapped_column(Text, nullable=False)

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_instance_name: Mapped[str] = mapped_column(String(255), nullable=False)
    indexer: Mapped[str] = mapped_column(String(255), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    seeders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leechers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pub_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    magnet_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    torrent_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    info_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    freeleech: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    download_volume_factor: Mapped[float | None] = mapped_column(Float, nullable=True)

    feed: Mapped[Feed] = relationship("Feed", back_populates="items")

    def __repr__(self) -> str:
        return f"<FeedItem(feed_id={self.feed_id}, dedup_key='{self.dedup_key}')>"
