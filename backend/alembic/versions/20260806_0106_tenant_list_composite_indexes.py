"""Add composite (tenant_id, sort column) indexes for tenant-wide list queries.

Every list endpoint in this codebase filters on tenant_id and then orders by a
timestamp. Until now those two columns only had *separate* single-column
indexes, which Postgres cannot combine usefully for that shape: within one
tenant the tenant_id index has almost no selectivity (every row of that tenant
matches), so the planner either bitmap-ANDs and then sorts the whole tenant
partition, or walks the created_at index backwards filtering out other
tenants. Both degrade linearly as these append-only tables grow.

A composite (tenant_id, <sort column> DESC) index makes the tenant's slice
directly seekable *already in sort order*, so the paired LIMIT added in the
same change can stop after N rows instead of materialising the whole tenant
history.

Index-only, no data or column changes.
"""

import sqlalchemy as sa
from alembic import op


revision = "20260806_0106"
down_revision = "20260805_0105"
branch_labels = None
depends_on = None


# (index name, table, ordered columns as raw SQL expressions)
_INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "ix_pharmacystockledger_tenant_created",
        "pharmacystockledger",
        ("tenant_id", "created_at DESC"),
    ),
    (
        "ix_pharmacyissue_tenant_created",
        "pharmacyissue",
        ("tenant_id", "created_at DESC"),
    ),
    (
        "ix_laborder_tenant_created",
        "laborder",
        ("tenant_id", "created_at DESC"),
    ),
    (
        "ix_ipadmission_tenant_updated_created",
        "ipadmission",
        ("tenant_id", "updated_at DESC", "created_at DESC"),
    ),
    (
        "ix_notificationevent_tenant_created",
        "notificationevent",
        ("tenant_id", "created_at"),
    ),
)


def _existing_indexes(inspector: sa.Inspector, table: str) -> set[str]:
    if not inspector.has_table(table):
        return set()
    return {index["name"] for index in inspector.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for name, table, columns in _INDEXES:
        if not inspector.has_table(table) or name in _existing_indexes(
            inspector, table
        ):
            continue
        # DESC is expressed as raw SQL text so the index is created in the same
        # order the queries scan it. SQLite accepts this syntax too, so local
        # and CI runs build the same index definition as production.
        op.execute(
            sa.text(
                f"CREATE INDEX {name} ON {table} ({', '.join(columns)})"  # noqa: S608
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for name, table, _columns in _INDEXES:
        if name in _existing_indexes(inspector, table):
            op.drop_index(name, table_name=table)
