"""Seed the expenses permission catalog and backfill Tenant Admin roles.

The `expenses.*` permission keys were added to the Python permission catalog
alongside the Expenses module (migration 20260807_0106) but, like every prior
addition to the catalog (see 20260705_0068, 20260722_0086), the actual
`permission` rows and role grants are never created automatically for
existing installations — Tenant Admin is defined as "every non-platform
permission" (`TENANT_ADMIN_DEFAULT_PERMISSION_KEYS` in
app/modules/identity/services/bootstrap.py), so without this backfill every
tenant created before this migration is missing the new module entirely,
which is why it doesn't appear in the sidebar or unlock the API routes.
"""

from alembic import op

revision = "20260810_0107"
down_revision = "20260807_0106"
branch_labels = None
depends_on = None


NEW_PERMISSION_KEYS = (
    ("expenses.manage", "Expenses Manage"),
    ("expenses.create", "Expenses Create"),
    ("expenses.read", "Expenses Read"),
    ("expenses.approve", "Expenses Approve"),
    ("expenses.delete", "Expenses Delete"),
)


def upgrade() -> None:
    for key, description in NEW_PERMISSION_KEYS:
        permission_id = "perm_" + key.replace(".", "_")
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
        JOIN permission ON permission.key LIKE 'expenses.%'
        WHERE role.key = 'tenant_admin'
          AND NOT EXISTS (
              SELECT 1 FROM rolepermission existing
              WHERE existing.role_id = role.id
                AND existing.permission_id = permission.id
          )
        """
    )

    op.execute(
        """
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        CROSS JOIN permission
        WHERE role.key = 'super_admin'
          AND permission.key LIKE 'expenses.%'
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
            SELECT id FROM permission WHERE key LIKE 'expenses.%'
        )
        """
    )
    for key, _description in NEW_PERMISSION_KEYS:
        op.execute(f"DELETE FROM permission WHERE key = '{key}'")
