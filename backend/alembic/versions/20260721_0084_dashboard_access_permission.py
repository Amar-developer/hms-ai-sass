"""add dashboard access action permission

Revision ID: 20260721_0084
Revises: 20260721_0083
Create Date: 2026-07-21

Sidebar modules now require read plus another action. Existing dashboard roles
receive the access action so this navigation rule does not remove their current
dashboard entry; administrators may remove it afterward like any other action.
"""

from alembic import op


revision = "20260721_0084"
down_revision = "20260721_0083"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO permission (id, key, description)
        SELECT 'perm_dashboard_access', 'dashboard.access',
               'Dashboard / Overview Access'
        WHERE NOT EXISTS (
            SELECT 1 FROM permission WHERE key = 'dashboard.access'
        )
        """
    )
    op.execute(
        """
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT rolepermission.role_id, access_permission.id, CURRENT_TIMESTAMP
        FROM rolepermission
        JOIN permission read_permission
          ON read_permission.id = rolepermission.permission_id
         AND read_permission.key = 'dashboard.read'
        JOIN permission access_permission
          ON access_permission.key = 'dashboard.access'
        WHERE NOT EXISTS (
            SELECT 1 FROM rolepermission existing
            WHERE existing.role_id = rolepermission.role_id
              AND existing.permission_id = access_permission.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM rolepermission
        WHERE permission_id IN (
            SELECT id FROM permission WHERE key = 'dashboard.access'
        )
        """
    )
    op.execute("DELETE FROM permission WHERE key = 'dashboard.access'")
