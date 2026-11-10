"""Add visit_baseline column to feeds.

``seen_through`` keeps advancing while a feed is on screen, so by the time
the next visit starts it no longer says where the previous visit began.
``visit_baseline`` records that starting point, letting the next visit tell
whether the previous one hid any items — including ones that arrived while
the feed was being viewed — and remember its baseline in ``seen_history``.

Nullable with no server default; existing rows back-fill to NULL and pick up
a value the next time the feed is opened.

Revision ID: 014_add_feed_visit_baseline
Revises: 013_add_feed_seen_through
Create Date: 2026-11-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014_add_feed_visit_baseline"
down_revision: str | None = "013_add_feed_seen_through"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if not _column_exists("feeds", "visit_baseline"):
        op.add_column(
            "feeds", sa.Column("visit_baseline", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    if _column_exists("feeds", "visit_baseline"):
        op.drop_column("feeds", "visit_baseline")
