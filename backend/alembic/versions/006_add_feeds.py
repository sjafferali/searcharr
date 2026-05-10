"""Add feeds and feed_indexers tables.

Stores user-defined "feed" subscriptions that pull the latest releases
from a curated set of indexers (across one or more Jackett/Prowlarr
instances). Filter columns on ``feeds`` (freeleech_only, min_seeders,
size bounds, regex include/exclude) shape the items shown when the feed
is fetched. ``feed_indexers`` is a child table of (feed_id, source_type,
source_instance_id, indexer_id) tuples, with indexer/instance display
names denormalized so the feed list still renders if a referenced
instance becomes unreachable.

Revision ID: 006_add_feeds
Revises: 005_add_bookmarks
Create Date: 2026-05-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_add_feeds"
down_revision: str | None = "005_add_bookmarks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feeds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="All"),
        sa.Column(
            "freeleech_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("min_seeders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("max_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("include_regex", sa.Text(), nullable=True),
        sa.Column("exclude_regex", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_feeds_name"), "feeds", ["name"], unique=False)

    op.create_table(
        "feed_indexers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("feed_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_instance_id", sa.Integer(), nullable=False),
        sa.Column("source_instance_name", sa.String(length=255), nullable=False),
        sa.Column("indexer_id", sa.String(length=255), nullable=False),
        sa.Column("indexer_name", sa.String(length=255), nullable=False),
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
        sa.UniqueConstraint(
            "feed_id",
            "source_type",
            "source_instance_id",
            "indexer_id",
            name="uq_feed_indexer",
        ),
    )
    op.create_index(
        op.f("ix_feed_indexers_feed_id"),
        "feed_indexers",
        ["feed_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_feed_indexers_feed_id"), table_name="feed_indexers")
    op.drop_table("feed_indexers")
    op.drop_index(op.f("ix_feeds_name"), table_name="feeds")
    op.drop_table("feeds")
