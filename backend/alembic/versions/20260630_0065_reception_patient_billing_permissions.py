"""Grant receptionist patient billing read permissions."""

from alembic import op


revision = "20260630_0065"
down_revision = "20260629_0064"
branch_labels = None
depends_on = None


PERMISSION_KEYS = (
    "patient_subscriptions.read",
    "billing.read",
    "invoices.read",
)


def upgrade() -> None:
    for key in PERMISSION_KEYS:
        op.execute(
            f"""
            INSERT INTO permission (id, key, description)
            SELECT 'perm_' || replace(replace('{key}', '.', '_'), '-', '_'),
                   '{key}',
                   '{key}'
            WHERE NOT EXISTS (
                SELECT 1 FROM permission WHERE key = '{key}'
            )
            """
        )

    op.execute(
        """
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        JOIN permission
          ON permission.key IN (
            'patient_subscriptions.read',
            'billing.read',
            'invoices.read'
          )
        WHERE (
            role.key IN ('reception', 'receptionist')
            OR role.key LIKE '%receptionist%'
            OR lower(role.name) LIKE '%receptionist%'
            OR lower(role.name) LIKE '%reception%'
        )
          AND NOT EXISTS (
            SELECT 1
            FROM rolepermission existing
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
            SELECT id
            FROM permission
            WHERE key IN (
              'patient_subscriptions.read',
              'billing.read',
              'invoices.read'
            )
        )
          AND role_id IN (
            SELECT id
            FROM role
            WHERE (
                key IN ('reception', 'receptionist')
                OR key LIKE '%receptionist%'
                OR lower(name) LIKE '%receptionist%'
                OR lower(name) LIKE '%reception%'
            )
          )
        """
    )
