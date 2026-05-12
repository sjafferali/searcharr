"""Add last_poll_errors column to feeds.

Stores the list of per-indexer / per-instance failures (rate limits,
disabled indexers, timeouts, auth errors) recorded on the feed's most
recent poll, so the feeds UI can explain why an indexer returned nothing
instead of silently showing zero items. NULL means the last poll hit no
failures.

Nullable JSON column with no server default; existing rows back-fill to
NULL. Idempotent column check matches 007/004 — environments where
``create_all`` already materialized the column at app startup get a
no-op.

Revision ID: 010_add_feed_last_poll_errors
Revises: 009_widen_feed_item_dedup_key
Create Date: 2026-05-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010_add_feed_last_poll_errors"
down_revision: str | None = "009_widen_feed_item_dedup_key"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if _column_exists("feeds", "last_poll_errors"):
        return
    op.add_column("feeds", sa.Column("last_poll_errors", sa.JSON(), nullable=True))


def downgrade() -> None:
    if not _column_exists("feeds", "last_poll_errors"):
        return
    op.drop_column("feeds", "last_poll_errors")
