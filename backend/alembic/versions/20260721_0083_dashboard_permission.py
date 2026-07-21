"""add explicit dashboard role permission

Revision ID: 20260721_0083
Revises: 20260719_0082
Create Date: 2026-07-21

The dashboard previously appeared only as a side effect of tenant-admin
permissions. Grant the new read key to every existing role to preserve current
access; administrators can then remove it from individual custom roles.
"""

from alembic import op


revision = "20260721_0083"
down_revision = "20260719_0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permission (id, key, description)
        SELECT 'perm_dashboard_read', 'dashboard.read', 'Dashboard / Overview Read'
        WHERE NOT EXISTS (
            SELECT 1 FROM permission WHERE key = 'dashboard.read'
        )
        """
    )
    op.execute(
        """
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        JOIN permission ON permission.key = 'dashboard.read'
        WHERE NOT EXISTS (
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
            SELECT id FROM permission WHERE key = 'dashboard.read'
        )
        """
    )
    op.execute("DELETE FROM permission WHERE key = 'dashboard.read'")
