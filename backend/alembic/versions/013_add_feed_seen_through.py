"""Add seen_through / seen_history columns to feeds.

Moves the feeds page's "new since last visit" marker out of browser
localStorage and into the database so it is shared across devices:

- ``seen_through``: items first seen after this instant are NEW. NULL
  until the feed is first opened.
- ``seen_history``: earlier ``seen_through`` values (JSON list of ISO-8601
  strings, newest first), so a batch of items that was marked seen can be
  shown again.

Both are nullable with no server default; existing rows back-fill to NULL.
Plain ``ADD COLUMN`` works on PostgreSQL and SQLite alike, and the
idempotent column check matches 010 for environments where ``create_all``
already materialized the columns.

Revision ID: 013_add_feed_seen_through
Revises: 012_add_default_indexers
Create Date: 2026-11-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013_add_feed_seen_through"
down_revision: str | None = "012_add_default_indexers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if not _column_exists("feeds", "seen_through"):
        op.add_column("feeds", sa.Column("seen_through", sa.DateTime(timezone=True), nullable=True))
    if not _column_exists("feeds", "seen_history"):
        op.add_column("feeds", sa.Column("seen_history", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _column_exists("feeds", "seen_history"):
        op.drop_column("feeds", "seen_history")
    if _column_exists("feeds", "seen_through"):
        op.drop_column("feeds", "seen_through")
