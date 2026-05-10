"""Add bookmarks table.

Stores user-saved snapshots of search results so they can be acted on
later (send/copy/download) regardless of whether the original search is
re-run. ``dedup_key`` is a normalized stable identity derived from the
magnet info-hash, torrent URL, or info URL — used both for the unique
constraint that prevents duplicate bookmarks and for the lookup that
highlights already-bookmarked rows in current search results.

Revision ID: 005_add_bookmarks
Revises: 004_add_client_is_default
Create Date: 2026-05-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_add_bookmarks"
down_revision: str | None = "004_add_client_is_default"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bookmarks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("info_url", sa.Text(), nullable=True),
        sa.Column("torrent_url", sa.Text(), nullable=True),
        sa.Column("magnet_link", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_instance_id", sa.Integer(), nullable=True),
        sa.Column("source_instance_name", sa.String(length=255), nullable=False),
        sa.Column("indexer", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("dedup_key", sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedup_key", name="uq_bookmarks_dedup_key"),
    )
    op.create_index(
        op.f("ix_bookmarks_created_at"),
        "bookmarks",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookmarks_source_type"),
        "bookmarks",
        ["source_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bookmarks_dedup_key"),
        "bookmarks",
        ["dedup_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bookmarks_dedup_key"), table_name="bookmarks")
    op.drop_index(op.f("ix_bookmarks_source_type"), table_name="bookmarks")
    op.drop_index(op.f("ix_bookmarks_created_at"), table_name="bookmarks")
    op.drop_table("bookmarks")
