"""Strip Tenant-Admin-tier permissions off clinical / front-desk roles.

A Doctor / Lab Technician / Pharmacist / Receptionist role must never hold the
identity, settings, branch, department, supplier, tax, discount, subscription,
audit, or communications-admin permissions that unlock the Tenant Admin
console. Earlier tenants were seeded (or hand-edited) with some of these on
clinical roles, which is why a Doctor could open Users / Roles / Settings. This
migration removes those grants from any role whose key/name matches one of the
four non-admin roles, matching the enforced role matrix.

Idempotent and reversible-as-a-no-op (we do not re-grant on downgrade, since
these permissions were never legitimately part of these roles).
"""

from alembic import op

revision = "20260706_0069"
down_revision = "20260705_0068"
branch_labels = None
depends_on = None


# Permission keys that gate the Tenant Admin console — never valid on a
# clinical or front-desk role.
ADMIN_TIER_KEYS = (
    "identity.users.manage",
    "identity.users.create",
    "identity.users.read",
    "identity.users.edit",
    "identity.users.delete",
    "identity.roles.manage",
    "identity.roles.create",
    "identity.roles.read",
    "identity.roles.edit",
    "identity.roles.delete",
    "settings.manage",
    "settings.create",
    "settings.read",
    "settings.edit",
    "settings.delete",
    "branches.manage",
    "branches.create",
    "branches.read",
    "branches.edit",
    "branches.delete",
    "departments.manage",
    "departments.create",
    "departments.read",
    "departments.edit",
    "departments.delete",
    "suppliers.manage",
    "suppliers.create",
    "suppliers.read",
    "suppliers.edit",
    "suppliers.delete",
    "tax.manage",
    "tax.create",
    "tax.read",
    "tax.edit",
    "tax.delete",
    "discounts.manage",
    "discounts.create",
    "discounts.read",
    "discounts.edit",
    "discounts.delete",
    "patient_subscriptions.manage",
    "patient_subscriptions.create",
    "patient_subscriptions.edit",
    "patient_subscriptions.delete",
    "subscriptions.reports.read",
    "audit.read",
    "audit.export",
    "communications.manage",
    "communications.read",
    "communications.sms.manage",
    "communications.voice.manage",
    "communications.whatsapp.manage",
    "reports.manage",
    "reports.create",
    "reports.edit",
    "reports.delete",
    "reports.export",
    "reports.read",
    "reports.revenue.read",
)

# Role identity fragments for the four non-admin roles. tenant_admin and
# super_admin are deliberately excluded so their full access is untouched.
CLINICAL_ROLE_FRAGMENTS = (
    "doctor",
    "lab_technician",
    "lab technician",
    "labtech",
    "lab tech",
    "pharmacist",
    "receptionist",
    "reception",
)


def upgrade() -> None:
    key_list = ", ".join(f"'{key}'" for key in ADMIN_TIER_KEYS)
    like_clauses = " OR ".join(
        f"role.key LIKE '%{fragment}%' OR lower(role.name) LIKE '%{fragment}%'"
        for fragment in CLINICAL_ROLE_FRAGMENTS
    )
    op.execute(
        f"""
        DELETE FROM rolepermission
        WHERE permission_id IN (
            SELECT id FROM permission WHERE key IN ({key_list})
        )
          AND role_id IN (
            SELECT id FROM role
            WHERE role.key NOT IN ('tenant_admin', 'super_admin')
              AND ({like_clauses})
          )
        """
    )


def downgrade() -> None:
    # These permissions were never a legitimate part of clinical/front-desk
    # roles, so removing them is not restored on downgrade.
    pass
