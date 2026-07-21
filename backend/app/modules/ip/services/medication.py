from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.identity.models import User
from app.modules.ip.models import (
    IPAdmission,
    IPMedicationAdministration,
    IPMedicationOrder,
)
from app.modules.ip.repositories import IPClinicalRepository
from app.modules.ip.schemas import (
    IPMedicationAdministrationCreate,
    IPMedicationOrderCreate,
)
from app.modules.ip.services.billing import create_billing_item
from app.modules.ip.services.validation import (
    assert_ip_enabled,
    ensure_admission_open,
    get_admission,
)
from app.modules.tenants.models import now_utc


def create_medication_order_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPMedicationOrderCreate,
    current_user: User,
) -> IPMedicationOrder:
    order = IPMedicationOrder.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "start_date": payload.start_date or date.today(),
            "created_by_user_id": current_user.id,
        },
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_medication_order.created",
        resource_type="ip_medication_order",
        resource_id=order.id,
        purpose="ip_medication",
    )
    return order


def create_medication_order_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPMedicationOrderCreate,
    current_user: User,
) -> IPMedicationOrder:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_medication_order_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def administer_medication_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    order_id: str,
    payload: IPMedicationAdministrationCreate,
    current_user: User,
) -> IPMedicationAdministration:
    order = IPClinicalRepository(session).get_medication_order(
        tenant_id=tenant_id,
        admission_id=admission.id,
        order_id=order_id,
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medication order not found"
        )
    administration = IPMedicationAdministration.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "medication_order_id": order.id,
            "administered_at": payload.administered_at or now_utc(),
            "administered_by_user_id": current_user.id,
        },
    )
    if administration.status == "given" and order.unit_amount > 0:
        billing_item = create_billing_item(
            session,
            admission,
            source_type="medication_administration",
            source_id=administration.id,
            description=f"Medicine given - {order.medicine_name}{f' {order.dosage}' if order.dosage else ''}",
            quantity=administration.quantity,
            unit_amount=order.unit_amount,
            created_by_user_id=current_user.id,
        )
        session.flush()
        administration.billing_item_id = billing_item.id
    session.add(administration)
    session.commit()
    session.refresh(administration)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_medication_administration.created",
        resource_type="ip_medication_administration",
        resource_id=administration.id,
        purpose="ip_medication",
    )
    return administration


def administer_medication_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    order_id: str,
    payload: IPMedicationAdministrationCreate,
    current_user: User,
) -> IPMedicationAdministration:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return administer_medication_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        order_id=order_id,
        payload=payload,
        current_user=current_user,
    )
