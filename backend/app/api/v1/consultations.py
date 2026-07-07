import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.access_control import (
    current_doctor_practitioner_id,
    enforce_entitlement,
    require_doctor_practitioner_access,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import (
    Consultation,
    ConsultationAddendum,
    ClinicalTemplate,
    ConsultationComplaint,
    ConsultationDiagnosis,
    ConsultationMedicine,
    ConsultationReferral,
    ConsultationStatus,
    ConsultationVital,
)
from app.modules.consultations.repositories import (
    ClinicalTemplateRepository,
    ConsultationBillingReferenceRepository,
    ConsultationDetailRepository,
    ConsultationReferenceRepository,
    ConsultationRepository,
    ConsultationStructuredRowRepository,
)
from app.modules.consultations.schemas import (
    ConsultationAddendumCreate,
    ConsultationAddendumRead,
    ConsultationCreate,
    ConsultationDetailRead,
    ConsultationRead,
    ConsultationSignRequest,
    ConsultationTemplateCreate,
    ConsultationTemplateRead,
    ConsultationUpdate,
)
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/consultations")


def _get_consultation_or_404(
    session: Session,
    tenant_id: str,
    consultation_id: str,
) -> Consultation:
    consultation = ConsultationRepository(session).get_for_tenant(
        tenant_id, consultation_id
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    return consultation


def _read_detail(
    session: Session, consultation: Consultation
) -> ConsultationDetailRead:
    details = ConsultationDetailRepository(session)
    addendums = details.list_addendums(consultation)
    vitals = details.list_vitals(consultation.id)
    complaints = details.list_complaints(consultation.id)
    diagnoses = details.list_diagnoses(consultation.id)
    medicines = details.list_medicines(consultation.id)
    referrals = details.list_referrals(consultation.id)
    lab_orders = details.list_lab_orders(consultation)
    return ConsultationDetailRead(
        consultation=ConsultationRead.model_validate(
            consultation, from_attributes=True
        ),
        addendums=[
            ConsultationAddendumRead.model_validate(addendum, from_attributes=True)
            for addendum in addendums
        ],
        vitals=[
            {"name": row.name, "value": row.value, "unit": row.unit} for row in vitals
        ],
        complaints=[
            {
                "complaint": row.complaint,
                "duration": row.duration,
                "severity": row.severity,
            }
            for row in complaints
        ],
        diagnoses=[
            {
                "diagnosis": row.diagnosis,
                "diagnosis_type": row.diagnosis_type,
                "notes": row.notes,
            }
            for row in diagnoses
        ],
        medicines=[
            {
                "medicine_name": row.medicine_name,
                "dosage": row.dosage,
                "frequency": row.frequency,
                "duration": row.duration,
                "instructions": row.instructions,
            }
            for row in medicines
        ],
        referrals=[
            {
                "referral_type": row.referral_type,
                "item_name": row.item_name,
                "priority": row.priority,
                "instructions": row.instructions,
            }
            for row in referrals
        ],
        lab_orders=[
            {
                "id": row.id,
                "status": row.status.value,
                "priority": row.priority.value,
                "tests": row.tests,
                "source": row.source.value,
                "result_ready_at": row.result_ready_at,
                "created_at": row.created_at,
            }
            for row in lab_orders
        ],
    )


def _replace_structured_rows(
    session: Session,
    consultation: Consultation,
    payload: ConsultationCreate | ConsultationUpdate,
) -> None:
    mapping = [
        ("vitals", ConsultationVital),
        ("complaints", ConsultationComplaint),
        ("diagnoses", ConsultationDiagnosis),
        ("medicines", ConsultationMedicine),
        ("referrals", ConsultationReferral),
    ]
    structured_rows = ConsultationStructuredRowRepository(session)
    for field_name, model in mapping:
        if not hasattr(payload, field_name):
            continue
        rows = getattr(payload, field_name)
        if rows is None:
            continue
        structured_rows.replace_rows(consultation=consultation, model=model, rows=rows)


def _template_read(template: ClinicalTemplate) -> ConsultationTemplateRead:
    try:
        content = json.loads(template.content_json or "{}")
    except json.JSONDecodeError:
        content = {}
    return ConsultationTemplateRead(
        id=template.id,
        tenant_id=template.tenant_id,
        department_id=template.department_id,
        name=template.name,
        template_type=template.template_type,
        content=content,
        is_active=template.is_active,
        created_by_user_id=template.created_by_user_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.post(
    "",
    response_model=ConsultationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_WRITE))],
)
def create_consultation(
    payload: ConsultationCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_WRITE)),
    session: Session = Depends(get_session),
) -> Consultation:
    enforce_entitlement(session, tenant_id, "consultations")
    references = ConsultationReferenceRepository(session)
    consultations = ConsultationRepository(session)
    appointment = references.get_appointment_for_tenant(
        tenant_id, payload.appointment_id
    )
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment"
        )
    require_user_branch_access(current_user, appointment.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, appointment.practitioner_id
    )
    patient = references.get_patient_for_tenant(tenant_id, appointment.patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient"
        )

    consultation = Consultation.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": appointment.branch_id,
            "patient_id": appointment.patient_id,
            "practitioner_id": appointment.practitioner_id,
            "status": ConsultationStatus.DRAFT,
        },
    )
    appointment.status = AppointmentStatus.IN_CONSULTATION
    consultations.add(consultation)
    references.add_appointment(appointment)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Consultation already exists for this appointment",
        ) from exc
    session.refresh(consultation)
    session.refresh(appointment)
    _replace_structured_rows(session, consultation, payload)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=current_user.id,
        action="consultation.created",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="treatment",
    )
    return consultation


@router.get(
    "",
    response_model=list[ConsultationRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_consultations(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    appointment_id: str | None = None,
    branch_id: str | None = None,
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> list[Consultation]:
    enforce_entitlement(session, tenant_id, "consultations")
    branch_id = scoped_branch_id(current_user, branch_id)
    doctor_practitioner_id = current_doctor_practitioner_id(
        session, tenant_id, current_user
    )
    return ConsultationRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        branch_id=branch_id,
        practitioner_id=doctor_practitioner_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
    )


@router.get(
    "/by-department/{department_id}/clinical-templates",
    response_model=list[ConsultationTemplateRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_department_clinical_templates(
    department_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
) -> list[ConsultationTemplateRead]:
    enforce_entitlement(session, tenant_id, "consultations")
    rows = ClinicalTemplateRepository(session).list_active_for_department(
        tenant_id=tenant_id, department_id=department_id
    )
    return [_template_read(row) for row in rows]


@router.get(
    "/{consultation_id}",
    response_model=ConsultationDetailRead,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def get_consultation(
    consultation_id: str,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_READ)),
    session: Session = Depends(get_session),
) -> ConsultationDetailRead:
    enforce_entitlement(session, tenant_id, "consultations")
    consultation = _get_consultation_or_404(session, tenant_id, consultation_id)
    require_user_branch_access(current_user, consultation.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, consultation.practitioner_id
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        action="consultation.viewed",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="treatment",
    )
    return _read_detail(session, consultation)


@router.patch(
    "/{consultation_id}",
    response_model=ConsultationRead,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_WRITE))],
)
def update_consultation(
    consultation_id: str,
    payload: ConsultationUpdate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_WRITE)),
    session: Session = Depends(get_session),
) -> Consultation:
    enforce_entitlement(session, tenant_id, "consultations")
    consultation = _get_consultation_or_404(session, tenant_id, consultation_id)
    require_user_branch_access(current_user, consultation.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, consultation.practitioner_id
    )
    if consultation.status == ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signed consultation records are immutable",
        )

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in {"vitals", "complaints", "diagnoses", "medicines", "referrals"}:
            continue
        setattr(consultation, key, value)
    consultation.status = ConsultationStatus.IN_PROGRESS
    consultation.updated_at = datetime.now(timezone.utc)
    ConsultationRepository(session).add(consultation)
    _replace_structured_rows(session, consultation, payload)
    session.commit()
    session.refresh(consultation)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        action="consultation.updated",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="treatment",
    )
    return consultation


def _auto_invoice_membership_consultation(
    session: Session,
    *,
    tenant_id: str,
    consultation: Consultation,
    appointment: Appointment | None,
    actor_user_id: str | None,
) -> None:
    """Generate the ₹0 consultation invoice for membership-covered visits.

    A free (membership) consultation otherwise never gets an invoice, because
    reception only generates one when collecting payment. Without it the
    membership benefit is never recorded (``used_consultations`` stays put) and
    there is no billing entry. When a signed consultation is fully covered by an
    active membership's free-consultation benefit, create that invoice here so
    the benefit usage and billing trail are captured. Paid / partially-covered
    visits are left to the existing manual reception flow.
    """
    # Local imports avoid any module-load import cycle with the billing service.
    from app.modules.billing.service import create_consultation_invoice
    from app.modules.patient_subscriptions.service import (
        active_patient_enrollment,
        benefit_preview,
        sync_free_item_usage_from_invoices,
    )

    if not appointment or appointment.tenant_id != tenant_id:
        return
    billing_refs = ConsultationBillingReferenceRepository(session)
    # Lock the consultation row so a concurrent sign-with-invoice request for
    # the same consultation serializes on the check-then-insert below; the
    # unique index on Invoice.consultation_id is the DB-level backstop if it
    # doesn't (e.g. a second process not going through this lock).
    billing_refs.lock_consultation(consultation.id)
    if billing_refs.has_existing_consultation_invoice(
        tenant_id=tenant_id, consultation_id=consultation.id
    ):
        return
    membership = active_patient_enrollment(
        session,
        tenant_id=tenant_id,
        patient_id=consultation.patient_id,
    )
    if not membership:
        return
    enrollment, plan = membership
    sync_free_item_usage_from_invoices(session, enrollment, plan)
    # A probe subtotal tells us whether a free-consultation benefit applies for
    # this department right now (the consultation branch returns the full
    # subtotal as the discount when a free slot remains).
    preview = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type="consultation",
        item_ids=[],
        subtotal_amount=100,
        department_id=appointment.department_id,
        session=session,
    )
    if int(preview.get("discount_amount") or 0) <= 0:
        return
    try:
        create_consultation_invoice(
            session,
            appointment=appointment,
            consultation_id=consultation.id,
            discount_amount=0,
            created_by_user_id=actor_user_id,
        )
    except IntegrityError:
        # A concurrent request already created the invoice for this
        # consultation between our check above and this insert; the unique
        # index on Invoice.consultation_id caught it. Nothing left to do.
        session.rollback()


@router.post(
    "/{consultation_id}/sign",
    response_model=ConsultationRead,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_SIGN))],
)
def sign_consultation(
    consultation_id: str,
    payload: ConsultationSignRequest,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_SIGN)),
    session: Session = Depends(get_session),
) -> Consultation:
    enforce_entitlement(session, tenant_id, "consultations")
    consultation = _get_consultation_or_404(session, tenant_id, consultation_id)
    require_user_branch_access(current_user, consultation.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, consultation.practitioner_id
    )
    if consultation.status == ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Consultation already signed"
        )

    now = datetime.now(timezone.utc)
    consultation.status = ConsultationStatus.SIGNED
    consultation.signed_by_user_id = current_user.id
    consultation.signed_at = now
    consultation.updated_at = now

    references = ConsultationReferenceRepository(session)
    appointment = references.get_appointment_for_tenant(
        tenant_id, consultation.appointment_id
    )
    if appointment:
        appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
        appointment.updated_at = now
        references.add_appointment(appointment)

    queue_entry = references.get_queue_entry_for_appointment(
        tenant_id, consultation.appointment_id
    )
    if queue_entry:
        queue_entry.status = AppointmentStatus.CONSULTATION_COMPLETED
        queue_entry.completed_at = now
        queue_entry.updated_at = now
        references.add_queue_entry(queue_entry)

    ConsultationRepository(session).add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=current_user.id,
        action="consultation.signed",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="treatment",
    )
    # Free (membership-covered) consultations otherwise never get a billing
    # entry. Signing is already committed above, so never let an invoicing
    # error fail the sign — log and continue.
    try:
        _auto_invoice_membership_consultation(
            session,
            tenant_id=tenant_id,
            consultation=consultation,
            appointment=appointment,
            actor_user_id=current_user.id,
        )
    except Exception:
        logger.warning(
            "Auto-invoice for membership consultation %s failed",
            consultation.id,
            exc_info=True,
        )
        session.rollback()
    patient = references.get_patient_for_tenant(tenant_id, consultation.patient_id)
    if consultation.follow_up_advice and patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=consultation.branch_id,
                provider=provider,
                event_type=NotificationEventType.FOLLOW_UP_REMINDER,
                recipient=patient.mobile,
                subject="Follow-up reminder",
                message=consultation.follow_up_advice,
                resource_type="consultation",
                resource_id=consultation.id,
                queued_by_user_id=current_user.id,
            )
    return consultation


@router.post(
    "/{consultation_id}/addendums",
    response_model=ConsultationAddendumRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_WRITE))],
)
def create_addendum(
    consultation_id: str,
    payload: ConsultationAddendumCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_WRITE)),
    session: Session = Depends(get_session),
) -> ConsultationAddendum:
    enforce_entitlement(session, tenant_id, "consultations")
    consultation = _get_consultation_or_404(session, tenant_id, consultation_id)
    require_user_branch_access(current_user, consultation.branch_id)
    require_doctor_practitioner_access(
        session, tenant_id, current_user, consultation.practitioner_id
    )
    if consultation.status != ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Addendums are only allowed after consultation is signed",
        )

    addendum = ConsultationAddendum(
        tenant_id=tenant_id,
        consultation_id=consultation.id,
        note=payload.note,
        created_by_user_id=current_user.id,
    )
    ConsultationRepository(session).add_addendum(addendum)
    session.commit()
    session.refresh(addendum)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=current_user.id,
        action="consultation.addendum.created",
        resource_type="consultation_addendum",
        resource_id=addendum.id,
        purpose="clinical_correction",
    )
    return addendum


@router.post(
    "/clinical-templates",
    response_model=ConsultationTemplateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_WRITE))],
)
def create_clinical_template(
    payload: ConsultationTemplateCreate,
    tenant_id: str = Depends(require_tenant_id),
    current_user: User = Depends(require_permission(permissions.CONSULTATIONS_WRITE)),
    session: Session = Depends(get_session),
) -> ConsultationTemplateRead:
    enforce_entitlement(session, tenant_id, "consultations")
    template = ClinicalTemplate(
        tenant_id=tenant_id,
        department_id=payload.department_id,
        name=payload.name,
        template_type=payload.template_type,
        content_json=json.dumps(payload.content),
        created_by_user_id=current_user.id,
    )
    ClinicalTemplateRepository(session).add(template)
    session.commit()
    session.refresh(template)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        actor_user_id=template.created_by_user_id,
        action="consultation.template.created",
        resource_type="clinical_template",
        resource_id=template.id,
        purpose="clinical_template_management",
    )
    return _template_read(template)


@router.get(
    "/clinical-templates",
    response_model=list[ConsultationTemplateRead],
    dependencies=[Depends(require_permission(permissions.CONSULTATIONS_READ))],
)
def list_clinical_templates(
    tenant_id: str = Depends(require_tenant_id),
    department_id: str | None = None,
    session: Session = Depends(get_session),
) -> list[ConsultationTemplateRead]:
    enforce_entitlement(session, tenant_id, "consultations")
    rows = ClinicalTemplateRepository(session).list_active(
        tenant_id=tenant_id, department_id=department_id
    )
    return [_template_read(row) for row in rows]
