"""Add feed_items table and polling columns to feeds.

``feed_items`` is the persisted history that the ``FeedPoller`` upserts
into on each tick. The four new columns on ``feeds`` configure that
poller: ``poll_interval_minutes`` (cadence), ``retention_days`` (how
long to keep history), ``polling_enabled`` (per-feed switch), and
``last_polled_at`` (the scheduler's clock for the next due time).

Idempotency guards mirror migrations 005–007 so re-running the migration
against a database where the tables/columns were materialized by
SQLAlchemy ``create_all`` is a no-op instead of an error.

Revision ID: 008_add_feed_items
Revises: 007_add_feed_sort_strategy
Create Date: 2026-05-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008_add_feed_items"
down_revision: str | None = "007_add_feed_sort_strategy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if not _column_exists("feeds", "poll_interval_minutes"):
        op.add_column(
            "feeds",
            sa.Column(
                "poll_interval_minutes",
                sa.Integer(),
                nullable=False,
                server_default="15",
            ),
        )
    if not _column_exists("feeds", "retention_days"):
        op.add_column(
            "feeds",
            sa.Column(
                "retention_days",
                sa.Integer(),
                nullable=False,
                server_default="30",
            ),
        )
    if not _column_exists("feeds", "polling_enabled"):
        op.add_column(
            "feeds",
            sa.Column(
                "polling_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
    if not _column_exists("feeds", "last_polled_at"):
        op.add_column(
            "feeds",
            sa.Column(
                "last_polled_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    if _table_exists("feed_items"):
        return

    op.create_table(
        "feed_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("feed_id", sa.Integer(), nullable=False),
        sa.Column("dedup_key", sa.Text(), nullable=False),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_instance_name", sa.String(length=255), nullable=False),
        sa.Column("indexer", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("seeders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("leechers", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pub_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("magnet_link", sa.Text(), nullable=True),
        sa.Column("torrent_url", sa.Text(), nullable=True),
        sa.Column("info_url", sa.Text(), nullable=True),
        sa.Column(
            "freeleech",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("download_volume_factor", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["feed_id"], ["feeds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feed_id", "dedup_key", name="uq_feed_item_dedup"),
    )
    op.create_index(
        op.f("ix_feed_items_feed_id"),
        "feed_items",
        ["feed_id"],
        unique=False,
    )
    op.create_index(
        "ix_feed_items_feed_last_seen",
        "feed_items",
        ["feed_id", "last_seen_at"],
        unique=False,
    )
    op.create_index(
        "ix_feed_items_feed_first_seen",
        "feed_items",
        ["feed_id", "first_seen_at"],
        unique=False,
    )
    op.create_index(
        "ix_feed_items_feed_freeleech",
        "feed_items",
        ["feed_id", "freeleech"],
        unique=False,
    )


def downgrade() -> None:
    if _table_exists("feed_items"):
        op.drop_index("ix_feed_items_feed_freeleech", table_name="feed_items")
        op.drop_index("ix_feed_items_feed_first_seen", table_name="feed_items")
        op.drop_index("ix_feed_items_feed_last_seen", table_name="feed_items")
        op.drop_index(op.f("ix_feed_items_feed_id"), table_name="feed_items")
        op.drop_table("feed_items")
    if _column_exists("feeds", "last_polled_at"):
        op.drop_column("feeds", "last_polled_at")
    if _column_exists("feeds", "polling_enabled"):
        op.drop_column("feeds", "polling_enabled")
    if _column_exists("feeds", "retention_days"):
        op.drop_column("feeds", "retention_days")
    if _column_exists("feeds", "poll_interval_minutes"):
        op.drop_column("feeds", "poll_interval_minutes")
