"""add durable comment mentions

Revision ID: 20260719_0082
Revises: 20260719_0081
Create Date: 2026-07-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20260719_0082"
down_revision = "20260719_0081"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _indexes(table_name: str) -> set[str]:
    if table_name not in _tables():
        return set()
    return {row["name"] for row in sa.inspect(op.get_bind()).get_indexes(table_name)}


def upgrade() -> None:
    if "documentcommentmention" not in _tables():
        op.create_table(
            "documentcommentmention",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("comment_id", sa.String(), nullable=False),
            sa.Column("mentioned_user_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.ForeignKeyConstraint(["comment_id"], ["documentcomment.id"]),
            sa.ForeignKeyConstraint(["mentioned_user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "comment_id",
                "mentioned_user_id",
                name="uq_documentcommentmention_comment_user",
            ),
        )
    existing = _indexes("documentcommentmention")
    for name, columns in {
        "ix_documentcommentmention_tenant_id": ["tenant_id"],
        "ix_documentcommentmention_comment_id": ["comment_id"],
        "ix_documentcommentmention_mentioned_user_id": ["mentioned_user_id"],
        "ix_documentcommentmention_created_at": ["created_at"],
    }.items():
        if name not in existing:
            op.create_index(name, "documentcommentmention", columns)


def downgrade() -> None:
    if "documentcommentmention" in _tables():
        op.drop_table("documentcommentmention")
