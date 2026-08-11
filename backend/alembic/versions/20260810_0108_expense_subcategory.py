"""Add a free-text subcategory to expenses.

Category stays a fixed enum (rent/utilities/supplies/...); subcategory is an
open-ended string ("Milk", "Petrol", "Stationery"...) so tenants aren't
boxed into a hardcoded list. The frontend suggests the 5 most recently used
subcategories per tenant via GET /expenses/subcategories/recent.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260810_0108"
down_revision = "20260810_0107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("expense")}
    if "subcategory" not in columns:
        op.add_column("expense", sa.Column("subcategory", sa.String(), nullable=True))
    indexes = {index["name"] for index in inspector.get_indexes("expense")}
    if "ix_expense_subcategory" not in indexes:
        op.create_index("ix_expense_subcategory", "expense", ["subcategory"])


def downgrade() -> None:
    op.drop_index("ix_expense_subcategory", table_name="expense")
    op.drop_column("expense", "subcategory")
