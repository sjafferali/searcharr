"""Widen feed_items.dedup_key to TEXT.

Prowlarr download URLs include a base64-encoded ``link=`` query parameter
that pushes URLs (and therefore the URL-derived dedup_key) well past 255
characters, producing ``StringDataRightTruncationError`` inserts. Widening
to ``TEXT`` removes the limit. Uniqueness on ``(feed_id, dedup_key)`` keeps
working — Postgres allows unique btree indexes over Text columns up to the
page-size limit, which is plenty.

The type change runs through ``batch_alter_table`` so it works on SQLite
(which cannot ALTER a column's type and needs a table rebuild) as well as
Postgres, where it emits a plain ALTER COLUMN.

Revision ID: 009_widen_feed_item_dedup_key
Revises: 008_add_feed_items
Create Date: 2026-05-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009_widen_feed_item_dedup_key"
down_revision: str | None = "008_add_feed_items"
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
    if _column_type_is_text("feed_items", "dedup_key"):
        return
    with op.batch_alter_table("feed_items") as batch_op:
        batch_op.alter_column(
            "dedup_key",
            existing_type=sa.String(length=255),
            type_=sa.Text(),
            existing_nullable=False,
        )


def downgrade() -> None:
    if _column_type_is_text("feed_items", "dedup_key") is False:
        return
    with op.batch_alter_table("feed_items") as batch_op:
        batch_op.alter_column(
            "dedup_key",
            existing_type=sa.Text(),
            type_=sa.String(length=255),
            existing_nullable=False,
        )
