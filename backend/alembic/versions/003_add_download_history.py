"""Add download_history table.

Creates a table for recording user-initiated download actions against
search results. Instance/client identifiers are denormalized so rows
remain readable after the underlying records are deleted.

Revision ID: 003_add_download_history
Revises: 002_add_client_category
Create Date: 2026-05-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_add_download_history"
down_revision: str | None = "002_add_client_category"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "download_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "action",
            sa.Enum("SENT_TO_CLIENT", "DOWNLOADED_TORRENT", name="historyaction"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("SUCCESS", "FAILED", name="historystatus"),
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
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("client_name", sa.String(length=255), nullable=True),
        sa.Column("search_query", sa.String(length=500), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_download_history_occurred_at"),
        "download_history",
        ["occurred_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_download_history_action"),
        "download_history",
        ["action"],
        unique=False,
    )
    op.create_index(
        op.f("ix_download_history_source_type"),
        "download_history",
        ["source_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_download_history_source_instance_name"),
        "download_history",
        ["source_instance_name"],
        unique=False,
    )
    op.create_index(
        op.f("ix_download_history_indexer"),
        "download_history",
        ["indexer"],
        unique=False,
    )
    op.create_index(
        "ix_download_history_occurred_at_action",
        "download_history",
        [sa.text("occurred_at DESC"), "action"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_download_history_occurred_at_action", table_name="download_history")
    op.drop_index(op.f("ix_download_history_indexer"), table_name="download_history")
    op.drop_index(op.f("ix_download_history_source_instance_name"), table_name="download_history")
    op.drop_index(op.f("ix_download_history_source_type"), table_name="download_history")
    op.drop_index(op.f("ix_download_history_action"), table_name="download_history")
    op.drop_index(op.f("ix_download_history_occurred_at"), table_name="download_history")
    op.drop_table("download_history")

    op.execute("DROP TYPE IF EXISTS historystatus")
    op.execute("DROP TYPE IF EXISTS historyaction")
