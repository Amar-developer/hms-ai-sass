"""Add actor name/email snapshot to audit events and a document_comment table.

Powers an ERPNext-style "Activity" feed (create/update/status-change entries
attributed to the acting user's real name + email) plus a lightweight
comments box, both keyed by (resource_type, resource_id) so they can be
shown on any document's detail page.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260707_0073"
down_revision = "20260706_0072"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing = _columns("auditevent")
    if "actor_name" not in existing:
        op.add_column(
            "auditevent", sa.Column("actor_name", sa.String(length=160), nullable=True)
        )
    if "actor_email" not in existing:
        op.add_column(
            "auditevent",
            sa.Column("actor_email", sa.String(length=220), nullable=True),
        )

    if "documentcomment" not in _tables():
        op.create_table(
            "documentcomment",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "tenant_id", sa.String(), sa.ForeignKey("tenant.id"), nullable=False
            ),
            sa.Column(
                "branch_id", sa.String(), sa.ForeignKey("branch.id"), nullable=True
            ),
            sa.Column("resource_type", sa.String(length=80), nullable=False),
            sa.Column("resource_id", sa.String(length=120), nullable=False),
            sa.Column(
                "author_user_id", sa.String(), sa.ForeignKey("user.id"), nullable=False
            ),
            sa.Column("author_name", sa.String(length=160), nullable=True),
            sa.Column("author_email", sa.String(length=220), nullable=True),
            sa.Column("body", sa.String(length=4000), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_documentcomment_tenant_id", "documentcomment", ["tenant_id"]
        )
        op.create_index(
            "ix_documentcomment_branch_id", "documentcomment", ["branch_id"]
        )
        op.create_index(
            "ix_documentcomment_resource_type", "documentcomment", ["resource_type"]
        )
        op.create_index(
            "ix_documentcomment_resource_id", "documentcomment", ["resource_id"]
        )
        op.create_index(
            "ix_documentcomment_author_user_id", "documentcomment", ["author_user_id"]
        )
        op.create_index(
            "ix_documentcomment_created_at", "documentcomment", ["created_at"]
        )


def downgrade() -> None:
    if "documentcomment" in _tables():
        op.drop_table("documentcomment")
    existing = _columns("auditevent")
    if "actor_email" in existing:
        op.drop_column("auditevent", "actor_email")
    if "actor_name" in existing:
        op.drop_column("auditevent", "actor_name")
