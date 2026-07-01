"""practitioner schedule availability

Revision ID: 20260429_0003
Revises: 20260429_0002
Create Date: 2026-04-29
"""

from alembic import op
from sqlalchemy import inspect
from sqlmodel import SQLModel

import app.models  # noqa: F401

revision = "20260429_0003"
down_revision = "20260429_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    for table in (
        SQLModel.metadata.tables["practitionerschedule"],
        SQLModel.metadata.tables["practitionerleave"],
        SQLModel.metadata.tables["practitionerroomassignment"],
    ):
        if table.name not in existing:
            table.create(bind=bind)


def downgrade() -> None:
    op.drop_table("practitionerroomassignment")
    op.drop_table("practitionerleave")
    op.drop_table("practitionerschedule")
