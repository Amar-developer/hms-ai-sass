"""Add encrypted tenant integration credential storage.

Revision ID: 20260723_0088
Revises: 20260722_0087
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260723_0088"
down_revision: str | None = "20260722_0087"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    if "tenantintegrationplugin" not in _tables():
        op.create_table(
            "tenantintegrationplugin",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("plugin_key", sa.String(length=120), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("config_json", sa.Text(), nullable=False),
            sa.Column("secret_ciphertext", sa.String(length=4096), nullable=True),
            sa.Column("secret_last_four", sa.String(length=4), nullable=True),
            sa.Column("created_by_user_id", sa.String(), nullable=True),
            sa.Column("updated_by_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "tenant_id", "plugin_key", name="uq_tenant_integration_plugin"
            ),
        )
        op.create_index(
            "ix_tenantintegrationplugin_tenant_id",
            "tenantintegrationplugin",
            ["tenant_id"],
        )
        op.create_index(
            "ix_tenantintegrationplugin_plugin_key",
            "tenantintegrationplugin",
            ["plugin_key"],
        )
        op.create_index(
            "ix_tenantintegrationplugin_enabled",
            "tenantintegrationplugin",
            ["enabled"],
        )
        return

    columns = _columns("tenantintegrationplugin")
    if "secret_ciphertext" not in columns:
        op.add_column(
            "tenantintegrationplugin",
            sa.Column("secret_ciphertext", sa.String(length=4096), nullable=True),
        )
    if "secret_last_four" not in columns:
        op.add_column(
            "tenantintegrationplugin",
            sa.Column("secret_last_four", sa.String(length=4), nullable=True),
        )


def downgrade() -> None:
    if "tenantintegrationplugin" not in _tables():
        return
    columns = _columns("tenantintegrationplugin")
    if "secret_last_four" in columns:
        op.drop_column("tenantintegrationplugin", "secret_last_four")
    if "secret_ciphertext" in columns:
        op.drop_column("tenantintegrationplugin", "secret_ciphertext")
