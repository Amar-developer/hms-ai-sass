"""Track patient membership invoices and usage discounts."""

from alembic import op
import sqlalchemy as sa

revision = "20260521_0036"
down_revision = "20260521_0035"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _indexes(table_name: str) -> set[str]:
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def _add(table_name: str, column_name: str, column: sa.Column) -> None:
    if table_name in _tables() and column_name not in _columns(table_name):
        op.add_column(table_name, column)


def _index(name: str, table_name: str, columns: list[str]) -> None:
    if table_name in _tables() and name not in _indexes(table_name):
        op.create_index(name, table_name, columns)


def _drop_index(name: str, table_name: str) -> None:
    if table_name in _tables() and name in _indexes(table_name):
        op.drop_index(name, table_name=table_name)


def _drop_column(table_name: str, column_name: str) -> None:
    if table_name in _tables() and column_name in _columns(table_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    _add(
        "invoice",
        "patient_subscription_enrollment_id",
        sa.Column("patient_subscription_enrollment_id", sa.String(), nullable=True),
    )
    _add(
        "invoice",
        "patient_subscription_plan_id",
        sa.Column("patient_subscription_plan_id", sa.String(), nullable=True),
    )
    _add(
        "invoice",
        "membership_discount_amount",
        sa.Column(
            "membership_discount_amount",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    _index(
        "ix_invoice_patient_subscription_enrollment_id",
        "invoice",
        ["patient_subscription_enrollment_id"],
    )
    _index(
        "ix_invoice_patient_subscription_plan_id",
        "invoice",
        ["patient_subscription_plan_id"],
    )
    _add(
        "patientsubscriptionenrollment",
        "purchase_invoice_id",
        sa.Column("purchase_invoice_id", sa.String(), nullable=True),
    )
    _index(
        "ix_patientsubscriptionenrollment_purchase_invoice_id",
        "patientsubscriptionenrollment",
        ["purchase_invoice_id"],
    )


def downgrade() -> None:
    _drop_index(
        "ix_patientsubscriptionenrollment_purchase_invoice_id",
        "patientsubscriptionenrollment",
    )
    _drop_column("patientsubscriptionenrollment", "purchase_invoice_id")
    _drop_index("ix_invoice_patient_subscription_plan_id", "invoice")
    _drop_index("ix_invoice_patient_subscription_enrollment_id", "invoice")
    _drop_column("invoice", "membership_discount_amount")
    _drop_column("invoice", "patient_subscription_plan_id")
    _drop_column("invoice", "patient_subscription_enrollment_id")
