import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_user_branch_access, scoped_branch_id
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
from app.modules.lab.models import LabOrder
from app.modules.patients.models import Patient
from app.modules.queue.models import QueueEntry

router = APIRouter(prefix="/consultations")


def _get_consultation_or_404(
    session: Session,
    tenant_id: str,
    consultation_id: str,
) -> Consultation:
    consultation = session.get(Consultation, consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    return consultation


def _read_detail(session: Session, consultation: Consultation) -> ConsultationDetailRead:
    addendums = list(
        session.exec(
            select(ConsultationAddendum)
            .where(
                ConsultationAddendum.tenant_id == consultation.tenant_id,
                ConsultationAddendum.consultation_id == consultation.id,
            )
            .order_by(ConsultationAddendum.created_at)
        ).all()
    )
    vitals = list(session.exec(select(ConsultationVital).where(ConsultationVital.consultation_id == consultation.id).order_by(ConsultationVital.created_at)).all())
    complaints = list(session.exec(select(ConsultationComplaint).where(ConsultationComplaint.consultation_id == consultation.id).order_by(ConsultationComplaint.created_at)).all())
    diagnoses = list(session.exec(select(ConsultationDiagnosis).where(ConsultationDiagnosis.consultation_id == consultation.id).order_by(ConsultationDiagnosis.created_at)).all())
    medicines = list(session.exec(select(ConsultationMedicine).where(ConsultationMedicine.consultation_id == consultation.id).order_by(ConsultationMedicine.created_at)).all())
    referrals = list(session.exec(select(ConsultationReferral).where(ConsultationReferral.consultation_id == consultation.id).order_by(ConsultationReferral.created_at)).all())
    lab_orders = list(
        session.exec(
            select(LabOrder)
            .where(LabOrder.tenant_id == consultation.tenant_id, LabOrder.consultation_id == consultation.id)
            .order_by(LabOrder.created_at.desc())
        ).all()
    )
    return ConsultationDetailRead(
        consultation=ConsultationRead.model_validate(consultation, from_attributes=True),
        addendums=[
            ConsultationAddendumRead.model_validate(addendum, from_attributes=True)
            for addendum in addendums
        ],
        vitals=[{"name": row.name, "value": row.value, "unit": row.unit} for row in vitals],
        complaints=[{"complaint": row.complaint, "duration": row.duration, "severity": row.severity} for row in complaints],
        diagnoses=[{"diagnosis": row.diagnosis, "diagnosis_type": row.diagnosis_type, "notes": row.notes} for row in diagnoses],
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


def _replace_structured_rows(session: Session, consultation: Consultation, payload: ConsultationCreate | ConsultationUpdate) -> None:
    mapping = [
        ("vitals", ConsultationVital),
        ("complaints", ConsultationComplaint),
        ("diagnoses", ConsultationDiagnosis),
        ("medicines", ConsultationMedicine),
        ("referrals", ConsultationReferral),
    ]
    for field_name, model in mapping:
        if not hasattr(payload, field_name):
            continue
        rows = getattr(payload, field_name)
        if rows is None:
            continue
        existing = list(session.exec(select(model).where(model.consultation_id == consultation.id)).all())
        for row in existing:
            session.delete(row)
        for row in rows:
            session.add(
                model(
                    tenant_id=consultation.tenant_id,
                    consultation_id=consultation.id,
                    **row.model_dump(),
                )
            )


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
    appointment = session.get(Appointment, payload.appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment")
    require_user_branch_access(current_user, appointment.branch_id)
    patient = session.get(Patient, appointment.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")

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
    session.add(consultation)
    session.add(appointment)
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
        actor_user_id=payload.created_by_user_id,
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
    statement = select(Consultation).where(Consultation.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Consultation.branch_id == branch_id)
    if patient_id:
        statement = statement.where(Consultation.patient_id == patient_id)
    if appointment_id:
        statement = statement.where(Consultation.appointment_id == appointment_id)
    return list(session.exec(statement.order_by(Consultation.created_at)).all())


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
    rows = list(
        session.exec(
            select(ClinicalTemplate).where(
                ClinicalTemplate.tenant_id == tenant_id,
                ClinicalTemplate.department_id == department_id,
                ClinicalTemplate.is_active == True,  # noqa: E712
            ).order_by(ClinicalTemplate.name)
        ).all()
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
    session.add(consultation)
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
    if consultation.status == ConsultationStatus.SIGNED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Consultation already signed")

    now = datetime.now(timezone.utc)
    consultation.status = ConsultationStatus.SIGNED
    consultation.signed_by_user_id = payload.signed_by_user_id
    consultation.signed_at = now
    consultation.updated_at = now

    appointment = session.get(Appointment, consultation.appointment_id)
    if appointment and appointment.tenant_id == tenant_id:
        appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
        appointment.updated_at = now
        session.add(appointment)

    queue_entry = session.exec(
        select(QueueEntry).where(
            QueueEntry.tenant_id == tenant_id,
            QueueEntry.appointment_id == consultation.appointment_id,
        )
    ).first()
    if queue_entry:
        queue_entry.status = AppointmentStatus.CONSULTATION_COMPLETED
        queue_entry.completed_at = now
        queue_entry.updated_at = now
        session.add(queue_entry)

    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=payload.signed_by_user_id,
        action="consultation.signed",
        resource_type="consultation",
        resource_id=consultation.id,
        purpose="treatment",
    )
    patient = session.get(Patient, consultation.patient_id)
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
                queued_by_user_id=payload.signed_by_user_id,
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
    if consultation.status != ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Addendums are only allowed after consultation is signed",
        )

    addendum = ConsultationAddendum(
        tenant_id=tenant_id,
        consultation_id=consultation.id,
        note=payload.note,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(addendum)
    session.commit()
    session.refresh(addendum)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=payload.created_by_user_id,
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
        created_by_user_id=payload.created_by_user_id or current_user.id,
    )
    session.add(template)
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
    statement = select(ClinicalTemplate).where(ClinicalTemplate.tenant_id == tenant_id, ClinicalTemplate.is_active == True)  # noqa: E712
    if department_id:
        statement = statement.where(ClinicalTemplate.department_id == department_id)
    rows = list(session.exec(statement.order_by(ClinicalTemplate.name)).all())
    return [_template_read(row) for row in rows]
