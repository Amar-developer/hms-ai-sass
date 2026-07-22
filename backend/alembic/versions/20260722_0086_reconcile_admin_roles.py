"""reconcile admin role templates and approval permissions

Revision ID: 20260722_0086
Revises: 20260721_0085
Create Date: 2026-07-22

Older databases could have a primary Super Admin role with only the permission
set available at bootstrap time and no primary Tenant Admin template. Reconcile
both admin roles from the canonical permission table and ensure every customer
tenant has its local Tenant Admin role and user assignment.
"""

from alembic import op


revision = "20260722_0086"
down_revision = "20260721_0085"
branch_labels = None
depends_on = None


NEW_PERMISSION_KEYS = (
    ("billing.refunds.approve", "Billing Refunds Approve"),
    ("invoices.cancel_approve", "Invoices & Receipts Cancel Approve"),
)

PRIMARY_TEMPLATE_ID = "role_tmpl_tenant_admin_0086"
CUSTOMER_ROLE_ID_PREFIX = "role_tenant_admin_0086_"


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
        f"""
        INSERT INTO role (
            id, tenant_id, name, key, is_active, is_global_template,
            is_template_locked, created_at, updated_at
        )
        SELECT '{PRIMARY_TEMPLATE_ID}', tenant.id, 'Tenant Admin',
               'tenant_admin', TRUE, TRUE, FALSE,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM tenant
        WHERE tenant.is_primary = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM role
              WHERE role.tenant_id = tenant.id AND role.key = 'tenant_admin'
          )
        """
    )
    op.execute(
        """
        UPDATE role
        SET name = 'Tenant Admin', is_active = TRUE,
            is_global_template = TRUE, is_template_locked = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE role.key = 'tenant_admin'
          AND role.tenant_id IN (
              SELECT tenant.id FROM tenant WHERE tenant.is_primary = TRUE
          )
        """
    )

    op.execute(
        f"""
        INSERT INTO role (
            id, tenant_id, source_template_role_id, name, key, is_active,
            is_global_template, is_template_locked, created_at, updated_at
        )
        SELECT '{CUSTOMER_ROLE_ID_PREFIX}' || tenant.id,
               tenant.id, template.id, 'Tenant Admin', 'tenant_admin',
               TRUE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM tenant
        JOIN role template
          ON template.key = 'tenant_admin'
         AND template.tenant_id IN (
             SELECT primary_tenant.id FROM tenant primary_tenant
             WHERE primary_tenant.is_primary = TRUE
         )
        WHERE tenant.is_primary = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM role
              WHERE role.tenant_id = tenant.id AND role.key = 'tenant_admin'
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
        WHERE role.key = 'tenant_admin'
          AND permission.key NOT LIKE 'platform.%'
          AND NOT EXISTS (
              SELECT 1 FROM rolepermission existing
              WHERE existing.role_id = role.id
                AND existing.permission_id = permission.id
          )
        """
    )

    op.execute(
        """
        INSERT INTO userrole (user_id, role_id, tenant_id, created_at)
        SELECT app_user.id, role.id, app_user.tenant_id, CURRENT_TIMESTAMP
        FROM "user" AS app_user
        JOIN role
          ON role.tenant_id = app_user.tenant_id AND role.key = 'tenant_admin'
        WHERE app_user.user_type = 'tenant_admin'
          AND app_user.is_super_admin = FALSE
          AND NOT EXISTS (
              SELECT 1 FROM userrole existing
              WHERE existing.user_id = app_user.id
                AND existing.role_id = role.id
          )
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM userrole
        WHERE role_id = '{PRIMARY_TEMPLATE_ID}'
           OR role_id LIKE '{CUSTOMER_ROLE_ID_PREFIX}%'
        """
    )
    op.execute(
        f"""
        DELETE FROM rolepermission
        WHERE role_id = '{PRIMARY_TEMPLATE_ID}'
           OR role_id LIKE '{CUSTOMER_ROLE_ID_PREFIX}%'
        """
    )
    op.execute(
        f"""
        DELETE FROM role
        WHERE id = '{PRIMARY_TEMPLATE_ID}'
           OR id LIKE '{CUSTOMER_ROLE_ID_PREFIX}%'
        """
    )
    for key, _description in NEW_PERMISSION_KEYS:
        op.execute(
            f"""
            DELETE FROM rolepermission
            WHERE permission_id IN (SELECT id FROM permission WHERE key = '{key}')
            """
        )
        op.execute(f"DELETE FROM permission WHERE key = '{key}'")
