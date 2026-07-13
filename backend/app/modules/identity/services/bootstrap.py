from sqlmodel import Session

from app.modules.identity import permissions
from app.modules.identity.models import Role, User, UserRole
from app.modules.identity.repositories import (
    IdentityRoleRepository,
    IdentityTenantRepository,
    IdentityUserRoleRepository,
)
from app.modules.tenants.models import Tenant, TenantStatus, TenantType, now_utc

PRIMARY_TENANT_NAME = "MedizinHub HMS"

TENANT_ADMIN_DEFAULT_PERMISSION_KEYS = [
    permission_key
    for permission_key in permissions.PERMISSION_CATALOG
    if not permission_key.startswith("platform.")
]

RECEPTIONIST_DEFAULT_PERMISSION_KEYS = [
    permissions.PATIENTS_CREATE,
    permissions.PATIENTS_EDIT,
    permissions.PATIENTS_READ,
    permissions.PATIENTS_WRITE,
    permissions.APPOINTMENTS_CREATE,
    permissions.APPOINTMENTS_EDIT,
    permissions.APPOINTMENTS_READ,
    permissions.QUEUE_MANAGE,
    permissions.QUEUE_READ,
    permissions.PRACTITIONERS_READ,
    permissions.CONSULTATIONS_READ,
    permissions.LAB_CREATE,
    permissions.PHYSIOTHERAPY_CREATE,
    permissions.HOME_CARE_MANAGE,
    permissions.HOME_CARE_CREATE,
    permissions.HOME_CARE_READ,
    permissions.HOME_CARE_EDIT,
    permissions.INVOICES_CREATE,
    permissions.INVOICES_READ,
    permissions.INVOICES_CANCEL_REQUEST,
    permissions.PAYMENTS_CREATE,
    permissions.BILLING_READ,
    permissions.BILLING_REFUNDS_REQUEST,
    permissions.SERVICE_ITEMS_MANAGE,
    permissions.SERVICE_ITEMS_CREATE,
    permissions.SERVICE_ITEMS_READ,
    permissions.SERVICE_ITEMS_EDIT,
    # NOTE: reports.read is intentionally NOT granted. In this codebase
    # reports.read only unlocks financial surfaces (monthly revenue email
    # reports, revenue snapshots, subscription billing/usage). Operational,
    # clinical, lab, and pharmacy "reports" are served by the module read
    # keys above, so non-admin roles must not receive reports.read.
]

DOCTOR_DEFAULT_PERMISSION_KEYS = [
    permissions.PATIENTS_READ,
    permissions.APPOINTMENTS_READ,
    permissions.APPOINTMENTS_EDIT,
    permissions.QUEUE_READ,
    permissions.PRACTITIONERS_READ,
    permissions.CONSULTATIONS_READ,
    permissions.CONSULTATIONS_WRITE,
    permissions.CONSULTATIONS_CREATE,
    permissions.CONSULTATIONS_EDIT,
    permissions.CONSULTATIONS_SIGN,
    permissions.LAB_CREATE,
    permissions.LAB_READ,
    permissions.PHARMACY_READ,
    permissions.PHYSIOTHERAPY_CREATE,
    permissions.PHYSIOTHERAPY_READ,
    permissions.HOME_CARE_CREATE,
    permissions.HOME_CARE_READ,
    permissions.BILLING_READ,
    permissions.INVOICES_READ,
    # reports.read withheld; see note on RECEPTIONIST_DEFAULT_PERMISSION_KEYS.
]

LAB_TECHNICIAN_DEFAULT_PERMISSION_KEYS = [
    permissions.LAB_MANAGE,
    permissions.LAB_CREATE,
    permissions.LAB_READ,
    permissions.LAB_EDIT,
    permissions.LAB_RESULTS_MANAGE,
    permissions.PATIENTS_READ,
    permissions.APPOINTMENTS_READ,
    # reports.read withheld; see note on RECEPTIONIST_DEFAULT_PERMISSION_KEYS.
]

PHARMACIST_DEFAULT_PERMISSION_KEYS = [
    permissions.PHARMACY_MANAGE,
    permissions.PHARMACY_CREATE,
    permissions.PHARMACY_READ,
    permissions.PHARMACY_EDIT,
    permissions.PHARMACY_DISPENSE,
    permissions.PATIENTS_READ,
    permissions.CONSULTATIONS_READ,
    permissions.INVOICES_CREATE,
    permissions.INVOICES_READ,
    permissions.BILLING_READ,
    # reports.read withheld; see note on RECEPTIONIST_DEFAULT_PERMISSION_KEYS.
]

CLINICAL_ROLE_TEMPLATES = [
    ("receptionist", "Receptionist", RECEPTIONIST_DEFAULT_PERMISSION_KEYS),
    ("doctor", "Doctor", DOCTOR_DEFAULT_PERMISSION_KEYS),
    ("lab_technician", "Lab Technician", LAB_TECHNICIAN_DEFAULT_PERMISSION_KEYS),
    ("pharmacist", "Pharmacist", PHARMACIST_DEFAULT_PERMISSION_KEYS),
]


def ensure_primary_tenant(session: Session) -> Tenant:
    tenants = IdentityTenantRepository(session)
    tenant = tenants.get_primary()
    if not tenant:
        tenant = tenants.get_by_name(PRIMARY_TENANT_NAME)
    if tenant:
        tenant.name = PRIMARY_TENANT_NAME
        tenant.tenant_type = TenantType.PRIMARY.value
        tenant.is_primary = True
        tenant.status = TenantStatus.ACTIVE
        tenants.add(tenant)
        session.commit()
        session.refresh(tenant)
        return tenant
    tenant = Tenant(
        name=PRIMARY_TENANT_NAME,
        legal_name="MedizinHub HMS Platform",
        description="Primary SaaS tenant with global tenant-management authority.",
        tenant_type=TenantType.PRIMARY.value,
        is_primary=True,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    tenants.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant


def ensure_super_admin_role(
    session: Session, primary_tenant: Tenant, user: User
) -> Role:
    # Local import: role_permissions depends on this module for
    # TENANT_ADMIN_DEFAULT_PERMISSION_KEYS, so importing it at module load
    # time here would form a cycle.
    from app.modules.identity.services.role_permissions import ensure_role_permissions

    roles = IdentityRoleRepository(session)
    user_roles = IdentityUserRoleRepository(session)
    role = roles.get_by_key_for_tenant(primary_tenant.id, "super_admin")
    if not role:
        role = Role(
            tenant_id=primary_tenant.id,
            name="Super Admin",
            key="super_admin",
            is_global_template=True,
            is_template_locked=False,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        roles.add(role)
        session.commit()
        session.refresh(role)
    else:
        role.name = "Super Admin"
        role.is_global_template = True
        role.is_template_locked = False
        role.updated_by_user_id = user.id
        role.updated_at = now_utc()
        roles.add(role)
    ensure_role_permissions(session, role, permissions.PERMISSION_CATALOG)
    user_role = user_roles.get(user_id=user.id, role_id=role.id)
    if not user_role:
        user_roles.add(
            UserRole(user_id=user.id, role_id=role.id, tenant_id=primary_tenant.id)
        )
    session.commit()
    return role


def ensure_primary_tenant_admin_role(
    session: Session, primary_tenant: Tenant, user: User
) -> Role:
    from app.modules.identity.services.role_permissions import ensure_role_permissions

    roles = IdentityRoleRepository(session)
    role = roles.get_by_key_for_tenant(primary_tenant.id, "tenant_admin")
    if not role:
        role = Role(
            tenant_id=primary_tenant.id,
            name="Tenant Admin",
            key="tenant_admin",
            is_global_template=True,
            is_template_locked=False,
            created_by_user_id=user.id,
            updated_by_user_id=user.id,
        )
        roles.add(role)
        session.commit()
        session.refresh(role)
    else:
        role.name = "Tenant Admin"
        role.is_global_template = True
        role.is_template_locked = False
        role.updated_by_user_id = user.id
        role.updated_at = now_utc()
        roles.add(role)
    ensure_role_permissions(session, role, TENANT_ADMIN_DEFAULT_PERMISSION_KEYS)
    session.commit()
    return role


def ensure_clinical_role_templates(
    session: Session, primary_tenant: Tenant, user: User
) -> None:
    """Seed standard global clinical role templates on the primary tenant."""
    from app.modules.identity.services.role_permissions import ensure_role_permissions

    for key, name, permission_keys in CLINICAL_ROLE_TEMPLATES:
        roles = IdentityRoleRepository(session)
        role = roles.get_by_key_for_tenant(primary_tenant.id, key)
        if not role:
            role = Role(
                tenant_id=primary_tenant.id,
                name=name,
                key=key,
                is_global_template=True,
                is_template_locked=False,
                created_by_user_id=user.id,
                updated_by_user_id=user.id,
            )
            roles.add(role)
            session.commit()
            session.refresh(role)
        else:
            role.is_global_template = True
            role.updated_by_user_id = user.id
            role.updated_at = now_utc()
            roles.add(role)
        ensure_role_permissions(session, role, permission_keys)
    session.commit()
