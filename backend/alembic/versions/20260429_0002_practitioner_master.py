"""practitioner master

Revision ID: 20260429_0002
Revises: 20260429_0001
Create Date: 2026-04-29
"""

from alembic import op
from sqlalchemy import inspect
from sqlmodel import SQLModel

import app.models  # noqa: F401

revision = "20260429_0002"
down_revision = "20260429_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    for table in (
        SQLModel.metadata.tables["practitioner"],
        SQLModel.metadata.tables["practitionerbranch"],
        SQLModel.metadata.tables["practitionerdepartment"],
    ):
        if table.name not in existing:
            table.create(bind=bind)


def downgrade() -> None:
    op.drop_table("practitionerdepartment")
    op.drop_table("practitionerbranch")
    op.drop_table("practitioner")
