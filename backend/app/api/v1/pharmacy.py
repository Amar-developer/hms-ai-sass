from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import require_user_branch_access, scoped_branch_id
from app.core.auth import require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.consultations.models import Consultation
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.pharmacy.models import (
    MedicineBatch,
    MedicineCatalog,
    PharmacyIssue,
    PharmacyIssueItem,
    PharmacyIssueSource,
    PharmacyIssueStatus,
    PharmacyPurchase,
    PharmacyPurchaseItem,
    PharmacyReturn,
    PharmacyReturnItem,
    PharmacyStockLedger,
    PharmacySupplier,
    StockLedgerMovement,
)
from app.modules.pharmacy.schemas import (
    LowStockRead,
    MedicineBatchRead,
    MedicineCreate,
    MedicineRead,
    PharmacyBillingLink,
    PharmacyIssueCreate,
    PharmacyIssueDetailRead,
    PharmacyIssueFromConsultation,
    PharmacyIssueItemRead,
    PharmacyIssueRead,
    PharmacyIssueStatusUpdate,
    PharmacyReturnCreate,
    PharmacyReturnRead,
    PurchaseCreate,
    PurchaseRead,
    StockLedgerRead,
    SupplierCreate,
    SupplierRead,
)
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Branch

router = APIRouter(prefix="/pharmacy")


def _validate_patient_branch(session: Session, tenant_id: str, patient_id: str, branch_id: str) -> None:
    patient = session.get(Patient, patient_id)
    branch = session.get(Branch, branch_id)
    if not patient or patient.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid patient")
    if not branch or branch.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid branch")


def _get_issue_or_404(session: Session, tenant_id: str, issue_id: str) -> PharmacyIssue:
    issue = session.get(PharmacyIssue, issue_id)
    if not issue or issue.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pharmacy issue not found")
    return issue


def _issue_detail(session: Session, issue: PharmacyIssue) -> PharmacyIssueDetailRead:
    items = list(
        session.exec(
            select(PharmacyIssueItem)
            .where(PharmacyIssueItem.tenant_id == issue.tenant_id, PharmacyIssueItem.pharmacy_issue_id == issue.id)
            .order_by(PharmacyIssueItem.created_at)
        ).all()
    )
    return PharmacyIssueDetailRead(
        issue=PharmacyIssueRead.model_validate(issue, from_attributes=True),
        items=[PharmacyIssueItemRead.model_validate(item, from_attributes=True) for item in items],
    )


def _stock_balance(session: Session, tenant_id: str, branch_id: str, medicine_id: str) -> int:
    batches = session.exec(
        select(MedicineBatch).where(
            MedicineBatch.tenant_id == tenant_id,
            MedicineBatch.branch_id == branch_id,
            MedicineBatch.medicine_id == medicine_id,
        )
    ).all()
    return sum(batch.quantity_on_hand for batch in batches)


def _record_stock(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    medicine_id: str,
    batch_id: str | None,
    movement_type: StockLedgerMovement,
    quantity_delta: int,
    reference_type: str,
    reference_id: str,
    actor_user_id: str | None,
) -> None:
    session.add(
        PharmacyStockLedger(
            tenant_id=tenant_id,
            branch_id=branch_id,
            medicine_id=medicine_id,
            batch_id=batch_id,
            movement_type=movement_type,
            quantity_delta=quantity_delta,
            balance_after=_stock_balance(session, tenant_id, branch_id, medicine_id),
            reference_type=reference_type,
            reference_id=reference_id,
            actor_user_id=actor_user_id,
        )
    )


def _add_issue_items(session: Session, issue: PharmacyIssue, payload_items) -> None:
    total = 0
    names = []
    for item in payload_items:
        medicine = session.get(MedicineCatalog, item.medicine_id) if item.medicine_id else None
        if item.medicine_id and (not medicine or medicine.tenant_id != issue.tenant_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine")
        batch = session.get(MedicineBatch, item.batch_id) if item.batch_id else None
        if item.batch_id and (not batch or batch.tenant_id != issue.tenant_id or batch.branch_id != issue.branch_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine batch")
        name = item.medicine_name or (medicine.name if medicine else None)
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Medicine name is required")
        unit_price = item.unit_price or (batch.sale_price if batch else medicine.default_sale_price if medicine else 0)
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


@router.post("/medicines", response_model=MedicineRead, status_code=status.HTTP_201_CREATED)
def create_medicine(
    payload: MedicineCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> MedicineCatalog:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    if payload.branch_id:
        require_user_branch_access(current_user, payload.branch_id)
    medicine = MedicineCatalog.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(medicine)
    session.commit()
    session.refresh(medicine)
    record_audit_event(session, tenant_id=tenant_id, branch_id=medicine.branch_id, actor_user_id=payload.created_by_user_id, action="medicine.created", resource_type="medicine_catalog", resource_id=medicine.id, purpose="pharmacy")
    return medicine


@router.get("/medicines", response_model=list[MedicineRead])
def list_medicines(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    search: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[MedicineCatalog]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where((MedicineCatalog.branch_id == branch_id) | (MedicineCatalog.branch_id.is_(None)))
    if search:
        pattern = f"%{search}%"
        statement = statement.where((MedicineCatalog.name.ilike(pattern)) | (MedicineCatalog.generic_name.ilike(pattern)) | (MedicineCatalog.code.ilike(pattern)))
    return list(session.exec(statement.order_by(MedicineCatalog.name)).all())


@router.post("/suppliers", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacySupplier:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    supplier = PharmacySupplier.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return supplier


@router.get("/suppliers", response_model=list[SupplierRead])
def list_suppliers(
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    _current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[PharmacySupplier]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    return list(session.exec(select(PharmacySupplier).where(PharmacySupplier.tenant_id == tenant_id).order_by(PharmacySupplier.name)).all())


@router.post("/purchases", response_model=PurchaseRead, status_code=status.HTTP_201_CREATED)
def create_purchase(
    payload: PurchaseCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PurchaseRead:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    require_user_branch_access(current_user, payload.branch_id)
    purchase = PharmacyPurchase(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        supplier_id=payload.supplier_id,
        purchase_order_id=payload.purchase_order_id,
        invoice_number=payload.invoice_number,
        purchase_date=payload.purchase_date or datetime.now(timezone.utc),
        discount_percentage=payload.discount_percentage,
        purchased_by_user_id=payload.purchased_by_user_id,
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    batches = []
    line_discount_total = 0
    taxable_total = 0
    cgst_total = 0
    sgst_total = 0
    for item in payload.items:
        medicine = session.get(MedicineCatalog, item.medicine_id)
        if not medicine or medicine.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid medicine")
        gross_line = item.quantity * item.cost_price
        line_discount = round(gross_line * item.discount_percentage / 100)
        taxable_line = max(0, gross_line - line_discount)
        cgst_amount = round(taxable_line * item.cgst_percentage / 100)
        sgst_amount = round(taxable_line * item.sgst_percentage / 100)
        gst_amount = cgst_amount + sgst_amount
        line_total = taxable_line + gst_amount
        line_discount_total += line_discount
        taxable_total += taxable_line
        cgst_total += cgst_amount
        sgst_total += sgst_amount
        batch = MedicineBatch(tenant_id=tenant_id, branch_id=payload.branch_id, medicine_id=medicine.id, purchase_id=purchase.id, batch_number=item.batch_number, expiry_date=item.expiry_date, quantity_on_hand=item.quantity, cost_price=item.cost_price, sale_price=item.sale_price or medicine.default_sale_price)
        session.add(batch)
        session.commit()
        session.refresh(batch)
        batches.append(batch)
        session.add(
            PharmacyPurchaseItem(
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                purchase_id=purchase.id,
                medicine_id=medicine.id,
                batch_id=batch.id,
                quantity=item.quantity,
                cost_price=item.cost_price,
                sale_price=batch.sale_price,
                discount_percentage=item.discount_percentage,
                discount_amount=line_discount,
                taxable_amount=taxable_line,
                cgst_percentage=item.cgst_percentage,
                sgst_percentage=item.sgst_percentage,
                cgst_amount=cgst_amount,
                sgst_amount=sgst_amount,
                gst_amount=gst_amount,
                line_total=line_total,
            )
        )
        _record_stock(session, tenant_id=tenant_id, branch_id=payload.branch_id, medicine_id=medicine.id, batch_id=batch.id, movement_type=StockLedgerMovement.PURCHASE, quantity_delta=item.quantity, reference_type="pharmacy_purchase", reference_id=purchase.id, actor_user_id=payload.purchased_by_user_id)
    purchase_discount = round(taxable_total * payload.discount_percentage / 100)
    purchase.discount_amount = line_discount_total + purchase_discount
    purchase.taxable_amount = max(0, taxable_total - purchase_discount)
    if taxable_total and purchase_discount:
        cgst_total = round(cgst_total * purchase.taxable_amount / taxable_total)
        sgst_total = round(sgst_total * purchase.taxable_amount / taxable_total)
    purchase.cgst_amount = cgst_total
    purchase.sgst_amount = sgst_total
    purchase.gst_amount = cgst_total + sgst_total
    purchase.total_amount = purchase.taxable_amount + purchase.gst_amount
    purchase.updated_at = datetime.now(timezone.utc)
    session.add(purchase)
    session.commit()
    session.refresh(purchase)
    record_audit_event(session, tenant_id=tenant_id, branch_id=payload.branch_id, actor_user_id=payload.purchased_by_user_id, action="pharmacy_purchase.created", resource_type="pharmacy_purchase", resource_id=purchase.id, purpose="pharmacy")
    return PurchaseRead(
        id=purchase.id,
        tenant_id=purchase.tenant_id,
        branch_id=purchase.branch_id,
        supplier_id=purchase.supplier_id,
        purchase_order_id=purchase.purchase_order_id,
        invoice_number=purchase.invoice_number,
        purchase_date=purchase.purchase_date,
        discount_percentage=purchase.discount_percentage,
        discount_amount=purchase.discount_amount,
        taxable_amount=purchase.taxable_amount,
        cgst_amount=purchase.cgst_amount,
        sgst_amount=purchase.sgst_amount,
        gst_amount=purchase.gst_amount,
        total_amount=purchase.total_amount,
        purchased_by_user_id=purchase.purchased_by_user_id,
        created_at=purchase.created_at,
        updated_at=purchase.updated_at,
        batches=[MedicineBatchRead.model_validate(batch, from_attributes=True) for batch in batches],
    )


@router.post("/returns", response_model=PharmacyReturnRead, status_code=status.HTTP_201_CREATED)
def create_pharmacy_return(
    payload: PharmacyReturnCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyReturn:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    require_user_branch_access(current_user, payload.branch_id)
    total = 0
    return_record = PharmacyReturn(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        supplier_id=payload.supplier_id,
        purchase_id=payload.purchase_id,
        reason=payload.reason,
        returned_by_user_id=payload.returned_by_user_id,
    )
    session.add(return_record)
    session.commit()
    session.refresh(return_record)
    for item in payload.items:
        batch = session.get(MedicineBatch, item.batch_id)
        if not batch or batch.tenant_id != tenant_id or batch.branch_id != payload.branch_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid return batch")
        if batch.medicine_id != item.medicine_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Medicine and batch do not match")
        if batch.quantity_on_hand < item.quantity:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Return quantity exceeds stock")
        amount = item.amount or item.quantity * batch.cost_price
        total += amount
        batch.quantity_on_hand -= item.quantity
        batch.updated_at = datetime.now(timezone.utc)
        session.add(batch)
        session.add(
            PharmacyReturnItem(
                tenant_id=tenant_id,
                branch_id=payload.branch_id,
                return_id=return_record.id,
                medicine_id=item.medicine_id,
                batch_id=item.batch_id,
                quantity=item.quantity,
                amount=amount,
            )
        )
        _record_stock(
            session,
            tenant_id=tenant_id,
            branch_id=payload.branch_id,
            medicine_id=item.medicine_id,
            batch_id=item.batch_id,
            movement_type=StockLedgerMovement.RETURN,
            quantity_delta=-item.quantity,
            reference_type="pharmacy_return",
            reference_id=return_record.id,
            actor_user_id=payload.returned_by_user_id,
        )
    return_record.total_amount = total
    session.add(return_record)
    session.commit()
    session.refresh(return_record)
    record_audit_event(session, tenant_id=tenant_id, branch_id=payload.branch_id, actor_user_id=payload.returned_by_user_id, action="pharmacy_return.created", resource_type="pharmacy_return", resource_id=return_record.id, purpose="pharmacy")
    return return_record


@router.get("/batches", response_model=list[dict])
def list_batches(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    medicine_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[dict]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(MedicineBatch).where(MedicineBatch.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(MedicineBatch.branch_id == branch_id)
    if medicine_id:
        statement = statement.where(MedicineBatch.medicine_id == medicine_id)
    return [row.model_dump() for row in session.exec(statement.order_by(MedicineBatch.expiry_date)).all()]


@router.post(
    "/issues",
    response_model=PharmacyIssueRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pharmacy_issue(
    payload: PharmacyIssueCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    _validate_patient_branch(session, tenant_id, payload.patient_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.consultation_id:
        consultation = session.get(Consultation, payload.consultation_id)
        if not consultation or consultation.tenant_id != tenant_id or consultation.patient_id != payload.patient_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation")
    issue = PharmacyIssue.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(issue)
    session.commit()
    session.refresh(issue)
    _add_issue_items(session, issue, payload.items)
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


@router.post(
    "/issues/from-consultation/{consultation_id}",
    response_model=PharmacyIssueRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pharmacy_issue_from_consultation(
    consultation_id: str,
    payload: PharmacyIssueFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    consultation = session.get(Consultation, consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found")
    if not consultation.prescription_text:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Consultation has no prescription")
    require_user_branch_access(current_user, consultation.branch_id)
    existing = session.exec(
        select(PharmacyIssue).where(PharmacyIssue.tenant_id == tenant_id, PharmacyIssue.consultation_id == consultation.id)
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pharmacy issue already exists")
    issue = PharmacyIssue(
        tenant_id=tenant_id,
        branch_id=consultation.branch_id,
        patient_id=consultation.patient_id,
        consultation_id=consultation.id,
        source=PharmacyIssueSource.CONSULTATION,
        medicine_text=consultation.prescription_text,
        amount=payload.amount,
        issued_by_user_id=payload.issued_by_user_id,
    )
    session.add(issue)
    session.commit()
    session.refresh(issue)
    from app.modules.consultations.models import ConsultationMedicine

    medicines = list(session.exec(select(ConsultationMedicine).where(ConsultationMedicine.consultation_id == consultation.id)).all())
    total = 0
    for med in medicines:
        catalog = session.exec(select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id, MedicineCatalog.name == med.medicine_name)).first()
        unit_price = catalog.default_sale_price if catalog else 0
        total += unit_price
        item = PharmacyIssueItem(tenant_id=tenant_id, branch_id=issue.branch_id, pharmacy_issue_id=issue.id, medicine_id=catalog.id if catalog else None, medicine_name=med.medicine_name, quantity=1, unit_price=unit_price)
        session.add(item)
    if medicines and issue.amount == 0:
        issue.amount = total
        session.add(issue)
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


@router.get("/issues", response_model=list[PharmacyIssueRead])
def list_pharmacy_issues(
    tenant_id: str = Depends(require_tenant_id),
    patient_id: str | None = None,
    status_filter: PharmacyIssueStatus | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[PharmacyIssue]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(PharmacyIssue).where(PharmacyIssue.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(PharmacyIssue.branch_id == branch_id)
    if patient_id:
        statement = statement.where(PharmacyIssue.patient_id == patient_id)
    if status_filter:
        statement = statement.where(PharmacyIssue.status == status_filter)
    return list(session.exec(statement.order_by(PharmacyIssue.created_at.desc())).all())


@router.get("/issues/{issue_id}", response_model=PharmacyIssueDetailRead)
def get_pharmacy_issue(
    issue_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyIssueDetailRead:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = _get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(current_user, issue.branch_id)
    return _issue_detail(session, issue)


@router.patch("/issues/{issue_id}/status", response_model=PharmacyIssueRead)
def update_pharmacy_issue_status(
    issue_id: str,
    payload: PharmacyIssueStatusUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = _get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(current_user, issue.branch_id)
    now = datetime.now(timezone.utc)
    issue.status = payload.status
    issue.updated_at = now
    if payload.notes is not None:
        issue.notes = payload.notes
    if payload.status == PharmacyIssueStatus.DISPENSED:
        items = list(session.exec(select(PharmacyIssueItem).where(PharmacyIssueItem.pharmacy_issue_id == issue.id)).all())
        if payload.items:
            _add_issue_items(session, issue, payload.items)
            session.flush()
            items = list(session.exec(select(PharmacyIssueItem).where(PharmacyIssueItem.pharmacy_issue_id == issue.id)).all())
        for item in items:
            if item.medicine_id:
                batch = session.get(MedicineBatch, item.batch_id) if item.batch_id else None
                if not batch:
                    batch = session.exec(select(MedicineBatch).where(MedicineBatch.tenant_id == tenant_id, MedicineBatch.branch_id == issue.branch_id, MedicineBatch.medicine_id == item.medicine_id, MedicineBatch.quantity_on_hand >= item.quantity).order_by(MedicineBatch.expiry_date)).first()
                if not batch or batch.quantity_on_hand < item.quantity:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Insufficient stock for {item.medicine_name}")
                batch.quantity_on_hand -= item.quantity
                batch.updated_at = now
                item.batch_id = batch.id
                item.dispensed_quantity = item.quantity
                item.updated_at = now
                session.add(batch)
                session.add(item)
                _record_stock(session, tenant_id=tenant_id, branch_id=issue.branch_id, medicine_id=item.medicine_id, batch_id=batch.id, movement_type=StockLedgerMovement.DISPENSE, quantity_delta=-item.quantity, reference_type="pharmacy_issue", reference_id=issue.id, actor_user_id=payload.actor_user_id)
        issue.dispensed_at = now
        issue.dispensed_by_user_id = payload.actor_user_id
    if payload.status == PharmacyIssueStatus.CANCELLED:
        if not payload.reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cancellation reason is required")
        issue.cancelled_reason = payload.reason
    session.add(issue)
    session.commit()
    session.refresh(issue)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        actor_user_id=payload.actor_user_id,
        action=f"pharmacy_issue.{payload.status.value}",
        resource_type="pharmacy_issue",
        resource_id=issue.id,
        purpose="pharmacy",
    )
    return issue


@router.post("/issues/{issue_id}/billing-link", response_model=PharmacyIssueRead)
def link_pharmacy_billing(
    issue_id: str,
    payload: PharmacyBillingLink,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> PharmacyIssue:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    issue = _get_issue_or_404(session, tenant_id, issue_id)
    require_user_branch_access(current_user, issue.branch_id)
    issue.billing_invoice_id = payload.billing_invoice_id
    issue.updated_at = datetime.now(timezone.utc)
    session.add(issue)
    session.commit()
    session.refresh(issue)
    record_audit_event(session, tenant_id=tenant_id, branch_id=issue.branch_id, actor_user_id=payload.actor_user_id, action="pharmacy_issue.billing_linked", resource_type="pharmacy_issue", resource_id=issue.id, purpose="pharmacy_billing")
    return issue


@router.get("/stock-ledger", response_model=list[StockLedgerRead])
def list_stock_ledger(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    medicine_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[PharmacyStockLedger]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(PharmacyStockLedger).where(PharmacyStockLedger.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(PharmacyStockLedger.branch_id == branch_id)
    if medicine_id:
        statement = statement.where(PharmacyStockLedger.medicine_id == medicine_id)
    return list(session.exec(statement.order_by(PharmacyStockLedger.created_at.desc())).all())


@router.get("/low-stock", response_model=list[LowStockRead])
def list_low_stock(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PHARMACY_MANAGE)),
) -> list[LowStockRead]:
    enforce_module_enabled(session, tenant_id, "pharmacy")
    branch_id = scoped_branch_id(current_user, branch_id)
    medicines = list(session.exec(select(MedicineCatalog).where(MedicineCatalog.tenant_id == tenant_id, MedicineCatalog.is_active == True)).all())  # noqa: E712
    rows = []
    for medicine in medicines:
        if branch_id and medicine.branch_id not in {None, branch_id}:
            continue
        check_branch = branch_id or medicine.branch_id
        if not check_branch:
            continue
        balance = _stock_balance(session, tenant_id, check_branch, medicine.id)
        if balance <= medicine.reorder_level:
            rows.append(LowStockRead(medicine_id=medicine.id, medicine_name=medicine.name, branch_id=check_branch, quantity_on_hand=balance, reorder_level=medicine.reorder_level))
    return rows
