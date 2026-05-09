"""Add is_default column to download_clients.

Allows marking exactly one download client as the default destination so the
client picker can be skipped when sending a torrent.

Revision ID: 004_add_client_is_default
Revises: 003_add_download_history
Create Date: 2026-05-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "004_add_client_is_default"
down_revision: str | None = "003_add_download_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "download_clients",
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("download_clients", "is_default")
