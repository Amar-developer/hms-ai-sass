"""add persistent error logs and role permissions

Revision ID: 20260716_0080
Revises: 20260716_0079
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "20260716_0080"
down_revision = "20260716_0079"
branch_labels = None
depends_on = None


PERMISSIONS = (
    ("perm_error_logs_read", "error_logs.read", "Error Logs Read"),
    ("perm_error_logs_manage", "error_logs.manage", "Error Logs Manage"),
)

ERROR_LOG_INDEXES = (
    *(
        (f"ix_errorlog_{column}", (column,))
        for column in (
            "tenant_id",
            "branch_id",
            "user_id",
            "source",
            "level",
            "category",
            "event",
            "module",
            "route",
            "status_code",
            "request_id",
            "fingerprint",
            "is_resolved",
            "resolved_by_user_id",
            "first_seen_at",
            "last_seen_at",
            "created_at",
        )
    ),
    (
        "ix_errorlog_tenant_resolved_last_seen",
        ("tenant_id", "is_resolved", "last_seen_at"),
    ),
)


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    # The legacy initial migration creates every table from the *current*
    # SQLModel metadata. On a new database that means errorlog already exists
    # by the time this revision is reached. Upgraded databases still need this
    # revision to create it, so keep the migration safe for both paths.
    table_exists = "errorlog" in _tables()
    if not table_exists:
        op.create_table(
            "errorlog",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=True),
            sa.Column("branch_id", sa.String(), nullable=True),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("source", sa.String(length=40), nullable=False),
            sa.Column("level", sa.String(length=20), nullable=False),
            sa.Column("category", sa.String(length=60), nullable=False),
            sa.Column("event", sa.String(length=160), nullable=False),
            sa.Column("message", sa.String(length=4000), nullable=False),
            sa.Column("module", sa.String(length=120), nullable=True),
            sa.Column("route", sa.String(length=500), nullable=True),
            sa.Column("method", sa.String(length=12), nullable=True),
            sa.Column("status_code", sa.Integer(), nullable=True),
            sa.Column("request_id", sa.String(length=100), nullable=True),
            sa.Column("stack_trace", sa.String(length=12000), nullable=True),
            sa.Column("metadata_json", sa.String(length=8000), nullable=False),
            sa.Column("fingerprint", sa.String(length=64), nullable=False),
            sa.Column("occurrence_count", sa.Integer(), nullable=False),
            sa.Column("is_resolved", sa.Boolean(), nullable=False),
            sa.Column("resolution_note", sa.String(length=2000), nullable=True),
            sa.Column("resolved_by_user_id", sa.String(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["branch_id"], ["branch.id"]),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    existing_indexes = _indexes("errorlog") if table_exists else set()
    for index_name, columns in ERROR_LOG_INDEXES:
        if index_name not in existing_indexes:
            op.create_index(index_name, "errorlog", list(columns))

    for permission_id, key, description in PERMISSIONS:
        op.execute(
            f"""
            INSERT INTO permission (id, key, description)
            SELECT '{permission_id}', '{key}', '{description}'
            WHERE NOT EXISTS (SELECT 1 FROM permission WHERE key = '{key}')
            """
        )

    op.execute(
        """
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        JOIN permission ON permission.key IN ('error_logs.read', 'error_logs.manage')
        WHERE (
            role.key IN ('tenant_admin', 'super_admin')
            OR lower(role.name) IN ('tenant admin', 'super admin')
        )
        AND NOT EXISTS (
            SELECT 1 FROM rolepermission existing
            WHERE existing.role_id = role.id
              AND existing.permission_id = permission.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM rolepermission
        WHERE permission_id IN (
            SELECT id FROM permission
            WHERE key IN ('error_logs.read', 'error_logs.manage')
        )
        """
    )
    op.execute(
        "DELETE FROM permission WHERE key IN ('error_logs.read', 'error_logs.manage')"
    )
    op.drop_index("ix_errorlog_tenant_resolved_last_seen", table_name="errorlog")
    for column in reversed(
        (
            "tenant_id",
            "branch_id",
            "user_id",
            "source",
            "level",
            "category",
            "event",
            "module",
            "route",
            "status_code",
            "request_id",
            "fingerprint",
            "is_resolved",
            "resolved_by_user_id",
            "first_seen_at",
            "last_seen_at",
            "created_at",
        )
    ):
        op.drop_index(op.f(f"ix_errorlog_{column}"), table_name="errorlog")
    op.drop_table("errorlog")
