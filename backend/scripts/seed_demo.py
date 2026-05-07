from __future__ import annotations

import json
from datetime import date, datetime, time, timezone

from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session, select
from app.core.database import engine

from app.modules.appointments.models import Appointment, AppointmentStatus, AppointmentType
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import DoctorFeeRule, FeeShareType, Invoice, PaymentMethod
from app.modules.billing.service import create_consultation_invoice
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.identity import permissions
from app.modules.identity.models import Permission, Role, RolePermission, User, UserRole
from app.modules.identity.security import hash_password, verify_password
from app.modules.lab.models import LabOrder, LabOrderItem, LabOrderSource, LabOrderStatus, LabResult
from app.modules.lab.models import LabResultTemplate, LabSample, LabTestCatalog, LabTestPackage, LabTestPackageItem
from app.modules.notifications.models import NotificationEvent, NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patients.models import AlertSeverity, AlertType, Gender, Patient, PatientAlert
from app.modules.pharmacy.models import MedicineBatch, MedicineCatalog, PharmacyIssue, PharmacyIssueItem
from app.modules.pharmacy.models import PharmacyIssueSource, PharmacyIssueStatus, PharmacyPurchase
from app.modules.pharmacy.models import PharmacyPurchaseItem, PharmacyStockLedger, PharmacySupplier, StockLedgerMovement
from app.modules.practitioners.models import (
    Practitioner,
    PractitionerBranch,
    PractitionerDepartment,
    PractitionerRoomAssignment,
    PractitionerSchedule,
    PractitionerType,
)
from app.modules.queue.models import QueueEntry
from app.modules.queue.service import create_queue_entry_for_appointment
from app.modules.settings.models import SettingKey, SettingScope
from app.modules.settings.service import upsert_setting
from app.modules.subscriptions.models import SubscriptionInvoice, SubscriptionInvoiceStatus, SubscriptionPlan, TenantSubscription
from app.modules.subscriptions.service import ensure_default_plans, modules_to_json
from app.modules.tenants.models import Branch, Department, Tenant, TenantStatus, TenantType

PRIMARY_TENANT_NAME = "MedizinHub HMS"
DEMO_TENANT_NAME = "MedizinHub Demo Clinic"
DEMO_BRANCH_CODE = "MAIN"
DEMO_PLAN_KEY = "demo_growth"
DEMO_PATIENT_NUMBER = "DEMO-0001"
DEMO_DOCTOR_ID = "doctor_demo"
DEMO_SUPER_ADMIN_EMAIL = "super.admin@demo.medizinhub.local"
DEMO_SUPER_ADMIN_PASSWORD = "SuperPass123"
DEMO_ADMIN_EMAIL = "tenant.admin@demo.medizinhub.local"
DEMO_ADMIN_PASSWORD = "DemoPass123"
DEMO_USER_PASSWORD = "DemoUser123"

DEMO_PATIENTS = [
    ("DEMO-0002", "Ramesh Kumar", "9876500002", Gender.MALE, 48, "T Nagar"),
    ("DEMO-0003", "Lakshmi Devi", "9876500003", Gender.FEMALE, 41, "Velachery"),
    ("DEMO-0004", "Kavin S", "9876500004", Gender.MALE, 12, "Adyar"),
    ("DEMO-0005", "Fatima Banu", "9876500005", Gender.FEMALE, 29, "Tambaram"),
]

DEMO_ROLE_USERS = [
    (
        "reception",
        "Reception Staff",
        "reception@demo.medizinhub.local",
        [
            permissions.PATIENTS_READ,
            permissions.PATIENTS_WRITE,
            permissions.APPOINTMENTS_MANAGE,
            permissions.QUEUE_MANAGE,
            permissions.NOTIFICATIONS_MANAGE,
        ],
    ),
    (
        "doctor",
        "Demo Doctor",
        "doctor@demo.medizinhub.local",
        [
            permissions.PATIENTS_READ,
            permissions.QUEUE_MANAGE,
            permissions.CONSULTATIONS_READ,
            permissions.CONSULTATIONS_WRITE,
            permissions.CONSULTATIONS_SIGN,
        ],
    ),
    (
        "lab",
        "Lab Technician",
        "lab@demo.medizinhub.local",
        [permissions.PATIENTS_READ, permissions.LAB_MANAGE, permissions.NOTIFICATIONS_MANAGE],
    ),
    (
        "pharmacy",
        "Pharmacy User",
        "pharmacy@demo.medizinhub.local",
        [permissions.PATIENTS_READ, permissions.PHARMACY_MANAGE, permissions.BILLING_MANAGE],
    ),
    (
        "billing",
        "Billing Staff",
        "billing@demo.medizinhub.local",
        [
            permissions.PATIENTS_READ,
            permissions.BILLING_MANAGE,
            permissions.PAYMENTS_MANAGE,
            permissions.SETTLEMENTS_READ,
        ],
    ),
    (
        "back_office",
        "Back Office Staff",
        "backoffice@demo.medizinhub.local",
        [
            permissions.PATIENTS_READ,
            permissions.REPORTS_READ,
            permissions.SETTLEMENTS_READ,
            permissions.AUDIT_READ,
        ],
    ),
]


def _first_or_none(session: Session, statement):
    return session.exec(statement).first()


def ensure_primary_tenant(session: Session) -> Tenant:
    tenant = _first_or_none(session, select(Tenant).where(Tenant.is_primary == True))  # noqa: E712
    if not tenant:
        tenant = _first_or_none(session, select(Tenant).where(Tenant.name == PRIMARY_TENANT_NAME))
    if tenant:
        tenant.name = PRIMARY_TENANT_NAME
        tenant.legal_name = tenant.legal_name or "MedizinHub HMS Platform"
        tenant.description = tenant.description or "Primary SaaS tenant with global tenant-management authority."
        tenant.email = tenant.email or "admin@medizinhub.local"
        tenant.phone = tenant.phone or "9000000000"
        tenant.address = tenant.address or "MedizinHub HMS Platform Office"
        tenant.tenant_type = TenantType.PRIMARY.value
        tenant.is_primary = True
        tenant.status = TenantStatus.ACTIVE
        session.add(tenant)
        session.commit()
        session.refresh(tenant)
        return tenant
    tenant = Tenant(
        name=PRIMARY_TENANT_NAME,
        legal_name="MedizinHub HMS Platform",
        description="Primary SaaS tenant with global tenant-management authority.",
        email="admin@medizinhub.local",
        phone="9000000000",
        address="MedizinHub HMS Platform Office",
        tenant_type=TenantType.PRIMARY.value,
        is_primary=True,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        action="tenant.primary_created",
        resource_type="tenant",
        resource_id=tenant.id,
        purpose="demo_seed",
    )
    return tenant


def ensure_tenant(session: Session) -> Tenant:
    tenant = _first_or_none(session, select(Tenant).where(Tenant.name == DEMO_TENANT_NAME))
    if tenant:
        return tenant
    tenant = Tenant(
        name=DEMO_TENANT_NAME,
        legal_name="MedizinHub Demo Clinic Private Limited",
        description="Demo customer tenant for local development and QA.",
        email=DEMO_ADMIN_EMAIL,
        phone="9000000001",
        address="Demo Street, Healthcare Nagar, Chennai",
        tenant_type=TenantType.POLYCLINIC.value,
        status=TenantStatus.ACTIVE,
        country="IN",
        timezone="Asia/Kolkata",
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        action="tenant.created",
        resource_type="tenant",
        resource_id=tenant.id,
        purpose="demo_seed",
    )
    return tenant


def ensure_branch(session: Session, tenant: Tenant) -> Branch:
    branch = _first_or_none(
        session,
        select(Branch).where(Branch.tenant_id == tenant.id, Branch.code == DEMO_BRANCH_CODE),
    )
    if branch:
        return branch
    branch = Branch(
        tenant_id=tenant.id,
        name="Main Demo Branch",
        code=DEMO_BRANCH_CODE,
        address="Demo Street, Healthcare Nagar",
        city="Chennai",
        state="Tamil Nadu",
    )
    session.add(branch)
    session.commit()
    session.refresh(branch)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        action="branch.created",
        resource_type="branch",
        resource_id=branch.id,
        purpose="demo_seed",
    )
    return branch


def ensure_demo_departments(session: Session, tenant: Tenant, branch: Branch) -> None:
    departments = (
        ("general", "General Medicine", "GENERAL"),
        ("ped", "Pediatrics", "PED"),
        ("diab", "Diabetology", "DIAB"),
    )
    for department_id, name, code in departments:
        department = session.get(Department, department_id)
        if not department:
            session.add(
                Department(
                    id=department_id,
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    name=name,
                    code=code,
                )
            )
    session.commit()


def ensure_plan_and_subscription(session: Session, tenant: Tenant) -> tuple[SubscriptionPlan, TenantSubscription]:
    ensure_default_plans(session)
    modules = [
        "patients",
        "appointments",
        "queue",
        "consultations",
        "billing_basic",
        "billing_advanced",
        "whatsapp",
        "sms",
        "voice",
        "lab",
        "pharmacy",
        "ai",
        "ip",
    ]
    plan = _first_or_none(session, select(SubscriptionPlan).where(SubscriptionPlan.key == DEMO_PLAN_KEY))
    if not plan:
        plan = SubscriptionPlan(
            key=DEMO_PLAN_KEY,
            name="Demo Growth Plan",
            monthly_patient_limit=1000,
            included_branches=5,
            included_doctors=20,
            price_inr_monthly=4999,
            enabled_modules_json=modules_to_json(modules),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        session.add(plan)
    else:
        plan.enabled_modules_json = modules_to_json(modules)
        plan.is_active = True
        plan.created_at = plan.created_at or datetime.now(timezone.utc)
        plan.updated_at = datetime.now(timezone.utc)
        session.add(plan)
    session.commit()
    session.refresh(plan)

    subscription = _first_or_none(
        session,
        select(TenantSubscription).where(
            TenantSubscription.tenant_id == tenant.id,
            TenantSubscription.plan_id == plan.id,
            TenantSubscription.is_active == True,  # noqa: E712
        ),
    )
    if subscription:
        return plan, subscription
    subscription = TenantSubscription(
        tenant_id=tenant.id,
        plan_id=plan.id,
        starts_on=date.today(),
        is_trial=False,
        billing_amount=plan.price_inr_monthly,
    )
    session.add(subscription)
    session.commit()
    session.refresh(subscription)
    return plan, subscription


def ensure_settings(session: Session, tenant: Tenant, branch: Branch) -> None:
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="communication",
        key=SettingKey.COMMUNICATION_PROVIDERS_ENABLED,
        value=["whatsapp", "sms", "voice"],
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.TENANT,
        scope_id=tenant.id,
        module="payment",
        key=SettingKey.PAYMENT_METHODS_ENABLED,
        value=[method.value for method in PaymentMethod],
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        value="MHD",
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="queue",
        key=SettingKey.QUEUE_REQUEUE_AFTER_PATIENTS,
        value=2,
    )
    upsert_setting(
        session,
        tenant_id=tenant.id,
        scope=SettingScope.BRANCH,
        scope_id=branch.id,
        module="queue",
        key=SettingKey.QUEUE_AUTO_NO_SHOW_AFTER_MISSED_CALLS,
        value=3,
    )


def ensure_permission(session: Session, permission_key: str) -> Permission:
    permission = _first_or_none(session, select(Permission).where(Permission.key == permission_key))
    if not permission:
        permission = Permission(key=permission_key, description=permission_key.replace(".", " ").title())
        session.add(permission)
        session.commit()
        session.refresh(permission)
    return permission


def ensure_role(session: Session, tenant_id: str, key: str, name: str, permission_keys: list[str]) -> Role:
    role = _first_or_none(session, select(Role).where(Role.tenant_id == tenant_id, Role.key == key))
    if not role:
        role = Role(tenant_id=tenant_id, name=name, key=key)
        session.add(role)
        session.commit()
        session.refresh(role)
    for permission_key in permission_keys:
        permission = ensure_permission(session, permission_key)
        role_permission = _first_or_none(
            session,
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission.id,
            ),
        )
        if not role_permission:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))
            session.commit()
    return role


def ensure_super_admin_role(session: Session, primary_tenant: Tenant, super_admin: User) -> Role:
    role = ensure_role(
        session,
        primary_tenant.id,
        "super_admin",
        "Super Admin",
        permissions.PERMISSION_CATALOG,
    )
    role.is_global_template = True
    role.is_template_locked = False
    role.updated_by_user_id = super_admin.id
    role.created_by_user_id = role.created_by_user_id or super_admin.id
    session.add(role)
    exists = _first_or_none(
        session,
        select(UserRole).where(UserRole.user_id == super_admin.id, UserRole.role_id == role.id),
    )
    if not exists:
        session.add(UserRole(user_id=super_admin.id, role_id=role.id, tenant_id=primary_tenant.id))
    session.commit()
    return role


def tenant_admin_default_permissions() -> list[str]:
    return [
        permission_key
        for permission_key in permissions.PERMISSION_CATALOG
        if not permission_key.startswith("platform.")
    ]


def ensure_primary_tenant_admin_role(session: Session, primary_tenant: Tenant, super_admin: User) -> Role:
    role = ensure_role(
        session,
        primary_tenant.id,
        "tenant_admin",
        "Tenant Admin",
        tenant_admin_default_permissions(),
    )
    role.is_global_template = True
    role.is_template_locked = False
    role.updated_by_user_id = super_admin.id
    role.created_by_user_id = role.created_by_user_id or super_admin.id
    session.add(role)
    session.commit()
    return role


def ensure_user(
    session: Session,
    *,
    tenant: Tenant,
    branch: Branch,
    role: Role,
    name: str,
    email: str,
    password: str,
    mobile: str | None = None,
    user_type: str = "staff",
) -> User:
    user = _first_or_none(session, select(User).where(User.tenant_id == tenant.id, User.email == email))
    if not user:
        user = User(
            tenant_id=tenant.id,
            branch_id=branch.id,
            user_type=user_type,
            name=name,
            email=email,
            mobile=mobile,
            password_hash=hash_password(password),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif user.user_type != user_type:
        user.user_type = user_type
        session.add(user)
        session.commit()
    exists = _first_or_none(
        session,
        select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id),
    )
    if not exists:
        session.add(UserRole(user_id=user.id, role_id=role.id, tenant_id=tenant.id))
        session.commit()
    return user


def ensure_demo_users(session: Session, tenant: Tenant, branch: Branch, primary_tenant: Tenant) -> User:
    super_admin = _first_or_none(session, select(User).where(User.email == DEMO_SUPER_ADMIN_EMAIL))
    if not super_admin:
        super_admin = User(
            tenant_id=primary_tenant.id,
            user_type="platform_admin",
            name="Demo Super Admin",
            email=DEMO_SUPER_ADMIN_EMAIL,
            password_hash=hash_password(DEMO_SUPER_ADMIN_PASSWORD),
            is_super_admin=True,
        )
        session.add(super_admin)
        session.commit()
    elif not super_admin.tenant_id:
        super_admin.tenant_id = primary_tenant.id
        session.add(super_admin)
        session.commit()
    if (
        super_admin.tenant_id != primary_tenant.id
        or not super_admin.is_super_admin
        or not super_admin.is_active
        or not verify_password(DEMO_SUPER_ADMIN_PASSWORD, super_admin.password_hash)
    ):
        super_admin.tenant_id = primary_tenant.id
        super_admin.is_super_admin = True
        super_admin.user_type = "platform_admin"
        super_admin.is_active = True
        super_admin.password_hash = hash_password(DEMO_SUPER_ADMIN_PASSWORD)
        session.add(super_admin)
        session.commit()

    ensure_super_admin_role(session, primary_tenant, super_admin)
    ensure_primary_tenant_admin_role(session, primary_tenant, super_admin)

    tenant_admin_role = ensure_role(
        session,
        tenant.id,
        "tenant_admin",
        "Tenant Admin",
        tenant_admin_default_permissions(),
    )
    admin_user = ensure_user(
        session,
        tenant=tenant,
        branch=branch,
        role=tenant_admin_role,
        name="Demo Tenant Admin",
        email=DEMO_ADMIN_EMAIL,
        password=DEMO_ADMIN_PASSWORD,
        mobile="9000000001",
        user_type="tenant_admin",
    )
    for role_key, name, email, permission_keys in DEMO_ROLE_USERS:
        role = ensure_role(session, tenant.id, role_key, name, permission_keys)
        ensure_user(
            session,
            tenant=tenant,
            branch=branch,
            role=role,
            name=name,
            email=email,
            password=DEMO_USER_PASSWORD,
            user_type="doctor" if role_key == "doctor" else role_key,
        )
    return admin_user


def ensure_demo_practitioner(session: Session, tenant: Tenant, branch: Branch) -> Practitioner:
    practitioner = session.get(Practitioner, DEMO_DOCTOR_ID)
    if not practitioner:
        practitioner = Practitioner(
            id=DEMO_DOCTOR_ID,
            tenant_id=tenant.id,
            full_name="Dr. Demo Priya",
            practitioner_type=PractitionerType.DOCTOR,
            primary_specialty="General Medicine / Pediatrics / Diabetology",
            registration_number="TNMC-DEMO-001",
            email="doctor@demo.medizinhub.local",
            mobile="9000000003",
        )
        session.add(practitioner)
        session.commit()
    branch_link = session.get(PractitionerBranch, (DEMO_DOCTOR_ID, branch.id))
    if not branch_link:
        session.add(PractitionerBranch(tenant_id=tenant.id, practitioner_id=DEMO_DOCTOR_ID, branch_id=branch.id))
    for department_id in ("general", "ped", "diab"):
        department_link = session.get(PractitionerDepartment, (DEMO_DOCTOR_ID, department_id))
        if not department_link:
            session.add(
                PractitionerDepartment(
                    tenant_id=tenant.id,
                    practitioner_id=DEMO_DOCTOR_ID,
                    department_id=department_id,
                )
            )
    for weekday in range(6):
        existing_schedule = _first_or_none(
            session,
            select(PractitionerSchedule).where(
                PractitionerSchedule.tenant_id == tenant.id,
                PractitionerSchedule.practitioner_id == DEMO_DOCTOR_ID,
                PractitionerSchedule.branch_id == branch.id,
                PractitionerSchedule.weekday == weekday,
            ),
        )
        if not existing_schedule:
            session.add(
                PractitionerSchedule(
                    tenant_id=tenant.id,
                    practitioner_id=DEMO_DOCTOR_ID,
                    branch_id=branch.id,
                    weekday=weekday,
                    start_time=time(9, 0),
                    end_time=time(13, 0),
                    slot_minutes=15,
                    room_name="Consultation Room 1",
                )
            )
        existing_room = _first_or_none(
            session,
            select(PractitionerRoomAssignment).where(
                PractitionerRoomAssignment.tenant_id == tenant.id,
                PractitionerRoomAssignment.practitioner_id == DEMO_DOCTOR_ID,
                PractitionerRoomAssignment.branch_id == branch.id,
                PractitionerRoomAssignment.weekday == weekday,
                PractitionerRoomAssignment.room_name == "Consultation Room 1",
            ),
        )
        if not existing_room:
            session.add(
                PractitionerRoomAssignment(
                    tenant_id=tenant.id,
                    practitioner_id=DEMO_DOCTOR_ID,
                    branch_id=branch.id,
                    room_name="Consultation Room 1",
                    weekday=weekday,
                    start_time=time(9, 0),
                    end_time=time(13, 0),
                )
            )
    session.commit()
    return practitioner


def ensure_patient(session: Session, tenant: Tenant, branch: Branch, actor_user_id: str) -> Patient:
    patient = _first_or_none(
        session,
        select(Patient).where(Patient.tenant_id == tenant.id, Patient.patient_number == DEMO_PATIENT_NUMBER),
    )
    if patient:
        return patient
    patient = Patient(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_number=DEMO_PATIENT_NUMBER,
        full_name="Ananya Demo Patient",
        mobile="9876543210",
        gender=Gender.FEMALE,
        age_years=34,
        area="Anna Nagar",
        blood_group="B+",
    )
    session.add(patient)
    session.commit()
    session.refresh(patient)
    session.add(
        PatientAlert(
            tenant_id=tenant.id,
            patient_id=patient.id,
            alert_type=AlertType.ALLERGY,
            title="Penicillin allergy",
            description="Demo allergy alert visible in Patient 360.",
            severity=AlertSeverity.HIGH,
            created_by_user_id=actor_user_id,
        )
    )
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        actor_user_id=actor_user_id,
        action="patient.created",
        resource_type="patient",
        resource_id=patient.id,
        purpose="demo_seed",
    )
    return patient


def ensure_appointment(session: Session, tenant: Tenant, branch: Branch, patient: Patient, actor_user_id: str) -> Appointment:
    appointment = _first_or_none(
        session,
        select(Appointment).where(
            Appointment.tenant_id == tenant.id,
            Appointment.patient_id == patient.id,
            Appointment.appointment_date == date.today(),
            Appointment.practitioner_id == DEMO_DOCTOR_ID,
        ),
    )
    if appointment:
        return appointment
    appointment = Appointment(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_id=patient.id,
        department_id="general",
        practitioner_id=DEMO_DOCTOR_ID,
        appointment_type=AppointmentType.OP,
        appointment_date=date.today(),
        reason="Demo fever and throat pain consultation",
        created_by_user_id=actor_user_id,
    )
    session.add(appointment)
    session.commit()
    session.refresh(appointment)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        actor_user_id=actor_user_id,
        action="appointment.booked",
        resource_type="appointment",
        resource_id=appointment.id,
        purpose="demo_seed",
    )
    return appointment


def ensure_queue_and_booking_notification(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    appointment: Appointment,
    actor_user_id: str,
) -> QueueEntry:
    queue_entry = _first_or_none(
        session,
        select(QueueEntry).where(QueueEntry.tenant_id == tenant.id, QueueEntry.appointment_id == appointment.id),
    )
    if not queue_entry:
        queue_entry = create_queue_entry_for_appointment(session, appointment)
    for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        _queue_notification_once(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            provider=provider,
            event_type=NotificationEventType.APPOINTMENT_REMINDER,
            recipient=patient.mobile,
            subject="Appointment booked",
            message=f"Your demo appointment token is {queue_entry.token_number}.",
            resource_type="appointment",
            resource_id=appointment.id,
            queued_by_user_id=actor_user_id,
        )
    return queue_entry


def ensure_consultation(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    appointment: Appointment,
    actor_user_id: str,
) -> Consultation:
    consultation = _first_or_none(
        session,
        select(Consultation).where(Consultation.tenant_id == tenant.id, Consultation.appointment_id == appointment.id),
    )
    if consultation:
        return consultation
    now = datetime.now(timezone.utc)
    consultation = Consultation(
        tenant_id=tenant.id,
        branch_id=branch.id,
        appointment_id=appointment.id,
        patient_id=patient.id,
        practitioner_id=appointment.practitioner_id,
        status=ConsultationStatus.SIGNED,
        treatment_type="general_consultation",
        chief_complaint="Fever and throat pain for two days",
        diagnosis="Demo acute upper respiratory infection",
        clinical_notes="Vitals stable. Hydration advised. Return immediately if breathlessness develops.",
        prescription_text="Paracetamol 500mg after food, twice daily for 3 days.",
        lab_referral_text="CBC if fever persists beyond 48 hours.",
        follow_up_advice="Follow up after 7 days or earlier if symptoms worsen.",
        created_by_user_id=actor_user_id,
        signed_by_user_id=DEMO_DOCTOR_ID,
        signed_at=now,
    )
    appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
    appointment.updated_at = now
    session.add(consultation)
    session.add(appointment)
    session.commit()
    session.refresh(consultation)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        actor_user_id=DEMO_DOCTOR_ID,
        action="consultation.signed",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="demo_seed",
    )
    return consultation


def ensure_fee_rule(session: Session, tenant: Tenant, branch: Branch) -> DoctorFeeRule:
    fee_rule = _first_or_none(
        session,
        select(DoctorFeeRule).where(
            DoctorFeeRule.tenant_id == tenant.id,
            DoctorFeeRule.branch_id == branch.id,
            DoctorFeeRule.practitioner_id == DEMO_DOCTOR_ID,
            DoctorFeeRule.appointment_type == AppointmentType.OP,
        ),
    )
    if fee_rule:
        return fee_rule
    fee_rule = DoctorFeeRule(
        tenant_id=tenant.id,
        branch_id=branch.id,
        department_id="general",
        practitioner_id=DEMO_DOCTOR_ID,
        appointment_type=AppointmentType.OP,
        treatment_type="general_consultation",
        fee_amount=800,
        share_type=FeeShareType.PERCENTAGE,
        doctor_share_percentage=60,
    )
    session.add(fee_rule)
    session.commit()
    session.refresh(fee_rule)
    return fee_rule


def ensure_demo_fee_rules(session: Session, tenant: Tenant, branch: Branch) -> None:
    rules = [
        (AppointmentType.DOCTOR_REVIEW, "doctor_review", 0),
        (AppointmentType.FITNESS_CERTIFICATE, "fitness_certificate", 500),
        (AppointmentType.EMERGENCY, "emergency_consultation", 1200),
    ]
    for appointment_type, treatment_type, fee_amount in rules:
        exists = _first_or_none(
            session,
            select(DoctorFeeRule).where(
                DoctorFeeRule.tenant_id == tenant.id,
                DoctorFeeRule.branch_id == branch.id,
                DoctorFeeRule.practitioner_id == DEMO_DOCTOR_ID,
                DoctorFeeRule.appointment_type == appointment_type,
                DoctorFeeRule.treatment_type == treatment_type,
            ),
        )
        if not exists:
            session.add(
                DoctorFeeRule(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    department_id="general",
                    practitioner_id=DEMO_DOCTOR_ID,
                    appointment_type=appointment_type,
                    treatment_type=treatment_type,
                    fee_amount=fee_amount,
                    share_type=FeeShareType.PERCENTAGE,
                    doctor_share_percentage=60,
                )
            )
    session.commit()


def ensure_invoice(
    session: Session,
    appointment: Appointment,
    consultation: Consultation,
    actor_user_id: str,
) -> Invoice:
    invoice = _first_or_none(
        session,
        select(Invoice).where(
            Invoice.tenant_id == appointment.tenant_id,
            Invoice.consultation_id == consultation.id,
        ),
    )
    if invoice:
        return invoice
    invoice, _item = create_consultation_invoice(
        session,
        appointment=appointment,
        consultation_id=consultation.id,
        discount_amount=0,
        created_by_user_id=actor_user_id,
        treatment_type=consultation.treatment_type,
    )
    record_audit_event(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=actor_user_id,
        action="invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="demo_seed",
    )
    return invoice


def ensure_lab_order(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    consultation: Consultation,
    actor_user_id: str,
) -> LabOrder:
    cbc = _first_or_none(
        session,
        select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant.id, LabTestCatalog.code == "CBC"),
    )
    if not cbc:
        cbc = LabTestCatalog(
            tenant_id=tenant.id,
            branch_id=branch.id,
            code="CBC",
            name="Complete Blood Count",
            department="Pathology",
            sample_type="Blood",
            default_price=350,
            turnaround_minutes=240,
            created_by_user_id=actor_user_id,
        )
        session.add(cbc)
        session.commit()
        session.refresh(cbc)
    fbs = _first_or_none(
        session,
        select(LabTestCatalog).where(LabTestCatalog.tenant_id == tenant.id, LabTestCatalog.code == "FBS"),
    )
    if not fbs:
        fbs = LabTestCatalog(
            tenant_id=tenant.id,
            branch_id=branch.id,
            code="FBS",
            name="Fasting Blood Sugar",
            department="Biochemistry",
            sample_type="Blood",
            default_price=120,
            turnaround_minutes=180,
            created_by_user_id=actor_user_id,
        )
        session.add(fbs)
        session.commit()
        session.refresh(fbs)
    package = _first_or_none(
        session,
        select(LabTestPackage).where(LabTestPackage.tenant_id == tenant.id, LabTestPackage.code == "FEVER"),
    )
    if not package:
        package = LabTestPackage(
            tenant_id=tenant.id,
            branch_id=branch.id,
            code="FEVER",
            name="Fever Panel",
            description="CBC and blood sugar screening for fever workup.",
            package_price=400,
            created_by_user_id=actor_user_id,
        )
        session.add(package)
        session.commit()
        session.refresh(package)
        for test in [cbc, fbs]:
            session.add(LabTestPackageItem(tenant_id=tenant.id, package_id=package.id, test_id=test.id))
        session.commit()
    template = _first_or_none(
        session,
        select(LabResultTemplate).where(LabResultTemplate.tenant_id == tenant.id, LabResultTemplate.name == "CBC Template"),
    )
    if not template:
        template = LabResultTemplate(
            tenant_id=tenant.id,
            test_id=cbc.id,
            name="CBC Template",
            content_json=json.dumps({"fields": ["Hb", "WBC", "Platelets", "Remarks"]}),
            created_by_user_id=actor_user_id,
        )
        session.add(template)
        session.commit()
        session.refresh(template)
    lab_order = _first_or_none(
        session,
        select(LabOrder).where(LabOrder.tenant_id == tenant.id, LabOrder.consultation_id == consultation.id),
    )
    if not lab_order:
        lab_order = LabOrder(
            tenant_id=tenant.id,
            branch_id=branch.id,
            patient_id=patient.id,
            consultation_id=consultation.id,
            source=LabOrderSource.CONSULTATION,
            status=LabOrderStatus.RESULT_READY,
            tests=consultation.lab_referral_text or "CBC",
            notes="Demo lab order created from signed consultation.",
            amount=650,
            ordered_by_user_id=actor_user_id,
            sample_collected_at=datetime.now(timezone.utc),
            result_ready_at=datetime.now(timezone.utc),
        )
        session.add(lab_order)
        session.commit()
        session.refresh(lab_order)
        record_audit_event(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            actor_user_id=actor_user_id,
            action="lab_order.created_from_consultation",
            resource_type="lab_order",
            resource_id=lab_order.id,
            purpose="demo_seed",
        )
    existing_items = list(
        session.exec(
            select(LabOrderItem).where(LabOrderItem.tenant_id == tenant.id, LabOrderItem.lab_order_id == lab_order.id)
        ).all()
    )
    if not existing_items:
        for test in [cbc, fbs]:
            session.add(
                LabOrderItem(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    lab_order_id=lab_order.id,
                    test_id=test.id,
                    package_id=package.id,
                    test_name=test.name,
                    sample_type=test.sample_type,
                    price=0,
                    status=LabOrderStatus.RESULT_READY,
                )
            )
        session.commit()
    sample = _first_or_none(
        session,
        select(LabSample).where(LabSample.tenant_id == tenant.id, LabSample.lab_order_id == lab_order.id),
    )
    if not sample:
        session.add(
            LabSample(
                tenant_id=tenant.id,
                branch_id=branch.id,
                lab_order_id=lab_order.id,
                barcode=f"{lab_order.id}-S1",
                sample_type="Blood",
                collected_by_user_id=actor_user_id,
            )
        )
        session.commit()
    result = _first_or_none(
        session,
        select(LabResult).where(LabResult.tenant_id == tenant.id, LabResult.lab_order_id == lab_order.id),
    )
    if not result:
        session.add(
            LabResult(
                tenant_id=tenant.id,
                branch_id=branch.id,
                lab_order_id=lab_order.id,
                template_id=template.id,
                result_summary="CBC within acceptable demo range. Review clinically if fever continues.",
                abnormal_flag=False,
                report_url="https://demo.medizinhub.local/reports/cbc-demo.pdf",
                report_file_name="cbc-demo.pdf",
                released_by_user_id=actor_user_id,
            )
        )
        session.commit()
    return lab_order


def ensure_pharmacy_issue(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    consultation: Consultation,
    actor_user_id: str,
) -> PharmacyIssue:
    medicine = _first_or_none(
        session,
        select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant.id, MedicineCatalog.code == "PCM500"),
    )
    if not medicine:
        medicine = MedicineCatalog(
            tenant_id=tenant.id,
            branch_id=branch.id,
            code="PCM500",
            name="Paracetamol 500mg",
            generic_name="Paracetamol",
            form="Tablet",
            default_sale_price=5,
            reorder_level=20,
            created_by_user_id=actor_user_id,
        )
        session.add(medicine)
        session.commit()
        session.refresh(medicine)
    supplier = _first_or_none(
        session,
        select(PharmacySupplier).where(PharmacySupplier.tenant_id == tenant.id, PharmacySupplier.name == "Demo Pharma Supplier"),
    )
    if not supplier:
        supplier = PharmacySupplier(tenant_id=tenant.id, name="Demo Pharma Supplier", phone="9000000000", created_by_user_id=actor_user_id)
        session.add(supplier)
        session.commit()
        session.refresh(supplier)
    purchase = _first_or_none(
        session,
        select(PharmacyPurchase).where(PharmacyPurchase.tenant_id == tenant.id, PharmacyPurchase.invoice_number == "PINV-DEMO"),
    )
    batch = _first_or_none(
        session,
        select(MedicineBatch).where(MedicineBatch.tenant_id == tenant.id, MedicineBatch.medicine_id == medicine.id),
    )
    if not purchase:
        purchase = PharmacyPurchase(
            tenant_id=tenant.id,
            branch_id=branch.id,
            supplier_id=supplier.id,
            invoice_number="PINV-DEMO",
            total_amount=100,
            purchased_by_user_id=actor_user_id,
        )
        session.add(purchase)
        session.commit()
        session.refresh(purchase)
    if not batch:
        batch = MedicineBatch(
            tenant_id=tenant.id,
            branch_id=branch.id,
            medicine_id=medicine.id,
            purchase_id=purchase.id,
            batch_number="DEMO-PCM",
            quantity_on_hand=50,
            cost_price=2,
            sale_price=5,
        )
        session.add(batch)
        session.commit()
        session.refresh(batch)
        session.add(
            PharmacyPurchaseItem(
                tenant_id=tenant.id,
                branch_id=branch.id,
                purchase_id=purchase.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                quantity=50,
                cost_price=2,
                sale_price=5,
            )
        )
        session.add(
            PharmacyStockLedger(
                tenant_id=tenant.id,
                branch_id=branch.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                movement_type=StockLedgerMovement.PURCHASE,
                quantity_delta=50,
                balance_after=50,
                reference_type="pharmacy_purchase",
                reference_id=purchase.id,
                actor_user_id=actor_user_id,
            )
        )
        session.commit()
    issue = _first_or_none(
        session,
        select(PharmacyIssue).where(PharmacyIssue.tenant_id == tenant.id, PharmacyIssue.consultation_id == consultation.id),
    )
    if issue:
        return issue
    issue = PharmacyIssue(
        tenant_id=tenant.id,
        branch_id=branch.id,
        patient_id=patient.id,
        consultation_id=consultation.id,
        source=PharmacyIssueSource.CONSULTATION,
        status=PharmacyIssueStatus.DISPENSED,
        medicine_text=consultation.prescription_text or "Paracetamol 500mg twice daily for 3 days.",
        notes="Demo medicine dispensed from doctor prescription.",
        amount=180,
        issued_by_user_id=actor_user_id,
        dispensed_by_user_id=actor_user_id,
        dispensed_at=datetime.now(timezone.utc),
    )
    session.add(issue)
    session.commit()
    session.refresh(issue)
    record_audit_event(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        actor_user_id=actor_user_id,
        action="pharmacy_issue.dispensed",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="demo_seed",
    )
    item = _first_or_none(
        session,
        select(PharmacyIssueItem).where(PharmacyIssueItem.tenant_id == tenant.id, PharmacyIssueItem.pharmacy_issue_id == issue.id),
    )
    if not item:
        session.add(
            PharmacyIssueItem(
                tenant_id=tenant.id,
                branch_id=branch.id,
                pharmacy_issue_id=issue.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                medicine_name=medicine.name,
                quantity=1,
                unit_price=5,
                dispensed_quantity=1,
            )
        )
        session.commit()
    return issue


def _queue_notification_once(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    provider: NotificationProvider,
    event_type: NotificationEventType,
    recipient: str | None,
    message: str,
    subject: str | None,
    resource_type: str,
    resource_id: str,
    queued_by_user_id: str | None,
) -> NotificationEvent | None:
    existing = _first_or_none(
        session,
        select(NotificationEvent).where(
            NotificationEvent.tenant_id == tenant_id,
            NotificationEvent.provider == provider,
            NotificationEvent.event_type == event_type,
            NotificationEvent.resource_type == resource_type,
            NotificationEvent.resource_id == resource_id,
        ),
    )
    if existing:
        return existing
    return queue_notification_if_allowed(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        provider=provider,
        event_type=event_type,
        recipient=recipient,
        subject=subject,
        message=message,
        resource_type=resource_type,
        resource_id=resource_id,
        queued_by_user_id=queued_by_user_id,
    )


def ensure_notifications(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    patient: Patient,
    queue_entry: QueueEntry,
    consultation: Consultation,
    invoice: Invoice,
    actor_user_id: str,
) -> None:
    _queue_notification_once(
        session,
        tenant_id=tenant.id,
        branch_id=branch.id,
        provider=NotificationProvider.VOICE,
        event_type=NotificationEventType.QUEUE_TOKEN_CALL,
        recipient=f"branch:{branch.id}:speaker",
        subject="Token call",
        message=f"Token {queue_entry.token_number}, please proceed to consultation room.",
        resource_type="queue_entry",
        resource_id=queue_entry.id,
        queued_by_user_id=actor_user_id,
    )
    for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
        _queue_notification_once(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            provider=provider,
            event_type=NotificationEventType.PAYMENT_REMINDER,
            recipient=patient.mobile,
            subject="Payment pending",
            message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
            resource_type="invoice",
            resource_id=invoice.id,
            queued_by_user_id=actor_user_id,
        )
        _queue_notification_once(
            session,
            tenant_id=tenant.id,
            branch_id=branch.id,
            provider=provider,
            event_type=NotificationEventType.FOLLOW_UP_REMINDER,
            recipient=patient.mobile,
            subject="Follow-up reminder",
            message=consultation.follow_up_advice or "Please follow up as advised.",
            resource_type="consultation",
            resource_id=consultation.id,
            queued_by_user_id=actor_user_id,
        )


def ensure_customer_demo_dataset(
    session: Session,
    tenant: Tenant,
    branch: Branch,
    source_appointment: Appointment,
    actor_user_id: str,
) -> None:
    today = date.today()
    scenarios = [
        (DEMO_PATIENTS[0], AppointmentType.DOCTOR_REVIEW, "doctor_review", today, time(10, 0), False, AppointmentStatus.WAITING),
        (DEMO_PATIENTS[1], AppointmentType.FITNESS_CERTIFICATE, "fitness_certificate", today, time(10, 30), True, AppointmentStatus.SCHEDULED),
        (DEMO_PATIENTS[2], AppointmentType.OP, "pediatric_consultation", today, time(11, 0), True, AppointmentStatus.WAITING),
        (DEMO_PATIENTS[3], AppointmentType.EMERGENCY, "emergency_consultation", today, None, True, AppointmentStatus.CALLED),
    ]
    for patient_data, appointment_type, visit_purpose, appointment_date, appointment_time, is_billable, status_value in scenarios:
        patient_number, name, mobile, gender, age, area = patient_data
        patient = _first_or_none(
            session,
            select(Patient).where(Patient.tenant_id == tenant.id, Patient.patient_number == patient_number),
        )
        if not patient:
            patient = Patient(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_number=patient_number,
                full_name=name,
                mobile=mobile,
                gender=gender,
                age_years=age,
                area=area,
            )
            session.add(patient)
            session.commit()
            session.refresh(patient)
        appointment = _first_or_none(
            session,
            select(Appointment).where(
                Appointment.tenant_id == tenant.id,
                Appointment.patient_id == patient.id,
                Appointment.appointment_type == appointment_type,
                Appointment.appointment_date == appointment_date,
            ),
        )
        if not appointment:
            appointment = Appointment(
                tenant_id=tenant.id,
                branch_id=branch.id,
                patient_id=patient.id,
                department_id="ped" if visit_purpose == "pediatric_consultation" else "general",
                practitioner_id=DEMO_DOCTOR_ID,
                appointment_type=appointment_type,
                appointment_date=appointment_date,
                appointment_time=appointment_time,
                reason=f"Demo {visit_purpose.replace('_', ' ')} visit",
                visit_purpose=visit_purpose,
                source_appointment_id=source_appointment.id if appointment_type == AppointmentType.DOCTOR_REVIEW else None,
                is_billable=is_billable,
                billing_note="Demo free review within validity" if not is_billable else None,
                emergency_reason="Demo emergency priority patient" if appointment_type == AppointmentType.EMERGENCY else None,
                status=status_value,
                created_by_user_id=actor_user_id,
            )
            session.add(appointment)
            session.commit()
            session.refresh(appointment)
            record_audit_event(
                session,
                tenant_id=tenant.id,
                branch_id=branch.id,
                actor_user_id=actor_user_id,
                action="appointment.booked",
                resource_type="appointment",
                resource_id=appointment.id,
                purpose="customer_demo_seed",
            )
        queue_entry = _first_or_none(
            session,
            select(QueueEntry).where(QueueEntry.tenant_id == tenant.id, QueueEntry.appointment_id == appointment.id),
        )
        if not queue_entry:
            queue_entry = create_queue_entry_for_appointment(session, appointment)
        queue_entry.status = status_value
        session.add(queue_entry)
        session.commit()


def ensure_saas_revenue_demo_data(session: Session, tenant: Tenant, subscription: TenantSubscription) -> None:
    rows = [
        ("SUBINV-DEMO-PAID", "Demo paid subscription invoice", 4999, 900, SubscriptionInvoiceStatus.PAID, 5899, 5899, 0, "captured"),
        ("SUBINV-DEMO-PENDING", "Demo upcoming renewal invoice", 4999, 900, SubscriptionInvoiceStatus.ISSUED, 5899, 0, 5899, None),
        ("SUBINV-DEMO-FAILED", "Demo failed payment recovery invoice", 4999, 900, SubscriptionInvoiceStatus.ISSUED, 5899, 0, 5899, "failed"),
    ]
    for number, description, taxable, tax, status_value, total, paid, balance, gateway_status in rows:
        invoice = _first_or_none(
            session,
            select(SubscriptionInvoice).where(
                SubscriptionInvoice.tenant_id == tenant.id,
                SubscriptionInvoice.invoice_number == number,
            ),
        )
        if not invoice:
            invoice = SubscriptionInvoice(
                tenant_id=tenant.id,
                subscription_id=subscription.id,
                invoice_number=number,
                description=description,
                amount=taxable,
                taxable_amount=taxable,
                tax_amount=tax,
                total_amount=total,
                paid_amount=paid,
                balance_amount=balance,
                status=status_value,
                issued_on=date.today(),
                due_on=date.today(),
                paid_on=date.today() if status_value == SubscriptionInvoiceStatus.PAID else None,
                payment_method="upi" if status_value == SubscriptionInvoiceStatus.PAID else None,
                payment_reference="DEMO-UPI-PAID" if status_value == SubscriptionInvoiceStatus.PAID else None,
                gateway_transaction_id=f"demo-{number.lower()}",
                gateway_status=gateway_status,
                failed_reason="Demo gateway failure for recovery workflow" if gateway_status == "failed" else None,
                last_payment_attempt_at=datetime.now(timezone.utc) if gateway_status else None,
            )
            session.add(invoice)
        else:
            invoice.taxable_amount = taxable
            invoice.tax_amount = tax
            invoice.total_amount = total
            invoice.paid_amount = paid
            invoice.balance_amount = balance
            invoice.status = status_value
            invoice.gateway_status = gateway_status
            invoice.failed_reason = "Demo gateway failure for recovery workflow" if gateway_status == "failed" else None
            session.add(invoice)
    session.commit()


def seed_demo_data(session: Session) -> dict[str, str | int]:
    primary_tenant = ensure_primary_tenant(session)
    tenant = ensure_tenant(session)
    branch = ensure_branch(session, tenant)
    ensure_demo_departments(session, tenant, branch)
    plan, subscription = ensure_plan_and_subscription(session, tenant)
    ensure_settings(session, tenant, branch)
    admin_user = ensure_demo_users(session, tenant, branch, primary_tenant)
    ensure_demo_practitioner(session, tenant, branch)
    patient = ensure_patient(session, tenant, branch, admin_user.id)
    appointment = ensure_appointment(session, tenant, branch, patient, admin_user.id)
    queue_entry = ensure_queue_and_booking_notification(session, tenant, branch, patient, appointment, admin_user.id)
    consultation = ensure_consultation(session, tenant, branch, patient, appointment, admin_user.id)
    ensure_fee_rule(session, tenant, branch)
    ensure_demo_fee_rules(session, tenant, branch)
    invoice = ensure_invoice(session, appointment, consultation, admin_user.id)
    lab_order = ensure_lab_order(session, tenant, branch, patient, consultation, admin_user.id)
    pharmacy_issue = ensure_pharmacy_issue(session, tenant, branch, patient, consultation, admin_user.id)
    ensure_notifications(session, tenant, branch, patient, queue_entry, consultation, invoice, admin_user.id)
    ensure_customer_demo_dataset(session, tenant, branch, appointment, admin_user.id)
    ensure_saas_revenue_demo_data(session, tenant, subscription)
    notification_count = len(
        session.exec(select(NotificationEvent.id).where(NotificationEvent.tenant_id == tenant.id)).all()
    )
    return {
        "tenant_id": tenant.id,
        "primary_tenant_id": primary_tenant.id,
        "branch_id": branch.id,
        "plan_id": plan.id,
        "subscription_id": subscription.id,
        "super_admin_email": DEMO_SUPER_ADMIN_EMAIL,
        "super_admin_password": DEMO_SUPER_ADMIN_PASSWORD,
        "tenant_admin_email": DEMO_ADMIN_EMAIL,
        "tenant_admin_password": DEMO_ADMIN_PASSWORD,
        "staff_demo_password": DEMO_USER_PASSWORD,
        "reception_email": "reception@demo.medizinhub.local",
        "doctor_email": "doctor@demo.medizinhub.local",
        "lab_email": "lab@demo.medizinhub.local",
        "pharmacy_email": "pharmacy@demo.medizinhub.local",
        "billing_email": "billing@demo.medizinhub.local",
        "back_office_email": "backoffice@demo.medizinhub.local",
        "patient_id": patient.id,
        "patient_number": patient.patient_number,
        "appointment_id": appointment.id,
        "queue_entry_id": queue_entry.id,
        "token_number": queue_entry.token_number,
        "consultation_id": consultation.id,
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_balance": invoice.balance_amount,
        "lab_order_id": lab_order.id,
        "pharmacy_issue_id": pharmacy_issue.id,
        "notification_count": notification_count,
    }


def main() -> None:
    try:
        with Session(engine) as session:
            summary = seed_demo_data(session)
    except ProgrammingError as exc:
        if "UndefinedColumn" in str(exc) or "does not exist" in str(exc):
            raise SystemExit(
                "Database schema is not up to date. Run Alembic migrations first:\n\n"
                'MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" '
                ".venv/bin/alembic upgrade head\n\n"
                "Then run the seed command again."
            ) from exc
        raise
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
