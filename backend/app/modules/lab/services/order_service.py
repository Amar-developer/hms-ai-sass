from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.lab.models import (
    LabOrder,
    LabOrderItem,
    LabOrderSource,
    LabOrderStatus,
)
from app.modules.lab.repositories import LabOrderRepository, LabReferenceRepository
from app.modules.lab.schemas import (
    LabOrderCreate,
    LabOrderDetailRead,
    LabOrderFromConsultation,
    LabOrderStatusUpdate,
)
from app.modules.lab.services.catalog import (
    _find_lab_package,
    _find_lab_test,
    _price_payload,
    _resolve_lab_price,
)
from app.modules.lab.services.detail_builder import read_order_detail
from app.modules.lab.services.pricing import add_order_items, reprice_zero_order_items
from app.modules.lab.services.referrals import _fallback_lab_referrals
from app.modules.lab.services.validation import (
    _get_order_or_404,
    _validate_patient_branch,
)
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_module_enabled


def create_lab_order_record(
    session: Session,
    *,
    tenant_id: str,
    payload: LabOrderCreate,
    current_user: User,
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    _validate_patient_branch(session, tenant_id, payload.patient_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.consultation_id:
        consultation = LabReferenceRepository(session).get_consultation_for_tenant(
            tenant_id=tenant_id,
            consultation_id=payload.consultation_id,
        )
        if not consultation or consultation.patient_id != payload.patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation"
            )

    order = LabOrder.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "lab_order_number": next_document_number(
                session,
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                entity="lab_order",
            ),
        },
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    add_order_items(
        session,
        order=order,
        test_ids=payload.test_ids,
        package_ids=payload.package_ids,
        external_items=[item.model_dump() for item in payload.external_items],
    )
    if order.amount == 0:
        reprice_zero_order_items(session, order)
    session.add(order)
    session.commit()
    session.refresh(order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.ordered_by_user_id,
        action="lab_order.created",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return order


def create_lab_order_from_consultation_record(
    session: Session,
    *,
    tenant_id: str,
    consultation_id: str,
    payload: LabOrderFromConsultation,
    current_user: User,
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    reference_repo = LabReferenceRepository(session)
    order_repo = LabOrderRepository(session)
    consultation = reference_repo.get_consultation_for_tenant(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    if not consultation.lab_referral_text:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Consultation has no lab referral",
        )
    require_user_branch_access(current_user, consultation.branch_id)
    existing = order_repo.get_by_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation.id,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Lab order already exists"
        )
    order = LabOrder(
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        lab_order_number=next_document_number(
            session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            entity="lab_order",
        ),
        source=LabOrderSource.CONSULTATION,
        priority=payload.priority,
        tests=consultation.lab_referral_text,
        amount=payload.amount,
        ordered_by_user_id=payload.ordered_by_user_id,
    )
    session.add(order)
    session.commit()
    session.refresh(order)
    structured_referrals = reference_repo.list_structured_referrals(
        tenant_id=tenant_id,
        consultation_ids=[consultation.id],
    )
    referrals = [
        {
            "item_name": row.item_name,
            "priority": row.priority,
            "instructions": row.instructions,
        }
        for row in structured_referrals
    ] or _fallback_lab_referrals(consultation.lab_referral_text)
    total = 0
    for referral in referrals:
        item_name = str(referral["item_name"] or "").strip()
        if not item_name:
            continue
        test = _find_lab_test(session, tenant_id, consultation.branch_id, item_name)
        package = (
            None
            if test
            else _find_lab_package(
                session, tenant_id, consultation.branch_id, item_name
            )
        )
        if test:
            pricing = _resolve_lab_price(test, item_name)
        elif package:
            pricing = _price_payload(
                price=package.package_price,
                mrp_price=package.mrp_price or package.package_price,
                selling_price=package.package_price,
                buying_price=package.purchase_price,
                supplier_id=package.supplier_id,
            )
        else:
            pricing = _price_payload(price=0)
        total += int(pricing.get("price") or 0)
        session.add(
            LabOrderItem(
                tenant_id=tenant_id,
                branch_id=order.branch_id,
                lab_order_id=order.id,
                test_id=test.id if test else None,
                package_id=package.id if package else None,
                test_name=test.name if test else package.name if package else item_name,
                sample_type=test.sample_type if test else None,
                **pricing,
            )
        )
    if referrals and order.amount == 0:
        order.amount = total
    session.add(order)
    session.commit()
    session.refresh(order)
    if order.amount == 0:
        reprice_zero_order_items(session, order)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.ordered_by_user_id,
        action="lab_order.created_from_consultation",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
    )
    return order


def list_lab_orders_records(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str | None,
    patient_id: str | None,
    status_filter: LabOrderStatus | None,
) -> list[LabOrder]:
    enforce_module_enabled(session, tenant_id, "lab")
    rows = LabOrderRepository(session).list_orders(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        status_filter=status_filter,
    )
    for order in rows:
        if int(order.amount or 0) <= 0:
            reprice_zero_order_items(session, order)
    return rows


def get_lab_order_detail(
    session: Session, *, tenant_id: str, order_id: str, current_user: User
) -> LabOrderDetailRead:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    return read_order_detail(session, order)


def update_lab_order_status_record(
    session: Session,
    *,
    tenant_id: str,
    order_id: str,
    payload: LabOrderStatusUpdate,
    current_user: User,
) -> LabOrder:
    enforce_module_enabled(session, tenant_id, "lab")
    order = _get_order_or_404(session, tenant_id, order_id)
    require_user_branch_access(current_user, order.branch_id)
    before = {
        "status": order.status,
        "notes": order.notes,
        "cancelled_reason": order.cancelled_reason,
    }
    now = datetime.now(timezone.utc)
    order.status = payload.status
    order.updated_at = now
    if payload.notes is not None:
        order.notes = payload.notes
    if payload.status == LabOrderStatus.SAMPLE_COLLECTED:
        order.sample_collected_at = now
    if payload.status == LabOrderStatus.RESULT_READY:
        order.result_ready_at = now
    if payload.status == LabOrderStatus.CANCELLED:
        if not payload.reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cancellation reason is required",
            )
        order.cancelled_reason = payload.reason
    session.add(order)
    session.commit()
    session.refresh(order)
    after = {
        "status": order.status,
        "notes": order.notes,
        "cancelled_reason": order.cancelled_reason,
    }
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        actor_user_id=payload.actor_user_id,
        action=f"lab_order.{payload.status.value}",
        resource_type="lab_order",
        resource_id=order.id,
        purpose="diagnostics",
        changes=diff_changes(before, after),
    )
    return order
