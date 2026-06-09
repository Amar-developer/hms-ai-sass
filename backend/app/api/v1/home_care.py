from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.access_control import require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, Payment, TaxRule
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceItemRead, InvoiceRead, PaymentRead
from app.modules.billing.service import next_invoice_number
from app.modules.home_care.models import HomeCareBooking, HomeCareBookingItem, HomeCareService
from app.modules.home_care.schemas import (
    HomeCareBookingCreate,
    HomeCareBookingItemCreate,
    HomeCareBookingItemRead,
    HomeCareBookingRead,
    HomeCareBookingUpdate,
    HomeCareInvoiceCreate,
    HomeCareServiceCreate,
    HomeCareServiceRead,
    HomeCareServiceUpdate,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.numbering import next_document_number
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc

router = APIRouter(prefix="/home-care")

# Bookings in these terminal/billed states are locked from further edits.
LOCKED_BOOKING_STATUSES = {"invoiced", "paid", "completed", "cancelled"}


def _assert_enabled(session: Session, tenant_id: str) -> None:
    enforce_module_enabled(session, tenant_id, "home_care")


def _next_booking_number(session: Session, tenant_id: str, branch_id: str | None = None) -> str:
    return next_document_number(session, tenant_id=tenant_id, branch_id=branch_id, entity="home_care_booking")


def _service_code(name: str) -> str:
    compact = "".join(ch for ch in name.upper() if ch.isalnum())[:6] or "ITEM"
    return f"HC-{compact}-{now_utc().strftime('%H%M%S')}"


def _read_booking(session: Session, booking: HomeCareBooking) -> HomeCareBookingRead:
    items = list(
        session.exec(
            select(HomeCareBookingItem)
            .where(HomeCareBookingItem.tenant_id == booking.tenant_id, HomeCareBookingItem.booking_id == booking.id)
            .order_by(HomeCareBookingItem.created_at)
        ).all()
    )
    data = HomeCareBookingRead.model_validate(booking, from_attributes=True).model_dump()
    data["services"] = [HomeCareBookingItemRead.model_validate(item, from_attributes=True) for item in items]
    return HomeCareBookingRead(**data)


def _get_booking(session: Session, tenant_id: str, booking_id: str, current_user: User) -> HomeCareBooking:
    booking = session.get(HomeCareBooking, booking_id)
    if not booking or booking.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home care booking not found")
    require_user_branch_access(current_user, booking.branch_id)
    return booking


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
        if tax_rule.tenant_id != tenant_id or not tax_rule.is_active or tax_rule.branch_id not in {None, branch_id}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tax rule")
        return tax_rule
    return session.exec(
        select(TaxRule).where(
            TaxRule.tenant_id == tenant_id,
            TaxRule.is_active == True,  # noqa: E712
            (TaxRule.branch_id == branch_id) | (TaxRule.branch_id.is_(None)),
        )
    ).first()


def _sync_booking_status_from_invoice(session: Session, booking: HomeCareBooking, invoice: Invoice) -> None:
    target = "paid" if invoice.balance_amount <= 0 and invoice.total_amount > 0 else "invoiced"
    if booking.status != target:
        booking.status = target
        booking.updated_at = now_utc()
        session.add(booking)
        session.commit()


def _validate_patient_and_staff(session: Session, tenant_id: str, payload: HomeCareBookingCreate | HomeCareBookingUpdate) -> None:
    patient_id = getattr(payload, "patient_id", None)
    if patient_id:
        patient = session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    staff_id = getattr(payload, "assigned_staff_user_id", None)
    if staff_id:
        staff = session.get(User, staff_id)
        if not staff or staff.tenant_id != tenant_id or not staff.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assigned staff")


def _replace_booking_items(session: Session, tenant_id: str, booking: HomeCareBooking, services: list[HomeCareBookingItemCreate]) -> None:
    existing = list(session.exec(select(HomeCareBookingItem).where(HomeCareBookingItem.tenant_id == tenant_id, HomeCareBookingItem.booking_id == booking.id)).all())
    for row in existing:
        session.delete(row)
    for row in services:
        service = session.get(HomeCareService, row.service_id) if row.service_id else None
        if row.service_id and (not service or service.tenant_id != tenant_id or not service.is_active):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid home care service")
        description = row.description or service.name if service else row.description
        unit_amount = row.unit_amount if row.unit_amount is not None else (service.default_price if service else 0)
        session.add(
            HomeCareBookingItem(
                tenant_id=tenant_id,
                booking_id=booking.id,
                service_id=row.service_id,
                description=description or "Home care service",
                quantity=row.quantity,
                unit_amount=unit_amount,
                total_amount=row.quantity * unit_amount,
            )
        )


@router.get("/services", response_model=list[HomeCareServiceRead])
def list_services(
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)),
) -> list[HomeCareService]:
    _assert_enabled(session, tenant_id)
    statement = select(HomeCareService).where(HomeCareService.tenant_id == tenant_id, HomeCareService.is_active == True)  # noqa: E712
    if branch_id:
        branch_scope = scoped_branch_id(current_user, branch_id)
        statement = statement.where((HomeCareService.branch_id == branch_scope) | (HomeCareService.branch_id.is_(None)))
    return list(session.exec(statement.order_by(HomeCareService.name)).all())


@router.post("/services", response_model=HomeCareServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: HomeCareServiceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE)),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    service = HomeCareService.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "code": payload.code or _service_code(payload.name),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(service)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=service.branch_id,
        actor_user_id=current_user.id,
        action="home_care_service.created",
        resource_type="home_care_service",
        resource_id=service.id,
        purpose="home_care",
        commit=False,
    )
    session.commit()
    session.refresh(service)
    return HomeCareServiceRead.model_validate(service, from_attributes=True)


@router.patch("/services/{service_id}", response_model=HomeCareServiceRead)
def update_service(
    service_id: str,
    payload: HomeCareServiceUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    service = session.get(HomeCareService, service_id)
    if not service or service.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home care service not found")
    require_user_branch_access(current_user, service.branch_id)
    data = payload.model_dump(exclude_unset=True)
    next_branch_id = data.get("branch_id", service.branch_id)
    require_branch_in_tenant(session, tenant_id, next_branch_id)
    require_user_branch_access(current_user, next_branch_id)
    for key, value in data.items():
        if key == "code" and not value:
            continue
        setattr(service, key, value)
    service.updated_by_user_id = current_user.id
    service.updated_at = now_utc()
    session.add(service)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=service.branch_id,
        actor_user_id=current_user.id,
        action="home_care_service.updated",
        resource_type="home_care_service",
        resource_id=service.id,
        purpose="home_care",
        commit=False,
    )
    session.commit()
    session.refresh(service)
    return HomeCareServiceRead.model_validate(service, from_attributes=True)


@router.delete("/services/{service_id}", response_model=HomeCareServiceRead)
def delete_service(
    service_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_DELETE, permissions.HOME_CARE_MANAGE)),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    service = session.get(HomeCareService, service_id)
    if not service or service.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Home care service not found")
    require_user_branch_access(current_user, service.branch_id)
    service.is_active = False
    service.updated_by_user_id = current_user.id
    service.updated_at = now_utc()
    session.add(service)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=service.branch_id,
        actor_user_id=current_user.id,
        action="home_care_service.deleted",
        resource_type="home_care_service",
        resource_id=service.id,
        purpose="home_care",
        commit=False,
    )
    session.commit()
    session.refresh(service)
    return HomeCareServiceRead.model_validate(service, from_attributes=True)


@router.get("/bookings", response_model=list[HomeCareBookingRead])
def list_bookings(
    branch_id: str | None = None,
    patient_id: str | None = None,
    status_filter: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)),
) -> list[HomeCareBookingRead]:
    _assert_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    statement = select(HomeCareBooking).where(HomeCareBooking.tenant_id == tenant_id)
    if branch_scope:
        statement = statement.where(HomeCareBooking.branch_id == branch_scope)
    if patient_id:
        statement = statement.where(HomeCareBooking.patient_id == patient_id)
    if status_filter:
        statement = statement.where(HomeCareBooking.status == status_filter)
    rows = list(session.exec(statement.order_by(HomeCareBooking.updated_at.desc(), HomeCareBooking.created_at.desc())).all())
    return [_read_booking(session, row) for row in rows]


@router.post("/bookings", response_model=HomeCareBookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: HomeCareBookingCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE)),
) -> HomeCareBookingRead:
    _assert_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    _validate_patient_and_staff(session, tenant_id, payload)
    if payload.end_date and (payload.start_date or date.today()) > payload.end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after start date")
    booking = HomeCareBooking.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "booking_number": _next_booking_number(session, tenant_id, payload.branch_id),
            "start_date": payload.start_date or date.today(),
            "recurrence": payload.recurrence.lower(),
            "status": payload.status.lower(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    _replace_booking_items(session, tenant_id, booking, payload.services)
    session.commit()
    record_audit_event(session, tenant_id=tenant_id, branch_id=booking.branch_id, actor_user_id=current_user.id, action="home_care_booking.created", resource_type="home_care_booking", resource_id=booking.id, purpose="home_care")
    return _read_booking(session, booking)


@router.patch("/bookings/{booking_id}", response_model=HomeCareBookingRead)
def update_booking(
    booking_id: str,
    payload: HomeCareBookingUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)),
) -> HomeCareBookingRead:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    if booking.status in LOCKED_BOOKING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This booking is {booking.status} and can no longer be edited",
        )
    _validate_patient_and_staff(session, tenant_id, payload)
    data = payload.model_dump(exclude_unset=True, exclude={"services"})
    for key, value in data.items():
        setattr(booking, key, value.lower() if key in {"status", "recurrence"} and isinstance(value, str) else value)
    if booking.end_date and booking.start_date > booking.end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after start date")
    booking.updated_at = now_utc()
    booking.updated_by_user_id = current_user.id
    session.add(booking)
    if payload.services is not None:
        _replace_booking_items(session, tenant_id, booking, payload.services)
    session.commit()
    session.refresh(booking)
    record_audit_event(session, tenant_id=tenant_id, branch_id=booking.branch_id, actor_user_id=current_user.id, action="home_care_booking.updated", resource_type="home_care_booking", resource_id=booking.id, purpose="home_care")
    return _read_booking(session, booking)


@router.get("/bookings/{booking_id}/invoice", response_model=InvoiceDetailRead | None)
def get_booking_invoice(
    booking_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead | None:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    invoice = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.home_care_booking_id == booking.id)).first()
    if not invoice:
        return None
    _sync_booking_status_from_invoice(session, booking, invoice)
    return _invoice_detail(session, invoice)


@router.post("/bookings/{booking_id}/invoice", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def generate_invoice(
    booking_id: str,
    payload: HomeCareInvoiceCreate | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    _assert_enabled(session, tenant_id)
    payload = payload or HomeCareInvoiceCreate()
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    existing = session.exec(select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.home_care_booking_id == booking.id)).first()
    if existing:
        _sync_booking_status_from_invoice(session, booking, existing)
        return _invoice_detail(session, existing)
    rows = list(session.exec(select(HomeCareBookingItem).where(HomeCareBookingItem.tenant_id == tenant_id, HomeCareBookingItem.booking_id == booking.id, HomeCareBookingItem.total_amount > 0)).all())
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add at least one billable home care service before generating invoice")
    subtotal = sum(row.total_amount for row in rows)
    discount = min(payload.discount_amount, subtotal)
    taxable = subtotal - discount
    tax_rule = _resolve_tax_rule(session, tenant_id, booking.branch_id, payload.tax_rule_id)
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    invoice_prefix, _scope, _scope_id = resolve_setting(session, tenant_id=tenant_id, module="invoice", key=SettingKey.INVOICE_PREFIX, branch_id=booking.branch_id)
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        patient_id=booking.patient_id,
        home_care_booking_id=booking.id,
        invoice_number=next_invoice_number(session, tenant_id, str(invoice_prefix or "INV"), booking.branch_id),
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
                item_type="home_care",
                description=row.description,
                quantity=row.quantity,
                unit_amount=row.unit_amount,
                total_amount=row.total_amount,
                external_source="home_care",
                external_slug="home_care_service",
                external_item_code=row.service_id,
            )
        )
    session.commit()
    session.refresh(invoice)
    _sync_booking_status_from_invoice(session, booking, invoice)
    record_audit_event(session, tenant_id=tenant_id, branch_id=booking.branch_id, actor_user_id=payload.created_by_user_id or current_user.id, action="home_care_invoice.generated", resource_type="invoice", resource_id=invoice.id, purpose="home_care_billing", metadata_json=f'{{"home_care_booking_id":"{booking.id}"}}')
    return _invoice_detail(session, invoice)
