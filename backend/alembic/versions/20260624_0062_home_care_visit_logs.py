"""Add home care actual visit logs."""

import sqlalchemy as sa
from alembic import op


revision = "20260624_0062"
down_revision = "20260624_0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "homecarevisitlog",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("booking_id", sa.String(), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("assigned_staff_user_id", sa.String(), nullable=True),
        sa.Column("assigned_staff_name", sa.String(length=160), nullable=True),
        sa.Column("staff_type", sa.String(length=80), nullable=True),
        sa.Column("service_id", sa.String(), nullable=True),
        sa.Column(
            "service_category",
            sa.String(length=80),
            nullable=False,
            server_default="home_care_service",
        ),
        sa.Column("description", sa.String(length=260), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.String(length=40),
            nullable=False,
            server_default="completed",
        ),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    for column in (
        "tenant_id",
        "booking_id",
        "visit_date",
        "assigned_staff_user_id",
        "assigned_staff_name",
        "staff_type",
        "service_id",
        "service_category",
        "status",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
    ):
        op.create_index(f"ix_homecarevisitlog_{column}", "homecarevisitlog", [column])


def downgrade() -> None:
    op.drop_table("homecarevisitlog")
