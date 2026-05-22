"""Track patient membership invoices and usage discounts."""

from alembic import op
import sqlalchemy as sa

revision = "20260521_0036"
down_revision = "20260521_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoice", sa.Column("patient_subscription_enrollment_id", sa.String(), nullable=True))
    op.add_column("invoice", sa.Column("patient_subscription_plan_id", sa.String(), nullable=True))
    op.add_column("invoice", sa.Column("membership_discount_amount", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_invoice_patient_subscription_enrollment_id", "invoice", ["patient_subscription_enrollment_id"])
    op.create_index("ix_invoice_patient_subscription_plan_id", "invoice", ["patient_subscription_plan_id"])
    op.add_column("patientsubscriptionenrollment", sa.Column("purchase_invoice_id", sa.String(), nullable=True))
    op.create_index("ix_patientsubscriptionenrollment_purchase_invoice_id", "patientsubscriptionenrollment", ["purchase_invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_patientsubscriptionenrollment_purchase_invoice_id", table_name="patientsubscriptionenrollment")
    op.drop_column("patientsubscriptionenrollment", "purchase_invoice_id")
    op.drop_index("ix_invoice_patient_subscription_plan_id", table_name="invoice")
    op.drop_index("ix_invoice_patient_subscription_enrollment_id", table_name="invoice")
    op.drop_column("invoice", "membership_discount_amount")
    op.drop_column("invoice", "patient_subscription_plan_id")
    op.drop_column("invoice", "patient_subscription_enrollment_id")
