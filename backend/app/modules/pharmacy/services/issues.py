import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.identity.models import User
from app.modules.pharmacy.models import (
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacyIssueSource,
    PharmacyIssueStatus,
    StockLedgerMovement,
)
from app.modules.pharmacy.repositories import (
    PharmacyCatalogRepository,
    PharmacyIssueRepository,
    PharmacyReferenceRepository,
    PharmacyStockRepository,
)
from app.modules.pharmacy.schemas import (
    PharmacyBillingLink,
    PharmacyIssueAmountUpdate,
    PharmacyIssueCreate,
    PharmacyIssueFromConsultation,
    PharmacyIssueStatusUpdate,
)
from app.modules.pharmacy.services.prescriptions import add_consultation_issue_items
from app.modules.pharmacy.services.stock import record_stock
from app.modules.pharmacy.services.validation import (
    get_issue_or_404,
    validate_patient_branch,
)
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_module_enabled


def add_issue_items(session: Session, issue: PharmacyIssue, payload_items) -> None:
    catalog_repo = PharmacyCatalogRepository(session)
    stock_repo = PharmacyStockRepository(session)
    total = 0
    names = []
    for item in payload_items:
        medicine = (
            catalog_repo.get_medicine_for_tenant(
                tenant_id=issue.tenant_id,
                medicine_id=item.medicine_id,
            )
            if item.medicine_id
            else None
        )
        if item.medicine_id and not medicine:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine"
            )
        batch = (
            stock_repo.get_batch_for_issue(
                tenant_id=issue.tenant_id,
                branch_id=issue.branch_id,
                batch_id=item.batch_id,
            )
            if item.batch_id
            else None
        )
        if item.batch_id and not batch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine batch"
            )
        name = item.medicine_name or (medicine.name if medicine else None)
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Medicine name is required",
            )
        reference_price = (
            batch.sale_price
            if batch
            else medicine.default_sale_price
            if medicine
            else 0
        )
        if (
            item.unit_price is not None
            and reference_price
            and item.unit_price < reference_price
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Unit price for '{name}' cannot be below the catalog price "
                    f"({reference_price}). Apply a discount instead."
                ),
            )
        unit_price = item.unit_price or reference_price
        total += unit_price * item.quantity
        names.append(name)
        session.add(
            PharmacyIssueItem(
                tenant_id=issue.tenant_id,
                branch_id=issue.branch_id,
                pharmacy_issue_id=issue.id,
                medicine_id=item.medicine_id,
                substitute_for_medicine_id=item.substitute_for_medicine_id,
                batch_id=item.batch_id,
                medicine_name=name,
                quantity=item.quantity,
                unit_price=unit_price,
            )
        )
    if names:
        issue.medicine_text = ", ".join(names)
    if total and issue.amount == 0:
        issue.amount = total


def dispense_issue_items(
    session: Session,
    *,
    tenant_id: str,
    issue: PharmacyIssue,
    payload_items,
    actor_user_id: str | None,
    now,
) -> None:
    issue_repository = PharmacyIssueRepository(session)
    stock_repository = PharmacyStockRepository(session)
    items = issue_repository.list_items_by_issue_id(issue.id)
    if payload_items:
        add_issue_items(session, issue, payload_items)
        session.flush()
        items = issue_repository.list_items_by_issue_id(issue.id)
    expiry_floor = datetime.utcnow()
    for item in items:
        if item.medicine_id:
            batch = None
            if item.batch_id:
                batch = stock_repository.get_batch_for_update(item.batch_id)
                if batch and (
                    batch.tenant_id != tenant_id or batch.branch_id != issue.branch_id
                ):
                    batch = None
                if (
                    batch
                    and batch.expiry_date is not None
                    and batch.expiry_date < expiry_floor
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Batch for {item.medicine_name} has expired and cannot be dispensed",
                    )
            if not batch:
                batch = stock_repository.find_available_batch_for_update(
                    tenant_id=tenant_id,
                    branch_id=issue.branch_id,
                    medicine_id=item.medicine_id,
                    quantity=item.quantity,
                    expiry_floor=expiry_floor,
                )
            if not batch or batch.quantity_on_hand < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Insufficient stock for {item.medicine_name}",
                )
            batch.quantity_on_hand -= item.quantity
            batch.updated_at = now
            item.batch_id = batch.id
            item.dispensed_quantity = item.quantity
            item.updated_at = now
            session.add(batch)
            session.add(item)
            record_stock(
                session,
                tenant_id=tenant_id,
                branch_id=issue.branch_id,
                medicine_id=item.medicine_id,
                batch_id=batch.id,
                movement_type=StockLedgerMovement.DISPENSE,
                quantity_delta=-item.quantity,
                reference_type="pharmacy_issue",
                reference_id=issue.id,
                actor_user_id=actor_user_id,
            )
    issue.dispensed_at = now
    issue.dispensed_by_user_id = actor_user_id


def create_pharmacy_issue_record(
    session: Session, *, tenant_id: str, payload: PharmacyIssueCreate, actor: User
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    validate_patient_branch(session, tenant_id, payload.patient_id, payload.branch_id)
    require_user_branch_access(actor, payload.branch_id)
    if payload.consultation_id:
        consultation = PharmacyReferenceRepository(session).get_consultation_for_tenant(
            tenant_id=tenant_id,
            consultation_id=payload.consultation_id,
        )
        if not consultation or consultation.patient_id != payload.patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation"
            )
    issue = PharmacyIssue.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "issue_number": next_document_number(
                session,
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                entity="pharmacy_issue",
            ),
        },
    )
    session.add(issue)
    session.commit()
    session.refresh(issue)
    add_issue_items(session, issue, payload.items)
    session.add(issue)
    session.commit()
    session.refresh(issue)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.issued_by_user_id,
        action="pharmacy_issue.created",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy",
    )
    return issue


def create_pharmacy_issue_from_consultation_record(
    session: Session,
    *,
    tenant_id: str,
    consultation_id: str,
    payload: PharmacyIssueFromConsultation,
    actor: User,
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    reference_repo = PharmacyReferenceRepository(session)
    issue_repo = PharmacyIssueRepository(session)
    consultation = reference_repo.get_consultation_for_tenant(
        tenant_id=tenant_id,
        consultation_id=consultation_id,
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found"
        )
    if not consultation.prescription_text:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Consultation has no prescription",
        )
    require_user_branch_access(actor, consultation.branch_id)
    existing = issue_repo.get_by_consultation(
        tenant_id=tenant_id,
        consultation_id=consultation.id,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pharmacy issue already exists"
        )
    issue = PharmacyIssue(
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        issue_number=next_document_number(
            session,
            tenant_id=tenant_id,
            branch_id=consultation.branch_id,
            entity="pharmacy_issue",
        ),
        source=PharmacyIssueSource.CONSULTATION,
        medicine_text=consultation.prescription_text,
        amount=payload.amount,
        issued_by_user_id=payload.issued_by_user_id,
    )
    session.add(issue)
    session.commit()
    session.refresh(issue)
    medicines = reference_repo.list_consultation_medicines(
        consultation_id=consultation.id
    )
    add_consultation_issue_items(
        session,
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        issue=issue,
        medicines=medicines,
        prescription_text=consultation.prescription_text,
    )
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.issued_by_user_id,
        action="pharmacy_issue.created_from_consultation",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy",
    )
    return issue


def update_pharmacy_issue_status_record(
    session: Session,
    *,
    tenant_id: str,
    issue_id: str,
    payload: PharmacyIssueStatusUpdate,
    actor: User,
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(actor, issue.branch_id)
    before = {
        "status": issue.status,
        "notes": issue.notes,
        "cancelled_reason": issue.cancelled_reason,
    }
    now = datetime.now(timezone.utc)
    issue.status = payload.status
    issue.updated_at = now
    if payload.notes is not None:
        issue.notes = payload.notes
    if payload.status == PharmacyIssueStatus.DISPENSED:
        dispense_issue_items(
            session,
            tenant_id=tenant_id,
            issue=issue,
            payload_items=payload.items,
            actor_user_id=payload.actor_user_id,
            now=now,
        )
    if payload.status == PharmacyIssueStatus.CANCELLED:
        if not payload.reason:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cancellation reason is required",
            )
        issue.cancelled_reason = payload.reason
    session.add(issue)
    session.commit()
    session.refresh(issue)
    after = {
        "status": issue.status,
        "notes": issue.notes,
        "cancelled_reason": issue.cancelled_reason,
    }
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.actor_user_id,
        action=f"pharmacy_issue.{payload.status.value}",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy",
        changes=diff_changes(before, after),
    )
    return issue


def update_pharmacy_issue_amount_record(
    session: Session,
    *,
    tenant_id: str,
    issue_id: str,
    payload: PharmacyIssueAmountUpdate,
    actor: User,
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(actor, issue.branch_id)
    before = {"amount": issue.amount}
    previous_amount = issue.amount
    issue.amount = payload.amount
    issue.updated_at = datetime.now(timezone.utc)
    note = f"Amount updated from Rs. {previous_amount} to Rs. {payload.amount}." + (
        f" Reason: {payload.reason}" if payload.reason else ""
    )
    issue.notes = "\n".join([part for part in [issue.notes, note] if part])
    session.add(issue)
    session.commit()
    session.refresh(issue)
    after = {"amount": issue.amount}
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.actor_user_id,
        action="pharmacy_issue.amount_updated",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy",
        metadata_json=json.dumps(
            {
                "previous_amount": previous_amount,
                "amount": payload.amount,
                "reason": payload.reason,
            }
        ),
        changes=diff_changes(before, after),
    )
    return issue


def link_pharmacy_billing_record(
    session: Session,
    *,
    tenant_id: str,
    issue_id: str,
    payload: PharmacyBillingLink,
    actor: User,
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(actor, issue.branch_id)
    before = {"billing_invoice_id": issue.billing_invoice_id}
    issue.billing_invoice_id = payload.billing_invoice_id
    issue.updated_at = datetime.now(timezone.utc)
    session.add(issue)
    session.commit()
    session.refresh(issue)
    after = {"billing_invoice_id": issue.billing_invoice_id}
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.actor_user_id,
        action="pharmacy_issue.billing_linked",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy_billing",
        changes=diff_changes(before, after),
    )
    return issue
