"""Add tenant document numbering."""

from alembic import op
import sqlalchemy as sa


revision = "20260525_0040"
down_revision = "20260525_0039"
branch_labels = None
depends_on = None


def _has_column(inspector, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def _add_column_if_missing(inspector, table_name: str, column: sa.Column) -> None:
    if table_name in inspector.get_table_names() and not _has_column(inspector, table_name, column.name):
        op.add_column(table_name, column)
        op.create_index(f"ix_{table_name}_{column.name}", table_name, [column.name])


def _backfill_number(table_name: str, column_name: str, entity_code: str, branch_scoped: bool = False) -> None:
    partition = "row.tenant_id, row.branch_id" if branch_scoped else "row.tenant_id"
    prefix_source = "coalesce(nullif(b.code, ''), nullif(t.name, ''), 'HLC')" if branch_scoped else "coalesce(nullif(t.name, ''), 'HLC')"
    branch_join = "left join branch b on b.id = row.branch_id" if branch_scoped else ""
    op.execute(
        sa.text(
            f"""
            with numbered as (
                select row.id,
                       upper(regexp_replace(left({prefix_source}, 12), '[^A-Za-z0-9]+', '', 'g')) as prefix,
                       row_number() over (partition by {partition} order by row.created_at, row.id) as seq
                from "{table_name}" row
                join tenant t on t.id = row.tenant_id
                {branch_join}
                where row."{column_name}" is null or row."{column_name}" = ''
            )
            update "{table_name}" target
            set "{column_name}" = concat(coalesce(nullif(numbered.prefix, ''), 'HLC'), '-{entity_code}-', lpad(numbered.seq::text, 5, '0'))
            from numbered
            where target.id = numbered.id
            """
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE settingkey ADD VALUE IF NOT EXISTS 'NUMBERING_RULES'")

    if "documentsequence" not in inspector.get_table_names():
        op.create_table(
            "documentsequence",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tenant_id", sa.String(), nullable=False),
            sa.Column("branch_id", sa.String(), nullable=False, server_default=""),
            sa.Column("entity", sa.String(length=80), nullable=False),
            sa.Column("prefix", sa.String(length=40), nullable=False),
            sa.Column("entity_code", sa.String(length=40), nullable=False),
            sa.Column("digits", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("current_value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenant.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("tenant_id", "branch_id", "entity", name="uq_document_sequence_scope_entity"),
        )
        op.create_index("ix_documentsequence_tenant_id", "documentsequence", ["tenant_id"])
        op.create_index("ix_documentsequence_branch_id", "documentsequence", ["branch_id"])
        op.create_index("ix_documentsequence_entity", "documentsequence", ["entity"])
        op.create_index("ix_documentsequence_prefix", "documentsequence", ["prefix"])
        op.create_index("ix_documentsequence_entity_code", "documentsequence", ["entity_code"])
        op.create_index("ix_documentsequence_created_at", "documentsequence", ["created_at"])

    inspector = sa.inspect(bind)
    _add_column_if_missing(inspector, "user", sa.Column("user_number", sa.String(length=60), nullable=True))
    _add_column_if_missing(inspector, "practitioner", sa.Column("practitioner_number", sa.String(length=60), nullable=True))
    _add_column_if_missing(inspector, "laborder", sa.Column("lab_order_number", sa.String(length=60), nullable=True))
    _add_column_if_missing(inspector, "pharmacysupplier", sa.Column("supplier_number", sa.String(length=60), nullable=True))
    _add_column_if_missing(inspector, "pharmacyissue", sa.Column("issue_number", sa.String(length=60), nullable=True))

    if bind.dialect.name == "postgresql":
        _backfill_number("user", "user_number", "USR", True)
        _backfill_number("practitioner", "practitioner_number", "DOC", False)
        _backfill_number("laborder", "lab_order_number", "LAB", True)
        _backfill_number("pharmacysupplier", "supplier_number", "SUP", False)
        _backfill_number("pharmacyissue", "issue_number", "PHM", True)


def downgrade() -> None:
    pass
