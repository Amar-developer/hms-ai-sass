"""Add production patient autocomplete indexes."""

from alembic import op


revision = "20260725_0094"
down_revision = "20260724_0093"
branch_labels = None
depends_on = None


SEARCH_COLUMNS = (
    "patient_number",
    "full_name",
    "mobile",
    "alternate_mobile",
    "guardian_name",
    "guardian_mobile",
    "area",
    "address",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for column in SEARCH_COLUMNS:
        op.execute(
            "CREATE INDEX IF NOT EXISTS "
            f"ix_patient_search_{column}_trgm ON patient "
            f"USING gin (lower({column}) gin_trgm_ops)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for column in SEARCH_COLUMNS:
        op.execute(f"DROP INDEX IF EXISTS ix_patient_search_{column}_trgm")
