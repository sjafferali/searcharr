"""Add default_indexers to jackett_instances and prowlarr_instances.

Stores a JSON-encoded list of indexer IDs per instance. Indexers listed here
are pre-selected as the search sources when the search page loads, letting
users scope everyday searches to a curated set of indexers.

Revision ID: 012_add_default_indexers
Revises: 011_widen_bookmark_dedup_key
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "012_add_default_indexers"
down_revision: str | None = "011_widen_bookmark_dedup_key"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jackett_instances",
        sa.Column("default_indexers", sa.Text(), nullable=True),
    )
    op.add_column(
        "prowlarr_instances",
        sa.Column("default_indexers", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prowlarr_instances", "default_indexers")
    op.drop_column("jackett_instances", "default_indexers")
