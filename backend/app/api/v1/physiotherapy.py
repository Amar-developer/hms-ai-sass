from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.access_control import require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, Payment, TaxRule
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceItemRead, InvoiceRead, PaymentRead
from app.modules.billing.service import next_invoice_number
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission
from app.modules.patients.models import Patient
from app.modules.physiotherapy.models import PhysiotherapyCase, PhysiotherapyEquipment, PhysiotherapySession
from app.modules.physiotherapy.schemas import (
    PhysiotherapyCaseCreate,
    PhysiotherapyCaseRead,
    PhysiotherapyCaseUpdate,
    PhysiotherapyEquipmentCreate,
    PhysiotherapyEquipmentRead,
    PhysiotherapyInvoiceCreate,
    PhysiotherapySessionCreate,
    PhysiotherapySessionRead,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/physiotherapy")


def _assert_enabled(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, "physiotherapy")


def _next_case_number(session: Session, tenant_id: str) -> str:
    count = session.exec(select(func.count()).select_from(PhysiotherapyCase).where(PhysiotherapyCase.tenant_id == tenant_id)).one()
    return f"PHY-{count + 1:06d}"


def _get_case(session: Session, tenant_id: str, case_id: str, current_user: User) -> PhysiotherapyCase:
    case = session.get(PhysiotherapyCase, case_id)
    if not case or case.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physiotherapy case not found")
    require_user_branch_access(current_user, case.branch_id)
    return case


def _invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id)
            .order_by(Payment.collected_at)
        ).all()
    )
    return InvoiceDetailRead(
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[InvoiceItemRead.model_validate(item, from_attributes=True) for item in items],
        payments=[PaymentRead.model_validate(payment, from_attributes=True) for payment in payments],
    )


def _resolve_tax_rule(session: Session, tenant_id: str, branch_id: str, tax_rule_id: str | None) -> TaxRule | None:
    tax_rule = session.get(TaxRule, tax_rule_id) if tax_rule_id else None
    if tax_rule:
        if (
            tax_rule.tenant_id != tenant_id
            or not tax_rule.is_active
            or tax_rule.branch_id not in {None, branch_id}
        ):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tax rule")
        return tax_rule
    return session.exec(
        select(TaxRule).where(
            TaxRule.tenant_id == tenant_id,
            TaxRule.is_active == True,  # noqa: E712
            (TaxRule.branch_id == branch_id) | (TaxRule.branch_id.is_(None)),
        )
    ).first()


def _sync_case_status_from_invoice(session: Session, case: PhysiotherapyCase, invoice: Invoice) -> PhysiotherapyCase:
    target_status = "paid" if invoice.balance_amount <= 0 and invoice.total_amount > 0 else "completed"
    if case.status != target_status:
        case.status = target_status
        case.updated_at = now_utc()
        session.add(case)
        session.commit()
        session.refresh(case)
    return case


@router.get("/equipment", response_model=list[PhysiotherapyEquipmentRead])
def list_equipment(
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapyEquipment]:
    _assert_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(PhysiotherapyEquipment).where(PhysiotherapyEquipment.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where((PhysiotherapyEquipment.branch_id == branch_scope) | (PhysiotherapyEquipment.branch_id.is_(None)))
    return list(session.exec(statement.order_by(PhysiotherapyEquipment.name)).all())


@router.post("/equipment", response_model=PhysiotherapyEquipmentRead, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: PhysiotherapyEquipmentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_CREATE)),
) -> PhysiotherapyEquipment:
    _assert_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    equipment = PhysiotherapyEquipment.model_validate(
        payload,
        update={"tenant_id": tenant_id, "created_by_user_id": current_user.id, "updated_by_user_id": current_user.id},
    )
    session.add(equipment)
    session.commit()
    session.refresh(equipment)
    record_audit_event(session, tenant_id=tenant_id, branch_id=equipment.branch_id, actor_user_id=current_user.id, action="physiotherapy_equipment.created", resource_type="physiotherapy_equipment", resource_id=equipment.id, purpose="physiotherapy")
    return equipment


@router.get("/cases", response_model=list[PhysiotherapyCaseRead])
def list_cases(
    branch_id: str | None = None,
    patient_id: str | None = None,
    care_context: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapyCase]:
    _assert_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(PhysiotherapyCase).where(PhysiotherapyCase.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where(PhysiotherapyCase.branch_id == branch_scope)
    if patient_id:
        statement = statement.where(PhysiotherapyCase.patient_id == patient_id)
    if care_context:
        statement = statement.where(PhysiotherapyCase.care_context == care_context)
    return list(session.exec(statement.order_by(PhysiotherapyCase.updated_at.desc(), PhysiotherapyCase.created_at.desc())).all())


@router.post("/cases", response_model=PhysiotherapyCaseRead, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: PhysiotherapyCaseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_CREATE)),
) -> PhysiotherapyCase:
    _assert_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    patient = session.get(Patient, payload.patient_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    if payload.source_appointment_id:
        appointment = session.get(Appointment, payload.source_appointment_id)
        if not appointment or appointment.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found")
    if payload.ip_admission_id:
        admission = session.get(IPAdmission, payload.ip_admission_id)
        if not admission or admission.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IP admission not found")
    case = PhysiotherapyCase.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "case_number": _next_case_number(session, tenant_id),
            "assessment_date": payload.assessment_date or date.today(),
            "care_context": payload.care_context.lower(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(case)
    session.commit()
    session.refresh(case)
    record_audit_event(session, tenant_id=tenant_id, branch_id=case.branch_id, actor_user_id=current_user.id, action="physiotherapy_case.created", resource_type="physiotherapy_case", resource_id=case.id, purpose="physiotherapy")
    return case


@router.patch("/cases/{case_id}", response_model=PhysiotherapyCaseRead)
def update_case(
    case_id: str,
    payload: PhysiotherapyCaseUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapyCase:
    _assert_enabled(session, tenant_id)
    case = _get_case(session, tenant_id, case_id, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(case, key, value)
    case.updated_at = now_utc()
    case.updated_by_user_id = current_user.id
    session.add(case)
    session.commit()
    session.refresh(case)
    record_audit_event(session, tenant_id=tenant_id, branch_id=case.branch_id, actor_user_id=current_user.id, action="physiotherapy_case.updated", resource_type="physiotherapy_case", resource_id=case.id, purpose="physiotherapy")
    return case


@router.get("/cases/{case_id}/sessions", response_model=list[PhysiotherapySessionRead])
def list_sessions(
    case_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_READ)),
) -> list[PhysiotherapySession]:
    _assert_enabled(session, tenant_id)
    case = _get_case(session, tenant_id, case_id, current_user)
    return list(session.exec(select(PhysiotherapySession).where(PhysiotherapySession.tenant_id == tenant_id, PhysiotherapySession.case_id == case.id).order_by(PhysiotherapySession.session_number)).all())


@router.post("/cases/{case_id}/sessions", response_model=PhysiotherapySessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    case_id: str,
    payload: PhysiotherapySessionCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHYSIOTHERAPY_EDIT)),
) -> PhysiotherapySession:
    _assert_enabled(session, tenant_id)
    case = _get_case(session, tenant_id, case_id, current_user)
    existing_invoice = session.exec(
        select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.physiotherapy_case_id == case.id)
    ).first()
    if existing_invoice:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot add sessions after physiotherapy invoice is generated")
    if payload.equipment_id:
        equipment = session.get(PhysiotherapyEquipment, payload.equipment_id)
        if not equipment or equipment.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physiotherapy equipment not found")
        require_user_branch_access(current_user, equipment.branch_id)
    count = session.exec(select(func.count()).select_from(PhysiotherapySession).where(PhysiotherapySession.tenant_id == tenant_id, PhysiotherapySession.case_id == case.id)).one()
    treatment = PhysiotherapySession.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": case.branch_id,
            "case_id": case.id,
            "session_date": payload.session_date or date.today(),
            "session_number": int(count or 0) + 1,
            "created_by_user_id": current_user.id,
        },
    )
    session.add(treatment)
    session.commit()
    session.refresh(treatment)
    record_audit_event(session, tenant_id=tenant_id, branch_id=case.branch_id, actor_user_id=current_user.id, action="physiotherapy_session.created", resource_type="physiotherapy_session", resource_id=treatment.id, purpose="physiotherapy")
    return treatment


@router.get("/cases/{case_id}/invoice", response_model=InvoiceDetailRead)
def get_case_invoice(
    case_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    _assert_enabled(session, tenant_id)
    case = _get_case(session, tenant_id, case_id, current_user)
    invoice = session.exec(
        select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.physiotherapy_case_id == case.id)
    ).first()
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Physiotherapy invoice not found")
    _sync_case_status_from_invoice(session, case, invoice)
    return _invoice_detail(session, invoice)


@router.post("/cases/{case_id}/invoice", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def generate_invoice(
    case_id: str,
    payload: PhysiotherapyInvoiceCreate | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    _assert_enabled(session, tenant_id)
    payload = payload or PhysiotherapyInvoiceCreate()
    case = _get_case(session, tenant_id, case_id, current_user)
    existing = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.physiotherapy_case_id == case.id)).first()
    if existing:
        _sync_case_status_from_invoice(session, case, existing)
        return _invoice_detail(session, existing)
    rows = list(
        session.exec(
            select(PhysiotherapySession).where(
                PhysiotherapySession.tenant_id == tenant_id,
                PhysiotherapySession.case_id == case.id,
                PhysiotherapySession.charge_amount > 0,
            )
        ).all()
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add at least one billable physiotherapy session before generating invoice")
    subtotal = sum(row.charge_amount for row in rows)
    discount = min(payload.discount_amount, subtotal)
    taxable = subtotal - discount
    tax_rule = _resolve_tax_rule(session, tenant_id, case.branch_id, payload.tax_rule_id)
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    invoice_prefix, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        branch_id=case.branch_id,
    )
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=case.branch_id,
        patient_id=case.patient_id,
        appointment_id=case.source_appointment_id,
        ip_admission_id=case.ip_admission_id,
        physiotherapy_case_id=case.id,
        invoice_number=next_invoice_number(session, tenant_id, str(invoice_prefix or "INV")),
        subtotal_amount=subtotal,
        discount_amount=discount,
        taxable_amount=taxable,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total,
        balance_amount=total,
        clinic_share_amount=total,
        created_by_user_id=payload.created_by_user_id or current_user.id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    for row in rows:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type="physiotherapy",
                description=f"Physiotherapy session {row.session_number}: {row.modality_type}",
                quantity=1,
                unit_amount=row.charge_amount,
                total_amount=row.charge_amount,
            )
        )
    session.commit()
    session.refresh(invoice)
    _sync_case_status_from_invoice(session, case, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=case.branch_id,
        actor_user_id=payload.created_by_user_id or current_user.id,
        action="physiotherapy_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="physiotherapy_billing",
        metadata_json=f'{{"physiotherapy_case_id":"{case.id}"}}',
    )
    return _invoice_detail(session, invoice)
