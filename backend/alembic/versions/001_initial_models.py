"""Initial models for Searcharr.

Creates tables for:
- jackett_instances: Jackett indexer instance configurations
- prowlarr_instances: Prowlarr indexer instance configurations
- download_clients: Download client (qBittorrent, etc.) configurations

Revision ID: 001_initial_models
Revises:
Create Date: 2025-01-31

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001_initial_models"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create jackett_instances table
    op.create_table(
        "jackett_instances",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_jackett_instances_name"), "jackett_instances", ["name"], unique=False
    )

    # Create prowlarr_instances table
    op.create_table(
        "prowlarr_instances",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_prowlarr_instances_name"), "prowlarr_instances", ["name"], unique=False
    )

    # Create download_clients table
    op.create_table(
        "download_clients",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "client_type",
            sa.Enum("QBITTORRENT", name="clienttype"),
            nullable=False,
        ),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("username", sa.Text(), nullable=False),
        sa.Column("password", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_download_clients_name"), "download_clients", ["name"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_download_clients_name"), table_name="download_clients")
    op.drop_table("download_clients")
    op.drop_index(op.f("ix_prowlarr_instances_name"), table_name="prowlarr_instances")
    op.drop_table("prowlarr_instances")
    op.drop_index(op.f("ix_jackett_instances_name"), table_name="jackett_instances")
    op.drop_table("jackett_instances")

    # Drop the enum type
    op.execute("DROP TYPE IF EXISTS clienttype")
