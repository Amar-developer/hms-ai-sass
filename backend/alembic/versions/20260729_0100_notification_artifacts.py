"""Pin notification deliveries to immutable document artifacts."""

import sqlalchemy as sa
from alembic import op


revision = "20260729_0100"
down_revision = "20260729_0099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("notificationevent")}
    if "artifact_file_id" not in columns:
        op.add_column(
            "notificationevent",
            sa.Column(
                "artifact_file_id",
                sa.String(),
                sa.ForeignKey("filedocument.id"),
                nullable=True,
            ),
        )
    if "artifact_version" not in columns:
        op.add_column(
            "notificationevent",
            sa.Column("artifact_version", sa.Integer(), nullable=True),
        )
    indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes("notificationevent")
    }
    if "ix_notificationevent_artifact_file_id" not in indexes:
        op.create_index(
            "ix_notificationevent_artifact_file_id",
            "notificationevent",
            ["artifact_file_id"],
        )
    file_indexes = {
        index["name"] for index in sa.inspect(bind).get_indexes("filedocument")
    }
    if "uq_active_final_invoice_artifact" not in file_indexes:
        op.create_index(
            "uq_active_final_invoice_artifact",
            "filedocument",
            [
                "tenant_id",
                "attached_to_doctype",
                "attached_to_name",
                "attached_to_field",
            ],
            unique=True,
            postgresql_where=sa.text(
                "is_active = true AND artifact_type = 'final' "
                "AND attached_to_doctype = 'Invoice'"
            ),
            sqlite_where=sa.text(
                "is_active = 1 AND artifact_type = 'final' "
                "AND attached_to_doctype = 'Invoice'"
            ),
        )


def downgrade() -> None:
    op.drop_index("uq_active_final_invoice_artifact", table_name="filedocument")
    op.drop_index(
        "ix_notificationevent_artifact_file_id", table_name="notificationevent"
    )
    op.drop_column("notificationevent", "artifact_version")
    op.drop_column("notificationevent", "artifact_file_id")
