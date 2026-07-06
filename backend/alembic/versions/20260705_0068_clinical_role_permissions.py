"""Seed permission catalog additions and clinical role permission sets.

Adds the missing `invoices.cancel_request`, `billing.refunds.request`, and
`service_items.*` permission keys, backfills permission grants for the
Receptionist, Doctor, Lab Technician, and Pharmacist roles across existing
tenants (matched by role key/name, mirroring migration 0065), backfills the
Tenant Admin role with the full non-platform permission set, and creates
global template versions of the four clinical roles on the primary tenant so
future tenants can clone them via `role_template_ids`.
"""

from alembic import op

revision = "20260705_0068"
down_revision = "20260703_0067"
branch_labels = None
depends_on = None


NEW_PERMISSION_KEYS = (
    "invoices.cancel_request",
    "billing.refunds.request",
    "service_items.manage",
    "service_items.create",
    "service_items.read",
    "service_items.edit",
    "service_items.delete",
)

TENANT_ADMIN_NON_PLATFORM_KEYS = (
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
    "files.manage",
    "files.create",
    "files.read",
    "files.edit",
    "files.delete",
    "departments.manage",
    "departments.create",
    "departments.read",
    "departments.edit",
    "departments.delete",
    "branches.manage",
    "branches.create",
    "branches.read",
    "branches.edit",
    "branches.delete",
    "practitioners.manage",
    "practitioners.create",
    "practitioners.read",
    "practitioners.edit",
    "practitioners.delete",
    "scheduling.manage",
    "scheduling.create",
    "scheduling.read",
    "scheduling.edit",
    "scheduling.delete",
    "patients.read",
    "patients.write",
    "patients.create",
    "patients.edit",
    "patients.delete",
    "patient_subscriptions.manage",
    "patient_subscriptions.create",
    "patient_subscriptions.read",
    "patient_subscriptions.edit",
    "patient_subscriptions.delete",
    "appointments.manage",
    "appointments.create",
    "appointments.read",
    "appointments.edit",
    "appointments.delete",
    "appointments.cancel",
    "queue.manage",
    "queue.read",
    "consultations.read",
    "consultations.write",
    "consultations.create",
    "consultations.edit",
    "consultations.sign",
    "billing.manage",
    "billing.read",
    "billing.create",
    "billing.discounts.approve",
    "billing.refunds.manage",
    "billing.refunds.request",
    "invoices.create",
    "invoices.read",
    "invoices.edit",
    "invoices.delete",
    "invoices.cancel_request",
    "payments.manage",
    "payments.create",
    "settlements.read",
    "service_items.manage",
    "service_items.create",
    "service_items.read",
    "service_items.edit",
    "service_items.delete",
    "lab.manage",
    "lab.create",
    "lab.read",
    "lab.edit",
    "lab.delete",
    "lab.results.manage",
    "pharmacy.manage",
    "pharmacy.create",
    "pharmacy.read",
    "pharmacy.edit",
    "pharmacy.delete",
    "pharmacy.dispense",
    "suppliers.manage",
    "suppliers.create",
    "suppliers.read",
    "suppliers.edit",
    "suppliers.delete",
    "ip.manage",
    "ip.create",
    "ip.read",
    "ip.edit",
    "ip.delete",
    "physiotherapy.manage",
    "physiotherapy.create",
    "physiotherapy.read",
    "physiotherapy.edit",
    "physiotherapy.delete",
    "home_care.manage",
    "home_care.create",
    "home_care.read",
    "home_care.edit",
    "home_care.delete",
    "notifications.manage",
    "notifications.create",
    "notifications.read",
    "notifications.edit",
    "notifications.delete",
    "communications.read",
    "communications.manage",
    "communications.whatsapp.manage",
    "communications.sms.manage",
    "communications.voice.manage",
    "ai.assist.manage",
    "ai.assist.use",
    "audit.read",
    "audit.export",
    "reports.read",
    "reports.manage",
    "reports.create",
    "reports.edit",
    "reports.delete",
    "reports.export",
    "reports.revenue.read",
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
)

RECEPTIONIST_KEYS = (
    "patients.create",
    "patients.edit",
    "patients.read",
    "patients.write",
    "appointments.create",
    "appointments.edit",
    "appointments.read",
    "queue.manage",
    "queue.read",
    "practitioners.read",
    "consultations.read",
    "lab.create",
    "physiotherapy.create",
    "home_care.manage",
    "home_care.create",
    "home_care.read",
    "home_care.edit",
    "invoices.create",
    "invoices.read",
    "invoices.cancel_request",
    "payments.create",
    "billing.read",
    "billing.refunds.request",
    "service_items.manage",
    "service_items.create",
    "service_items.read",
    "service_items.edit",
)

DOCTOR_KEYS = (
    "appointments.read",
    "appointments.edit",
    "consultations.read",
    "consultations.write",
    "consultations.create",
    "consultations.edit",
    "consultations.sign",
    "lab.create",
    "lab.read",
    "home_care.create",
    "home_care.read",
    "billing.read",
    "invoices.read",
)

LAB_TECHNICIAN_KEYS = (
    "lab.manage",
    "lab.create",
    "lab.read",
    "lab.edit",
    "lab.results.manage",
    "patients.read",
    "appointments.read",
)

PHARMACIST_KEYS = (
    "pharmacy.manage",
    "pharmacy.create",
    "pharmacy.read",
    "pharmacy.edit",
    "pharmacy.dispense",
    "consultations.read",
    "invoices.create",
    "invoices.read",
    "billing.read",
)

# (role key/name match fragments, template key, template name, permission keys)
ROLE_BACKFILLS = (
    (("tenant_admin",), "tenant_admin", "Tenant Admin", TENANT_ADMIN_NON_PLATFORM_KEYS),
    (
        ("reception", "receptionist"),
        "receptionist",
        "Receptionist",
        RECEPTIONIST_KEYS,
    ),
    (("doctor",), "doctor", "Doctor", DOCTOR_KEYS),
    (
        ("lab_technician", "lab technician", "labtech", "lab tech"),
        "lab_technician",
        "Lab Technician",
        LAB_TECHNICIAN_KEYS,
    ),
    (("pharmacist",), "pharmacist", "Pharmacist", PHARMACIST_KEYS),
)


def _insert_permission(key: str) -> None:
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


def _grant_to_matching_roles(
    name_fragments: tuple[str, ...], keys: tuple[str, ...]
) -> None:
    if not keys:
        return
    key_list = ", ".join(f"'{key}'" for key in keys)
    like_clauses = " OR ".join(
        f"role.key LIKE '%{fragment}%' OR lower(role.name) LIKE '%{fragment}%'"
        for fragment in name_fragments
    )
    op.execute(
        f"""
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        JOIN permission ON permission.key IN ({key_list})
        WHERE ({like_clauses})
          AND NOT EXISTS (
            SELECT 1 FROM rolepermission existing
            WHERE existing.role_id = role.id
              AND existing.permission_id = permission.id
          )
        """
    )


def _upsert_primary_template_role(
    template_key: str, template_name: str, keys: tuple[str, ...]
) -> None:
    role_id_expr = f"'role_tmpl_{template_key}'"
    op.execute(
        f"""
        INSERT INTO role (id, tenant_id, name, key, is_active, is_global_template, is_template_locked, created_at, updated_at)
        SELECT {role_id_expr}, tenant.id, '{template_name}', '{template_key}', TRUE, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM tenant
        WHERE tenant.is_primary = TRUE
          AND NOT EXISTS (
            SELECT 1 FROM role WHERE role.tenant_id = tenant.id AND role.key = '{template_key}'
          )
        """
    )
    key_list = ", ".join(f"'{key}'" for key in keys)
    op.execute(
        f"""
        INSERT INTO rolepermission (role_id, permission_id, created_at)
        SELECT role.id, permission.id, CURRENT_TIMESTAMP
        FROM role
        JOIN tenant ON tenant.id = role.tenant_id AND tenant.is_primary = TRUE
        JOIN permission ON permission.key IN ({key_list})
        WHERE role.key = '{template_key}'
          AND NOT EXISTS (
            SELECT 1 FROM rolepermission existing
            WHERE existing.role_id = role.id
              AND existing.permission_id = permission.id
          )
        """
    )


def upgrade() -> None:
    for key in NEW_PERMISSION_KEYS:
        _insert_permission(key)

    for name_fragments, template_key, template_name, keys in ROLE_BACKFILLS:
        _grant_to_matching_roles(name_fragments, keys)
        if template_key != "tenant_admin":
            _upsert_primary_template_role(template_key, template_name, keys)


def _revoke_from_matching_roles(
    name_fragments: tuple[str, ...], keys: tuple[str, ...]
) -> None:
    if not keys:
        return
    key_list = ", ".join(f"'{key}'" for key in keys)
    like_clauses = " OR ".join(
        f"role.key LIKE '%{fragment}%' OR lower(role.name) LIKE '%{fragment}%'"
        for fragment in name_fragments
    )
    op.execute(
        f"""
        DELETE FROM rolepermission
        WHERE permission_id IN (SELECT id FROM permission WHERE key IN ({key_list}))
          AND role_id IN (SELECT id FROM role WHERE {like_clauses})
        """
    )


def downgrade() -> None:
    for name_fragments, template_key, _template_name, keys in ROLE_BACKFILLS:
        _revoke_from_matching_roles(name_fragments, keys)
        if template_key != "tenant_admin":
            op.execute(
                f"""
                DELETE FROM rolepermission
                WHERE role_id = 'role_tmpl_{template_key}'
                """
            )
            op.execute(f"DELETE FROM role WHERE id = 'role_tmpl_{template_key}'")

    for key in NEW_PERMISSION_KEYS:
        op.execute(
            f"""
            DELETE FROM rolepermission
            WHERE permission_id IN (
                SELECT id FROM permission WHERE key = '{key}'
            )
            """
        )
        op.execute(f"DELETE FROM permission WHERE key = '{key}'")
