"""Add tenant-managed patient intelligence content library."""

import sqlalchemy as sa
from alembic import op


revision = "20260812_0114"
down_revision = "20260812_0113"
branch_labels = None
depends_on = None


TABLE = "patientintelligencecontentitem"


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade() -> None:
    if _table_exists(TABLE):
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("content_key", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("language", sa.String(length=20), nullable=False),
        sa.Column("audience_flag_key", sa.String(length=100), nullable=True),
        sa.Column("body_text", sa.String(length=2000), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id", "content_key", name="uq_pi_content_tenant_key"
        ),
    )
    indexes = {
        f"ix_{TABLE}_tenant_id": ["tenant_id"],
        f"ix_{TABLE}_content_key": ["content_key"],
        f"ix_{TABLE}_category": ["category"],
        f"ix_{TABLE}_language": ["language"],
        f"ix_{TABLE}_audience_flag_key": ["audience_flag_key"],
        f"ix_{TABLE}_priority": ["priority"],
        f"ix_{TABLE}_is_enabled": ["is_enabled"],
        f"ix_{TABLE}_created_at": ["created_at"],
        "ix_pi_content_tenant_enabled": ["tenant_id", "is_enabled", "priority"],
    }
    for name, columns in indexes.items():
        if not _index_exists(TABLE, name):
            op.create_index(name, TABLE, columns)


def downgrade() -> None:
    if not _table_exists(TABLE):
        return
    op.drop_table(TABLE)
