"""Add sort_strategy column to feeds.

``date_desc`` (default) keeps the existing newest-first merge-sort
behavior. ``indexer_order`` preserves the per-instance order Prowlarr or
Jackett returned, so a Prowlarr-side ``orderby=`` (e.g.
``freeleechstart``) actually reaches the feed UI instead of being
overwritten by a date sort.

The column is created with a server default so existing rows back-fill
automatically; we keep the default column-level so future inserts that
omit the field also land on ``date_desc``. Idempotent table check is the
same pattern used in 005/006 — environments where ``create_all`` already
materialized the column at app startup get a no-op.

Revision ID: 007_add_feed_sort_strategy
Revises: 006_add_feeds
Create Date: 2026-05-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007_add_feed_sort_strategy"
down_revision: str | None = "006_add_feeds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if _column_exists("feeds", "sort_strategy"):
        return
    op.add_column(
        "feeds",
        sa.Column(
            "sort_strategy",
            sa.String(length=32),
            nullable=False,
            server_default="date_desc",
        ),
    )


def downgrade() -> None:
    if not _column_exists("feeds", "sort_strategy"):
        return
    op.drop_column("feeds", "sort_strategy")
