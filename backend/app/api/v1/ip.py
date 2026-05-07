from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.access_control import require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment, AppointmentStatus
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceItemRead, InvoiceRead
from app.modules.billing.service import next_invoice_number
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission, IPCharge, IPConsentForm, IPConsultation, IPDischargeSummary, IPTreatment
from app.modules.ip.schemas import (
    IPAdmissionCreate,
    IPAdmissionRead,
    IPAdmissionUpdate,
    IPChargeCreate,
    IPChargeRead,
    IPConsentFormCreate,
    IPConsentFormRead,
    IPConsultationCreate,
    IPConsultationRead,
    IPDischargeSummaryCreate,
    IPDischargeSummaryRead,
    IPTreatmentCreate,
    IPTreatmentRead,
)
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/ip")


def _simple_pdf(lines: list[str]) -> bytes:
    text = "\\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 12 Tf 50 760 Td ({text}) Tj ET"
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        + f"5 0 obj << /Length {len(stream)} >> stream\n{stream}\nendstream endobj\n".encode()
        + b"xref\n0 6\n0000000000 65535 f \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF"
    )


def _assert_ip_enabled(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, "ip")


def _next_admission_number(session: Session, tenant_id: str) -> str:
    count = session.exec(select(func.count()).select_from(IPAdmission).where(IPAdmission.tenant_id == tenant_id)).one()
    return f"IP-{count + 1:06d}"


def _get_admission(session: Session, tenant_id: str, admission_id: str, current_user: User) -> IPAdmission:
    admission = session.get(IPAdmission, admission_id)
    if not admission or admission.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP admission not found")
    require_user_branch_access(current_user, admission.branch_id)
    return admission


def _invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    return InvoiceDetailRead(
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[InvoiceItemRead.model_validate(item, from_attributes=True) for item in items],
        payments=[],
    )


@router.get("/admissions", response_model=list[IPAdmissionRead])
def list_admissions(
    branch_id: str | None = None,
    patient_id: str | None = None,
    status_filter: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPAdmission]:
    _assert_ip_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(IPAdmission).where(IPAdmission.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where(IPAdmission.branch_id == branch_scope)
    if patient_id:
        statement = statement.where(IPAdmission.patient_id == patient_id)
    if status_filter:
        statement = statement.where(IPAdmission.status == status_filter)
    return list(session.exec(statement.order_by(IPAdmission.updated_at.desc(), IPAdmission.created_at.desc())).all())


@router.post("/admissions", response_model=IPAdmissionRead, status_code=status.HTTP_201_CREATED)
def create_admission(
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    _assert_ip_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    appointment = session.get(Appointment, payload.source_appointment_id) if payload.source_appointment_id else None
    if appointment and appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source appointment not found")
    admission = IPAdmission.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "admission_number": _next_admission_number(session, tenant_id),
            "admission_date": payload.admission_date or date.today(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(admission)
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.created",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
        metadata_json=f'{{"source_appointment_id":"{admission.source_appointment_id or ""}"}}',
    )
    return admission


@router.post("/admissions/from-appointment/{appointment_id}", response_model=IPAdmissionRead, status_code=status.HTTP_201_CREATED)
def convert_op_to_ip(
    appointment_id: str,
    payload: IPAdmissionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_CREATE)),
) -> IPAdmission:
    appointment = session.get(Appointment, appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    payload = payload.model_copy(
        update={
            "branch_id": appointment.branch_id,
            "patient_id": appointment.patient_id,
            "department_id": payload.department_id or appointment.department_id,
            "admitting_practitioner_id": payload.admitting_practitioner_id or appointment.practitioner_id,
            "source_appointment_id": appointment.id,
        }
    )
    admission = create_admission(payload, tenant_id, session, current_user)
    appointment.status = AppointmentStatus.CONSULTATION_COMPLETED
    session.add(appointment)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=appointment.branch_id,
        actor_user_id=current_user.id,
        action="appointment.converted_to_ip",
        resource_type="appointment",
        resource_id=appointment.id,
        purpose="ip_conversion",
        metadata_json=f'{{"ip_admission_id":"{admission.id}"}}',
    )
    return admission


@router.patch("/admissions/{admission_id}", response_model=IPAdmissionRead)
def update_admission(
    admission_id: str,
    payload: IPAdmissionUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPAdmission:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(admission, key, value)
    admission.updated_by_user_id = current_user.id
    session.add(admission)
    session.commit()
    session.refresh(admission)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_admission.updated",
        resource_type="ip_admission",
        resource_id=admission.id,
        purpose="ip_management",
    )
    return admission


@router.post("/admissions/{admission_id}/treatments", response_model=IPTreatmentRead, status_code=status.HTTP_201_CREATED)
def add_treatment(
    admission_id: str,
    payload: IPTreatmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPTreatment:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    treatment = IPTreatment.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "treatment_date": payload.treatment_date or date.today(),
            "created_by_user_id": current_user.id,
        },
    )
    admission.status = "under_treatment"
    session.add(treatment)
    session.add(admission)
    session.commit()
    session.refresh(treatment)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_treatment.created", resource_type="ip_treatment", resource_id=treatment.id, purpose="ip_treatment")
    return treatment


@router.get("/admissions/{admission_id}/treatments", response_model=list[IPTreatmentRead])
def list_treatments(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPTreatment]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(session.exec(select(IPTreatment).where(IPTreatment.tenant_id == tenant_id, IPTreatment.admission_id == admission.id).order_by(IPTreatment.created_at.desc())).all())


@router.post("/admissions/{admission_id}/consultations", response_model=IPConsultationRead, status_code=status.HTTP_201_CREATED)
def create_ip_consultation(
    admission_id: str,
    payload: IPConsultationCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    consultation = IPConsultation.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "consultation_date": payload.consultation_date or date.today(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_consultation.created", resource_type="ip_consultation", resource_id=consultation.id, purpose="ip_consultation")
    return consultation


@router.post("/consultations/{consultation_id}/sign", response_model=IPConsultationRead)
def sign_ip_consultation(
    consultation_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsultation:
    consultation = session.get(IPConsultation, consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP consultation not found")
    _get_admission(session, tenant_id, consultation.admission_id, current_user)
    consultation.status = "signed"
    signed_at = now_utc()
    consultation.signed_at = signed_at
    consultation.updated_at = signed_at
    consultation.updated_by_user_id = current_user.id
    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(session, tenant_id=tenant_id, branch_id=consultation.branch_id, actor_user_id=current_user.id, action="ip_consultation.signed", resource_type="ip_consultation", resource_id=consultation.id, purpose="ip_consultation")
    return consultation


@router.post("/admissions/{admission_id}/consents", response_model=IPConsentFormRead, status_code=status.HTTP_201_CREATED)
def create_consent(
    admission_id: str,
    payload: IPConsentFormCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    consent = IPConsentForm.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(consent)
    session.commit()
    session.refresh(consent)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_consent.created", resource_type="ip_consent", resource_id=consent.id, purpose="patient_consent")
    return consent


@router.post("/consents/{consent_id}/sign", response_model=IPConsentFormRead)
def sign_consent(
    consent_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPConsentForm:
    consent = session.get(IPConsentForm, consent_id)
    if not consent or consent.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found")
    _get_admission(session, tenant_id, consent.admission_id, current_user)
    consent.status = "signed"
    signed_at = now_utc()
    consent.signed_at = signed_at
    consent.updated_at = signed_at
    consent.updated_by_user_id = current_user.id
    session.add(consent)
    session.commit()
    session.refresh(consent)
    record_audit_event(session, tenant_id=tenant_id, branch_id=consent.branch_id, actor_user_id=current_user.id, action="ip_consent.signed", resource_type="ip_consent", resource_id=consent.id, purpose="patient_consent")
    return consent


@router.post("/admissions/{admission_id}/discharge-summary", response_model=IPDischargeSummaryRead, status_code=status.HTTP_201_CREATED)
def create_discharge_summary(
    admission_id: str,
    payload: IPDischargeSummaryCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    summary = IPDischargeSummary.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "discharge_date": payload.discharge_date or date.today(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    admission.status = "discharge_initiated"
    session.add(summary)
    session.add(admission)
    session.commit()
    session.refresh(summary)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.created", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="ip_discharge")
    return summary


@router.post("/discharge-summaries/{summary_id}/finalize", response_model=IPDischargeSummaryRead)
def finalize_discharge_summary(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPDischargeSummary:
    summary = session.get(IPDischargeSummary, summary_id)
    if not summary or summary.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found")
    admission = _get_admission(session, tenant_id, summary.admission_id, current_user)
    summary.status = "finalized"
    finalized_at = now_utc()
    summary.finalized_at = finalized_at
    summary.updated_at = finalized_at
    summary.updated_by_user_id = current_user.id
    admission.status = "discharged"
    admission.updated_by_user_id = current_user.id
    session.add(summary)
    session.add(admission)
    session.commit()
    session.refresh(summary)
    record_audit_event(session, tenant_id=tenant_id, branch_id=summary.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.finalized", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="ip_discharge")
    return summary


@router.post("/admissions/{admission_id}/charges", response_model=IPChargeRead, status_code=status.HTTP_201_CREATED)
def add_charge(
    admission_id: str,
    payload: IPChargeCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_EDIT)),
) -> IPCharge:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    charge = IPCharge.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "total_amount": payload.quantity * payload.unit_amount,
            "created_by_user_id": current_user.id,
        },
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_charge.created", resource_type="ip_charge", resource_id=charge.id, purpose="ip_billing")
    return charge


@router.get("/admissions/{admission_id}/charges", response_model=list[IPChargeRead])
def list_charges(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> list[IPCharge]:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    return list(session.exec(select(IPCharge).where(IPCharge.tenant_id == tenant_id, IPCharge.admission_id == admission.id).order_by(IPCharge.created_at)).all())


@router.post("/admissions/{admission_id}/invoice", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def generate_ip_invoice(
    admission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    _assert_ip_enabled(session, tenant_id)
    admission = _get_admission(session, tenant_id, admission_id, current_user)
    charges = list(session.exec(select(IPCharge).where(IPCharge.tenant_id == tenant_id, IPCharge.admission_id == admission.id)).all())
    if not charges:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add at least one IP charge before generating invoice")
    existing = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.ip_admission_id == admission.id)).first()
    if existing:
        return _invoice_detail(session, existing)
    subtotal = sum(charge.total_amount for charge in charges)
    invoice_prefix, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        branch_id=admission.branch_id,
    )
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        patient_id=admission.patient_id,
        appointment_id=admission.source_appointment_id,
        ip_admission_id=admission.id,
        invoice_number=next_invoice_number(session, tenant_id, str(invoice_prefix or "INV")),
        subtotal_amount=subtotal,
        taxable_amount=subtotal,
        total_amount=subtotal,
        balance_amount=subtotal,
        clinic_share_amount=subtotal,
        created_by_user_id=current_user.id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    for charge in charges:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=f"ip_{charge.charge_type}",
                description=charge.description,
                quantity=charge.quantity,
                unit_amount=charge.unit_amount,
                total_amount=charge.total_amount,
            )
        )
    session.commit()
    session.refresh(invoice)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_invoice.generated", resource_type="invoice", resource_id=invoice.id, purpose="ip_billing", metadata_json=f'{{"ip_admission_id":"{admission.id}"}}')
    return _invoice_detail(session, invoice)


@router.get("/discharge-summaries/{summary_id}/pdf")
def discharge_summary_pdf(
    summary_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.IP_READ)),
) -> Response:
    summary = session.get(IPDischargeSummary, summary_id)
    if not summary or summary.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found")
    admission = _get_admission(session, tenant_id, summary.admission_id, current_user)
    patient = session.get(Patient, admission.patient_id)
    record_audit_event(session, tenant_id=tenant_id, branch_id=admission.branch_id, actor_user_id=current_user.id, action="ip_discharge_summary.exported", resource_type="ip_discharge_summary", resource_id=summary.id, purpose="discharge_pdf")
    pdf = _simple_pdf(
        [
            "MedizinHub HMS - Discharge Summary",
            f"Admission: {admission.admission_number}",
            f"Patient: {patient.full_name if patient else admission.patient_id}",
            f"Discharge Date: {summary.discharge_date}",
            f"Diagnosis: {summary.final_diagnosis}",
            f"Course: {summary.course_in_hospital or ''}",
            f"Advice: {summary.follow_up_advice or ''}",
        ]
    )
    return Response(content=pdf, media_type="application/pdf")
