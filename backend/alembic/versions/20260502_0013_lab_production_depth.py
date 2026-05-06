"""lab production depth

Revision ID: 20260502_0013
Revises: 20260502_0012
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260502_0013"
down_revision = "20260502_0012"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _add(table: str, name: str, column) -> None:
    if name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    existing = _tables()
    if "labtestcatalog" not in existing:
        op.create_table(
            "labtestcatalog",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("name", sa.String(length=220), nullable=False),
            sa.Column("department", sa.String(length=120), nullable=True),
            sa.Column("sample_type", sa.String(length=120), nullable=True),
            sa.Column("default_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("turnaround_minutes", sa.Integer(), nullable=True),
            sa.Column("instructions", sa.String(length=1000), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_labtestcatalog_tenant_id", "labtestcatalog", ["tenant_id"])
        op.create_index("ix_labtestcatalog_branch_id", "labtestcatalog", ["branch_id"])
        op.create_index("ix_labtestcatalog_code", "labtestcatalog", ["code"])
        op.create_index("ix_labtestcatalog_name", "labtestcatalog", ["name"])
    if "labtestpackage" not in existing:
        op.create_table(
            "labtestpackage",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("name", sa.String(length=220), nullable=False),
            sa.Column("description", sa.String(length=1000), nullable=True),
            sa.Column("package_price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_labtestpackage_tenant_id", "labtestpackage", ["tenant_id"])
        op.create_index("ix_labtestpackage_branch_id", "labtestpackage", ["branch_id"])
        op.create_index("ix_labtestpackage_code", "labtestpackage", ["code"])
        op.create_index("ix_labtestpackage_name", "labtestpackage", ["name"])
    if "labtestpackageitem" not in existing:
        op.create_table(
            "labtestpackageitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("package_id", sa.String(), nullable=False),
            sa.Column("test_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_labtestpackageitem_tenant_id", "labtestpackageitem", ["tenant_id"])
        op.create_index("ix_labtestpackageitem_package_id", "labtestpackageitem", ["package_id"])
        op.create_index("ix_labtestpackageitem_test_id", "labtestpackageitem", ["test_id"])
    if "labresulttemplate" not in existing:
        op.create_table(
            "labresulttemplate",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("test_id", sa.String(), nullable=True),
            sa.Column("name", sa.String(length=220), nullable=False),
            sa.Column("content_json", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_labresulttemplate_tenant_id", "labresulttemplate", ["tenant_id"])
        op.create_index("ix_labresulttemplate_test_id", "labresulttemplate", ["test_id"])
        op.create_index("ix_labresulttemplate_name", "labresulttemplate", ["name"])
    if "laborderitem" not in existing:
        op.create_table(
            "laborderitem",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("lab_order_id", sa.String(), nullable=False),
            sa.Column("test_id", sa.String(), nullable=True),
            sa.Column("package_id", sa.String(), nullable=True),
            sa.Column("test_name", sa.String(length=220), nullable=False),
            sa.Column("sample_type", sa.String(length=120), nullable=True),
            sa.Column("price", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_laborderitem_tenant_id", "laborderitem", ["tenant_id"])
        op.create_index("ix_laborderitem_branch_id", "laborderitem", ["branch_id"])
        op.create_index("ix_laborderitem_lab_order_id", "laborderitem", ["lab_order_id"])
    if "labsample" not in existing:
        op.create_table(
            "labsample",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False),
            sa.Column("lab_order_id", sa.String(), nullable=False),
            sa.Column("barcode", sa.String(length=120), nullable=False),
            sa.Column("sample_type", sa.String(length=120), nullable=True),
            sa.Column("collected_by_user_id", sa.String(), nullable=True),
            sa.Column("collected_at", sa.DateTime(), nullable=False),
            sa.Column("notes", sa.String(length=1000), nullable=True),
        )
        op.create_index("ix_labsample_tenant_id", "labsample", ["tenant_id"])
        op.create_index("ix_labsample_branch_id", "labsample", ["branch_id"])
        op.create_index("ix_labsample_lab_order_id", "labsample", ["lab_order_id"])
        op.create_index("ix_labsample_barcode", "labsample", ["barcode"])
    _add("labresult", "template_id", sa.Column("template_id", sa.String(), nullable=True))
    _add("labresult", "report_file_name", sa.Column("report_file_name", sa.String(length=220), nullable=True))


def downgrade() -> None:
    for table in [
        "labsample",
        "laborderitem",
        "labresulttemplate",
        "labtestpackageitem",
        "labtestpackage",
        "labtestcatalog",
    ]:
        if table in _tables():
            op.drop_table(table)
    for name in ["report_file_name", "template_id"]:
        if name in _columns("labresult"):
            op.drop_column("labresult", name)
