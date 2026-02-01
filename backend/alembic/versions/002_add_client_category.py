"""Add category column to download_clients.

Adds optional category field for assigning torrents to a specific
category when added to the download client.

Revision ID: 002_add_client_category
Revises: 001_initial_models
Create Date: 2025-02-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_add_client_category"
down_revision: str | None = "001_initial_models"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "download_clients",
        sa.Column("category", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("download_clients", "category")
