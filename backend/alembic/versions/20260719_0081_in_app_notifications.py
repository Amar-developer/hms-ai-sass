"""add recipient-scoped in-app notifications and product announcements

Revision ID: 20260719_0081
Revises: 20260716_0080
Create Date: 2026-07-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260719_0081"
down_revision = "20260716_0080"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {row["name"] for row in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _create_indexes(table_name: str, definitions: dict[str, list[str]]) -> None:
    existing = _indexes(table_name)
    for name, columns in definitions.items():
        if name not in existing:
            op.create_index(name, table_name, columns)


def upgrade() -> None:
    if "inappnotification" not in _tables():
        op.create_table(
            "inappnotification",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=True),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("department_id", sa.String(), nullable=True),
            sa.Column("recipient_user_id", sa.String(), nullable=False),
            sa.Column("category", sa.String(length=40), nullable=False),
            sa.Column("event_type", sa.String(length=100), nullable=False),
            sa.Column("priority", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("message", sa.String(length=2000), nullable=False),
            sa.Column("action_module", sa.String(length=80), nullable=True),
            sa.Column("resource_type", sa.String(length=80), nullable=True),
            sa.Column("resource_id", sa.String(length=120), nullable=True),
            sa.Column("metadata_json", sa.String(length=8000), nullable=False),
            sa.Column("dedupe_key", sa.String(length=240), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["department_id"], ["department.id"]),
            sa.ForeignKeyConstraint(["recipient_user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "recipient_user_id",
                "dedupe_key",
                name="uq_inappnotification_recipient_dedupe",
            ),
        )
    _create_indexes(
        "inappnotification",
        {
            "ix_inappnotification_tenant_id": ["tenant_id"],
            "ix_inappnotification_branch_id": ["branch_id"],
            "ix_inappnotification_department_id": ["department_id"],
            "ix_inappnotification_recipient_user_id": ["recipient_user_id"],
            "ix_inappnotification_category": ["category"],
            "ix_inappnotification_event_type": ["event_type"],
            "ix_inappnotification_priority": ["priority"],
            "ix_inappnotification_resource_type": ["resource_type"],
            "ix_inappnotification_resource_id": ["resource_id"],
            "ix_inappnotification_is_read": ["is_read"],
            "ix_inappnotification_read_at": ["read_at"],
            "ix_inappnotification_archived_at": ["archived_at"],
            "ix_inappnotification_created_by_user_id": ["created_by_user_id"],
            "ix_inappnotification_created_at": ["created_at"],
            "ix_inappnotification_expires_at": ["expires_at"],
            "ix_inappnotification_user_read_created": [
                "recipient_user_id",
                "is_read",
                "created_at",
            ],
        },
    )

    if "productannouncement" not in _tables():
        op.create_table(
            "productannouncement",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=True),
            sa.Column("category", sa.String(length=40), nullable=False),
            sa.Column("priority", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("message", sa.String(length=4000), nullable=False),
            sa.Column("version", sa.String(length=60), nullable=True),
            sa.Column("module_key", sa.String(length=100), nullable=True),
            sa.Column("target_user_type", sa.String(length=60), nullable=True),
            sa.Column("target_permission", sa.String(length=120), nullable=True),
            sa.Column("action_module", sa.String(length=80), nullable=True),
            sa.Column("published_by_user_id", sa.String(), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["published_by_user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_indexes(
        "productannouncement",
        {
            "ix_productannouncement_tenant_id": ["tenant_id"],
            "ix_productannouncement_category": ["category"],
            "ix_productannouncement_priority": ["priority"],
            "ix_productannouncement_version": ["version"],
            "ix_productannouncement_module_key": ["module_key"],
            "ix_productannouncement_target_user_type": ["target_user_type"],
            "ix_productannouncement_target_permission": ["target_permission"],
            "ix_productannouncement_published_by_user_id": ["published_by_user_id"],
            "ix_productannouncement_published_at": ["published_at"],
            "ix_productannouncement_expires_at": ["expires_at"],
            "ix_productannouncement_is_active": ["is_active"],
        },
    )


def downgrade() -> None:
    if "productannouncement" in _tables():
        op.drop_table("productannouncement")
    if "inappnotification" in _tables():
        op.drop_table("inappnotification")
