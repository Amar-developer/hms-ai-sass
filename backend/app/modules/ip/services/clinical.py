from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_doctor_practitioner_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.ip.models import (
    IPAdmission,
    IPConsentForm,
    IPConsultation,
    IPDischargeSummary,
    IPTreatment,
)
from app.modules.ip.repositories import IPBillingRepository, IPClinicalRepository
from app.modules.ip.schemas import (
    IPConsentFormCreate,
    IPConsultationCreate,
    IPDischargeSummaryCreate,
    IPTreatmentCreate,
)
from app.modules.ip.services.billing import create_billing_item
from app.modules.ip.services.validation import (
    assert_ip_enabled,
    chargeable_days,
    ensure_admission_open,
    get_admission,
)
from app.modules.tenants.models import now_utc


def create_treatment_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPTreatmentCreate,
    current_user: User,
) -> IPTreatment:
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
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_treatment.created",
        resource_type="ip_treatment",
        resource_id=treatment.id,
        purpose="ip_treatment",
    )
    return treatment


def create_treatment_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPTreatmentCreate,
    current_user: User,
) -> IPTreatment:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_treatment_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def create_ip_consultation_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPConsultationCreate,
    current_user: User,
) -> IPConsultation:
    # A doctor may only record an IP consultation under their own practitioner
    # profile — not another doctor's, matching outpatient consultation scoping.
    require_doctor_practitioner_access(
        session, tenant_id, current_user, payload.practitioner_id
    )
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
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_consultation.created",
        resource_type="ip_consultation",
        resource_id=consultation.id,
        purpose="ip_consultation",
    )
    return consultation


def create_ip_consultation_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPConsultationCreate,
    current_user: User,
) -> IPConsultation:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_ip_consultation_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def sign_ip_consultation_record(
    session: Session,
    *,
    tenant_id: str,
    consultation: IPConsultation,
    admission: IPAdmission,
    current_user: User,
) -> IPConsultation:
    # A doctor can only sign their own IP consultation, not another doctor's.
    require_doctor_practitioner_access(
        session, tenant_id, current_user, consultation.practitioner_id
    )
    before = {
        "status": consultation.status,
        "billing_item_id": consultation.billing_item_id,
    }
    consultation.status = "signed"
    signed_at = now_utc()
    consultation.signed_at = signed_at
    consultation.updated_at = signed_at
    consultation.updated_by_user_id = current_user.id
    if consultation.fee_amount > 0 and not consultation.billing_item_id:
        billing_item = create_billing_item(
            session,
            admission,
            source_type="doctor_consultation",
            source_id=consultation.id,
            description=f"IP doctor consultation - {consultation.consultation_type.replace('_', ' ')}",
            quantity=1,
            unit_amount=consultation.fee_amount,
            created_by_user_id=current_user.id,
        )
        session.flush()
        consultation.billing_item_id = billing_item.id
    session.add(consultation)
    session.commit()
    session.refresh(consultation)
    record_audit_event(
        session,
        tenant_id=consultation.tenant_id,
        branch_id=consultation.branch_id,
        actor_user_id=current_user.id,
        action="ip_consultation.signed",
        resource_type="ip_consultation",
        resource_id=consultation.id,
        purpose="ip_consultation",
        changes=diff_changes(
            before,
            {
                "status": consultation.status,
                "billing_item_id": consultation.billing_item_id,
            },
        ),
    )
    return consultation


def sign_ip_consultation_by_id(
    session: Session,
    *,
    tenant_id: str,
    consultation_id: str,
    current_user: User,
) -> IPConsultation:
    consultation = IPClinicalRepository(session).get_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="IP consultation not found"
        )
    admission = get_admission(
        session, tenant_id, consultation.admission_id, current_user
    )
    ensure_admission_open(admission)
    return sign_ip_consultation_record(
        session,
        tenant_id=tenant_id,
        consultation=consultation,
        admission=admission,
        current_user=current_user,
    )


def create_consent_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPConsentFormCreate,
    current_user: User,
) -> IPConsentForm:
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
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_consent.created",
        resource_type="ip_consent",
        resource_id=consent.id,
        purpose="patient_consent",
    )
    return consent


def create_consent_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPConsentFormCreate,
    current_user: User,
) -> IPConsentForm:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_consent_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def sign_consent_record(
    session: Session,
    *,
    consent: IPConsentForm,
    current_user: User,
) -> IPConsentForm:
    before = {"status": consent.status}
    consent.status = "signed"
    signed_at = now_utc()
    consent.signed_at = signed_at
    consent.updated_at = signed_at
    consent.updated_by_user_id = current_user.id
    session.add(consent)
    session.commit()
    session.refresh(consent)
    record_audit_event(
        session,
        tenant_id=consent.tenant_id,
        branch_id=consent.branch_id,
        actor_user_id=current_user.id,
        action="ip_consent.signed",
        resource_type="ip_consent",
        resource_id=consent.id,
        purpose="patient_consent",
        changes=diff_changes(before, {"status": consent.status}),
    )
    return consent


def sign_consent_by_id(
    session: Session,
    *,
    tenant_id: str,
    consent_id: str,
    current_user: User,
) -> IPConsentForm:
    consent = IPClinicalRepository(session).get_consent(
        tenant_id=tenant_id,
        consent_id=consent_id,
    )
    if not consent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found"
        )
    admission = get_admission(session, tenant_id, consent.admission_id, current_user)
    ensure_admission_open(admission)
    return sign_consent_record(
        session,
        consent=consent,
        current_user=current_user,
    )


def create_discharge_summary_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPDischargeSummaryCreate,
    current_user: User,
) -> IPDischargeSummary:
    discharge_date = payload.discharge_date or date.today()
    chargeable_days(admission.admission_date, discharge_date)
    summary = IPDischargeSummary.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "discharge_date": discharge_date,
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    admission.status = "discharge_initiated"
    session.add(summary)
    session.add(admission)
    session.commit()
    session.refresh(summary)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_discharge_summary.created",
        resource_type="ip_discharge_summary",
        resource_id=summary.id,
        purpose="ip_discharge",
    )
    return summary


def create_discharge_summary_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPDischargeSummaryCreate,
    current_user: User,
) -> IPDischargeSummary:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_discharge_summary_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def finalize_discharge_summary_record(
    session: Session,
    *,
    tenant_id: str,
    summary_id: str,
    current_user: User,
) -> IPDischargeSummary:
    summary = IPClinicalRepository(session).get_discharge_summary(
        tenant_id=tenant_id,
        summary_id=summary_id,
    )
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Discharge summary not found"
        )
    admission = get_admission(session, tenant_id, summary.admission_id, current_user)
    ensure_admission_open(admission)
    invoice = IPBillingRepository(session).get_invoice_for_admission(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Generate IP invoice before finalizing discharge",
        )
    before = {"status": summary.status}
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
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=summary.branch_id,
        actor_user_id=current_user.id,
        action="ip_discharge_summary.finalized",
        resource_type="ip_discharge_summary",
        resource_id=summary.id,
        purpose="ip_discharge",
        changes=diff_changes(before, {"status": summary.status}),
    )
    return summary
