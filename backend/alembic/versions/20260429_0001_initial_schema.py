"""initial schema

Revision ID: 20260429_0001
Revises:
Create Date: 2026-04-29
"""

from alembic import op
from sqlmodel import SQLModel

import app.models  # noqa: F401

revision = "20260429_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.drop_all(bind=bind)
