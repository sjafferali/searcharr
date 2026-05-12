"""Widen bookmarks.dedup_key to TEXT.

The bookmark/feed dedup key now prefers a content signature
(``sig:SIZE|SOURCE|INDEXER|TITLE``) over the volatile proxied download URLs
that Jackett/Prowlarr hand out, and that signature embeds the release title —
which routinely exceeds 255 characters. Widening to ``TEXT`` removes the limit;
uniqueness still works (Postgres allows unique btree indexes over Text columns
up to the page-size limit, which is plenty).

Mirrors migration 009, which did the same for ``feed_items.dedup_key``.

Revision ID: 011_widen_bookmark_dedup_key
Revises: 010_add_feed_last_poll_errors
Create Date: 2026-05-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011_widen_bookmark_dedup_key"
down_revision: str | None = "010_add_feed_last_poll_errors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_type_is_text(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        return True  # treat missing table as no-op
    for col in inspector.get_columns(table):
        if col["name"] == column:
            type_name = str(col["type"]).upper()
            return type_name == "TEXT" or type_name.startswith("TEXT")
    return True


def upgrade() -> None:
    if _column_type_is_text("bookmarks", "dedup_key"):
        return
    op.alter_column(
        "bookmarks",
        "dedup_key",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    if _column_type_is_text("bookmarks", "dedup_key") is False:
        return
    op.alter_column(
        "bookmarks",
        "dedup_key",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
