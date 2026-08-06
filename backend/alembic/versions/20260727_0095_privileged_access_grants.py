"""Add privileged support access grants."""

import sqlalchemy as sa
from alembic import op


revision = "20260727_0095"
down_revision = "20260725_0094"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "privilegedaccessgrant" in inspector.get_table_names():
        return
    op.create_table(
        "privilegedaccessgrant",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("tenant_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("permission_keys_json", sa.String(), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("granted_by_user_id", sa.String(), nullable=False),
        sa.Column("revoked_by_user_id", sa.String(), nullable=True),
        sa.Column("revoke_reason", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["granted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["revoked_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "tenant_id",
        "user_id",
        "starts_at",
        "expires_at",
        "revoked_at",
        "granted_by_user_id",
        "revoked_by_user_id",
    ):
        op.create_index(
            f"ix_privilegedaccessgrant_{column}",
            "privilegedaccessgrant",
            [column],
        )


def downgrade() -> None:
    op.drop_table("privilegedaccessgrant")
