"""Add acquisition sources and patient referrers."""

import sqlalchemy as sa
from alembic import op


revision = "20260727_0097"
down_revision = "20260727_0096"
branch_labels = None
depends_on = None


def _add_columns(table_name: str) -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns(table_name)}
    additions = {
        "acquisition_source": sa.Column(
            "acquisition_source",
            sa.String(length=40),
            server_default="direct",
            nullable=False,
        ),
        "referrer_patient_id": sa.Column(
            "referrer_patient_id", sa.String(), nullable=True
        ),
        "referrer_name": sa.Column(
            "referrer_name", sa.String(length=180), nullable=True
        ),
    }
    for name, column in additions.items():
        if name not in columns:
            op.add_column(table_name, column)

    indexes = {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}
    for column_name in ("acquisition_source", "referrer_patient_id"):
        index_name = f"ix_{table_name}_{column_name}"
        if index_name not in indexes:
            op.create_index(index_name, table_name, [column_name])


def upgrade() -> None:
    _add_columns("laborder")
    _add_columns("appointment")


def downgrade() -> None:
    for table_name in ("appointment", "laborder"):
        op.drop_index(f"ix_{table_name}_referrer_patient_id", table_name=table_name)
        op.drop_index(f"ix_{table_name}_acquisition_source", table_name=table_name)
        op.drop_column(table_name, "referrer_name")
        op.drop_column(table_name, "referrer_patient_id")
        op.drop_column(table_name, "acquisition_source")
