"""Indexing improvements: missing is_active indexes and composite indexes

Adds an index to User.is_active (queried on every login) and a handful of
sibling is_active columns that were missing it for no apparent reason, plus
composite indexes on Appointment and Invoice matching the actual
tenant_id + branch_id (+ date) filter/sort shape used by the front-desk daily
view and invoice listing/report queries.

Revision ID: 20260714_0076
Revises: 20260713_0075
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa

revision = "20260714_0076"
down_revision = "20260713_0075"
branch_labels = None
depends_on = None


def _create_index_if_missing(
    index_name: str, table_name: str, columns: list[str]
) -> None:
    bind = op.get_bind()
    existing = {idx["name"] for idx in sa.inspect(bind).get_indexes(table_name)}
    if index_name not in existing:
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_index_if_present(index_name: str, table_name: str) -> None:
    bind = op.get_bind()
    existing = {idx["name"] for idx in sa.inspect(bind).get_indexes(table_name)}
    if index_name in existing:
        op.drop_index(index_name, table_name=table_name)


def upgrade() -> None:
    _create_index_if_missing(op.f("ix_user_is_active"), "user", ["is_active"])
    _create_index_if_missing(op.f("ix_branch_is_active"), "branch", ["is_active"])
    _create_index_if_missing(
        op.f("ix_department_is_active"), "department", ["is_active"]
    )
    _create_index_if_missing(
        op.f("ix_subscriptionplan_is_active"), "subscriptionplan", ["is_active"]
    )
    _create_index_if_missing(
        op.f("ix_tenantsubscription_is_active"), "tenantsubscription", ["is_active"]
    )
    _create_index_if_missing(
        "ix_appointment_tenant_branch_date",
        "appointment",
        ["tenant_id", "branch_id", "appointment_date"],
    )
    _create_index_if_missing(
        "ix_invoice_tenant_branch_created_at",
        "invoice",
        ["tenant_id", "branch_id", "created_at"],
    )


def downgrade() -> None:
    _drop_index_if_present("ix_invoice_tenant_branch_created_at", "invoice")
    _drop_index_if_present("ix_appointment_tenant_branch_date", "appointment")
    _drop_index_if_present(
        op.f("ix_tenantsubscription_is_active"), "tenantsubscription"
    )
    _drop_index_if_present(op.f("ix_subscriptionplan_is_active"), "subscriptionplan")
    _drop_index_if_present(op.f("ix_department_is_active"), "department")
    _drop_index_if_present(op.f("ix_branch_is_active"), "branch")
    _drop_index_if_present(op.f("ix_user_is_active"), "user")
