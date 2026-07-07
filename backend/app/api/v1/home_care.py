from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.core.auth import require_any_permission, require_permission
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import (
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    TaxRule,
)
from app.modules.billing.schemas import (
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceRead,
    PaymentRead,
)
from app.modules.billing.service import next_invoice_number
from app.modules.home_care.models import (
    HomeCareBooking,
    HomeCareBookingItem,
    HomeCareService,
    HomeCareVisitLog,
)
from app.modules.home_care.repositories import (
    HomeCareBillingRepository,
    HomeCareBookingItemRepository,
    HomeCareBookingRepository,
    HomeCareReferenceRepository,
    HomeCareServiceRepository,
    HomeCareVisitLogRepository,
)
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
    HomeCareVisitLogCreate,
    HomeCareVisitLogRead,
    HomeCareVisitLogUpdate,
)
from app.modules.identity import permissions
from app.modules.identity.models import User
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


def _next_booking_number(
    session: Session, tenant_id: str, branch_id: str | None = None
) -> str:
    return next_document_number(
        session, tenant_id=tenant_id, branch_id=branch_id, entity="home_care_booking"
    )


def _service_code(name: str) -> str:
    compact = "".join(ch for ch in name.upper() if ch.isalnum())[:6] or "ITEM"
    return f"HC-{compact}-{now_utc().strftime('%H%M%S')}"


def _read_booking(session: Session, booking: HomeCareBooking) -> HomeCareBookingRead:
    items = HomeCareBookingItemRepository(session).list_for_booking(
        tenant_id=booking.tenant_id, booking_id=booking.id
    )
    data = HomeCareBookingRead.model_validate(
        booking, from_attributes=True
    ).model_dump()
    data["services"] = [
        HomeCareBookingItemRead.model_validate(item, from_attributes=True)
        for item in items
    ]
    visit_logs = HomeCareVisitLogRepository(session).list_for_booking(
        tenant_id=booking.tenant_id, booking_id=booking.id
    )
    data["visit_logs"] = [
        HomeCareVisitLogRead.model_validate(row, from_attributes=True)
        for row in visit_logs
    ]
    return HomeCareBookingRead(**data)


def _get_booking(
    session: Session, tenant_id: str, booking_id: str, current_user: User
) -> HomeCareBooking:
    booking = HomeCareBookingRepository(session).get_for_tenant(tenant_id, booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Home care booking not found"
        )
    require_user_branch_access(current_user, booking.branch_id)
    return booking


def _invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    billing = HomeCareBillingRepository(session)
    items = billing.list_invoice_items(invoice)
    payments = billing.list_invoice_payments(invoice)
    return InvoiceDetailRead(
        status=invoice.status,
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[
            InvoiceItemRead.model_validate(item, from_attributes=True) for item in items
        ],
        payments=[
            PaymentRead.model_validate(payment, from_attributes=True)
            for payment in payments
        ],
    )


def _resolve_tax_rule(
    session: Session, tenant_id: str, branch_id: str, tax_rule_id: str | None
) -> TaxRule | None:
    tax_rule = HomeCareBillingRepository(session).get_active_tax_rule(
        tenant_id=tenant_id, branch_id=branch_id, tax_rule_id=tax_rule_id
    )
    if tax_rule:
        if (
            tax_rule.tenant_id != tenant_id
            or not tax_rule.is_active
            or tax_rule.branch_id not in {None, branch_id}
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid tax rule"
            )
        return tax_rule
    return None


def _sync_booking_status_from_invoice(
    session: Session, booking: HomeCareBooking, invoice: Invoice
) -> None:
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        target = "scheduled"
    elif invoice.balance_amount <= 0 and invoice.total_amount > 0:
        target = "paid"
    else:
        target = "invoiced"
    if booking.status != target:
        booking.status = target
        booking.updated_at = now_utc()
        HomeCareBookingRepository(session).add(booking)
        session.commit()


def _validate_patient_and_staff(
    session: Session,
    tenant_id: str,
    payload: HomeCareBookingCreate | HomeCareBookingUpdate,
) -> None:
    patient_id = getattr(payload, "patient_id", None)
    references = HomeCareReferenceRepository(session)
    if patient_id is not None:
        patient_id = patient_id.strip()
        if not patient_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Patient is required",
            )
        patient = references.get_patient_for_tenant(tenant_id, patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
            )
    staff_id = getattr(payload, "assigned_staff_user_id", None)
    if staff_id:
        staff = references.get_active_staff_for_tenant(tenant_id, staff_id)
        if not staff:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assigned staff"
            )


def _replace_booking_items(
    session: Session,
    tenant_id: str,
    booking: HomeCareBooking,
    services: list[HomeCareBookingItemCreate],
) -> None:
    items = HomeCareBookingItemRepository(session)
    services_repo = HomeCareServiceRepository(session)
    existing = items.list_for_booking(tenant_id=tenant_id, booking_id=booking.id)
    for row in existing:
        items.delete(row)
    for row in services:
        service = (
            services_repo.get_active_for_tenant(tenant_id, row.service_id)
            if row.service_id
            else None
        )
        if row.service_id and not service:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid home care service",
            )
        description = row.description or service.name if service else row.description
        unit_amount = (
            row.unit_amount
            if row.unit_amount is not None
            else (service.default_price if service else 0)
        )
        service_category = row.service_category or (
            "home_visit_service"
            if service and str(service.code or "").upper().startswith("HV")
            else "home_care_service"
        )
        total_amount = row.quantity * unit_amount
        items.add(
            HomeCareBookingItem(
                tenant_id=tenant_id,
                booking_id=booking.id,
                service_id=row.service_id,
                service_category=service_category,
                description=description or "Home care service",
                quantity=row.quantity,
                unit_amount=unit_amount,
                total_amount=total_amount,
            )
        )


def _visit_log_from_payload(
    session: Session,
    tenant_id: str,
    booking: HomeCareBooking,
    payload: HomeCareVisitLogCreate | HomeCareVisitLogUpdate,
    current_user: User,
    existing: HomeCareVisitLog | None = None,
) -> HomeCareVisitLog:
    staff_id = payload.assigned_staff_user_id
    references = HomeCareReferenceRepository(session)
    if staff_id:
        staff = references.get_active_staff_for_tenant(tenant_id, staff_id)
        if not staff:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assigned staff"
            )
    service = (
        HomeCareServiceRepository(session).get_active_for_tenant(
            tenant_id, payload.service_id
        )
        if payload.service_id
        else None
    )
    if payload.service_id and not service:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid home care service",
        )
    status_value = (
        payload.status or (existing.status if existing else None) or "completed"
    ).lower()
    service_category = payload.service_category or (
        existing.service_category
        if existing
        else (
            "home_visit_service"
            if service and str(service.code or "").upper().startswith("HV")
            else "home_care_service"
        )
    )
    description = payload.description or (service.name if service else None)
    if not description and existing:
        description = existing.description
    unit_amount = (
        payload.unit_amount
        if payload.unit_amount is not None
        else (
            service.default_price
            if service
            else (existing.unit_amount if existing else 0)
        )
    )
    quantity = (
        payload.quantity
        if payload.quantity is not None
        else (existing.quantity if existing else 1)
    )
    billable = status_value == "completed"
    total_amount = quantity * unit_amount
    values = {
        "tenant_id": tenant_id,
        "booking_id": booking.id,
        "visit_date": payload.visit_date
        or (existing.visit_date if existing else date.today()),
        "assigned_staff_user_id": staff_id
        if staff_id is not None
        else (
            existing.assigned_staff_user_id
            if existing
            else booking.assigned_staff_user_id
        ),
        "assigned_staff_name": payload.assigned_staff_name
        if payload.assigned_staff_name is not None
        else (
            existing.assigned_staff_name if existing else booking.assigned_staff_name
        ),
        "staff_type": payload.staff_type
        if payload.staff_type is not None
        else (existing.staff_type if existing else booking.staff_type),
        "service_id": payload.service_id
        if payload.service_id is not None
        else (existing.service_id if existing else None),
        "service_category": service_category,
        "description": description or "Home care service",
        "quantity": quantity,
        "unit_amount": unit_amount,
        "total_amount": total_amount if billable else 0,
        "status": status_value,
        "notes": payload.notes
        if payload.notes is not None
        else (existing.notes if existing else None),
    }
    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        existing.updated_by_user_id = current_user.id
        existing.updated_at = now_utc()
        return existing
    return HomeCareVisitLog(
        **values,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )


@router.get("/services", response_model=list[HomeCareServiceRead])
def list_services(
    branch_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)
    ),
) -> list[HomeCareService]:
    _assert_enabled(session, tenant_id)
    scoped_branch_id(current_user, branch_id)
    return HomeCareServiceRepository(session).list_active(tenant_id)


@router.post(
    "/services", response_model=HomeCareServiceRead, status_code=status.HTTP_201_CREATED
)
def create_service(
    payload: HomeCareServiceCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    data = payload.model_dump()
    data["branch_id"] = None
    service = HomeCareService.model_validate(
        data,
        update={
            "tenant_id": tenant_id,
            "code": payload.code or _service_code(payload.name),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    HomeCareServiceRepository(session).add(service)
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
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    service = HomeCareServiceRepository(session).get_for_tenant(tenant_id, service_id)
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Home care service not found"
        )
    data = payload.model_dump(exclude_unset=True)
    if "branch_id" in data:
        data["branch_id"] = None
    for key, value in data.items():
        if key == "code" and not value:
            continue
        setattr(service, key, value)
    service.updated_by_user_id = current_user.id
    service.updated_at = now_utc()
    HomeCareServiceRepository(session).add(service)
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
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_DELETE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareServiceRead:
    _assert_enabled(session, tenant_id)
    service = HomeCareServiceRepository(session).get_for_tenant(tenant_id, service_id)
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Home care service not found"
        )
    require_user_branch_access(current_user, service.branch_id)
    service.is_active = False
    service.updated_by_user_id = current_user.id
    service.updated_at = now_utc()
    HomeCareServiceRepository(session).add(service)
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
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_READ, permissions.HOME_CARE_MANAGE)
    ),
) -> list[HomeCareBookingRead]:
    _assert_enabled(session, tenant_id)
    branch_scope = scoped_branch_id(current_user, branch_id)
    rows = HomeCareBookingRepository(session).list_for_tenant(
        tenant_id=tenant_id,
        branch_id=branch_scope,
        patient_id=patient_id,
        status_filter=status_filter,
    )
    return [_read_booking(session, row) for row in rows]


@router.post(
    "/bookings", response_model=HomeCareBookingRead, status_code=status.HTTP_201_CREATED
)
def create_booking(
    payload: HomeCareBookingCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareBookingRead:
    _assert_enabled(session, tenant_id)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    _validate_patient_and_staff(session, tenant_id, payload)
    if payload.end_date and (payload.start_date or date.today()) > payload.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be on or after start date",
        )
    booking = HomeCareBooking.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "booking_number": _next_booking_number(
                session, tenant_id, payload.branch_id
            ),
            "start_date": payload.start_date or date.today(),
            "booking_type": payload.booking_type.lower(),
            "recurrence": payload.recurrence.lower(),
            "status": payload.status.lower(),
            "created_by_user_id": current_user.id,
            "updated_by_user_id": current_user.id,
        },
    )
    HomeCareBookingRepository(session).add(booking)
    session.commit()
    session.refresh(booking)
    _replace_booking_items(session, tenant_id, booking, payload.services)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        actor_user_id=current_user.id,
        action="home_care_booking.created",
        resource_type="home_care_booking",
        resource_id=booking.id,
        purpose="home_care",
    )
    return _read_booking(session, booking)


@router.patch("/bookings/{booking_id}", response_model=HomeCareBookingRead)
def update_booking(
    booking_id: str,
    payload: HomeCareBookingUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
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
        setattr(
            booking,
            key,
            value.lower()
            if key in {"status", "recurrence", "booking_type"}
            and isinstance(value, str)
            else value,
        )
    if booking.end_date and booking.start_date > booking.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be on or after start date",
        )
    booking.updated_at = now_utc()
    booking.updated_by_user_id = current_user.id
    HomeCareBookingRepository(session).add(booking)
    if payload.services is not None:
        _replace_booking_items(session, tenant_id, booking, payload.services)
    session.commit()
    session.refresh(booking)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        actor_user_id=current_user.id,
        action="home_care_booking.updated",
        resource_type="home_care_booking",
        resource_id=booking.id,
        purpose="home_care",
    )
    return _read_booking(session, booking)


@router.post(
    "/bookings/{booking_id}/visits",
    response_model=HomeCareVisitLogRead,
    status_code=status.HTTP_201_CREATED,
)
def create_visit_log(
    booking_id: str,
    payload: HomeCareVisitLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.HOME_CARE_CREATE, permissions.HOME_CARE_MANAGE
        )
    ),
) -> HomeCareVisitLogRead:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    if booking.status in LOCKED_BOOKING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This booking is {booking.status} and cannot accept visit logs",
        )
    row = _visit_log_from_payload(session, tenant_id, booking, payload, current_user)
    visits = HomeCareVisitLogRepository(session)
    bookings = HomeCareBookingRepository(session)
    visits.add(row)
    booking.updated_at = now_utc()
    booking.updated_by_user_id = current_user.id
    bookings.add(booking)
    session.commit()
    session.refresh(row)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        actor_user_id=current_user.id,
        action="home_care_visit.logged",
        resource_type="home_care_visit_log",
        resource_id=row.id,
        purpose="home_care",
    )
    return HomeCareVisitLogRead.model_validate(row, from_attributes=True)


@router.patch(
    "/bookings/{booking_id}/visits/{visit_id}",
    response_model=HomeCareVisitLogRead,
)
def update_visit_log(
    booking_id: str,
    visit_id: str,
    payload: HomeCareVisitLogUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareVisitLogRead:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    if booking.status in LOCKED_BOOKING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This booking is {booking.status} and can no longer be edited",
        )
    visits = HomeCareVisitLogRepository(session)
    bookings = HomeCareBookingRepository(session)
    row = visits.get_for_booking(
        tenant_id=tenant_id, booking_id=booking.id, visit_id=visit_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Visit log not found"
        )
    row = _visit_log_from_payload(
        session, tenant_id, booking, payload, current_user, row
    )
    visits.add(row)
    booking.updated_at = now_utc()
    booking.updated_by_user_id = current_user.id
    bookings.add(booking)
    session.commit()
    session.refresh(row)
    return HomeCareVisitLogRead.model_validate(row, from_attributes=True)


@router.delete(
    "/bookings/{booking_id}/visits/{visit_id}",
    response_model=HomeCareVisitLogRead,
)
def delete_visit_log(
    booking_id: str,
    visit_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(permissions.HOME_CARE_EDIT, permissions.HOME_CARE_MANAGE)
    ),
) -> HomeCareVisitLogRead:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    if booking.status in LOCKED_BOOKING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This booking is {booking.status} and can no longer be edited",
        )
    visits = HomeCareVisitLogRepository(session)
    bookings = HomeCareBookingRepository(session)
    row = visits.get_for_booking(
        tenant_id=tenant_id, booking_id=booking.id, visit_id=visit_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Visit log not found"
        )
    data = HomeCareVisitLogRead.model_validate(row, from_attributes=True)
    visits.delete(row)
    booking.updated_at = now_utc()
    booking.updated_by_user_id = current_user.id
    bookings.add(booking)
    session.commit()
    return data


@router.get("/bookings/{booking_id}/invoice", response_model=InvoiceDetailRead | None)
def get_booking_invoice(
    booking_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead | None:
    _assert_enabled(session, tenant_id)
    booking = _get_booking(session, tenant_id, booking_id, current_user)
    # Ignore voided invoices so a booking whose invoice was cancelled shows as
    # un-billed again (the UI then offers "Generate Invoice" instead of "View").
    invoice = HomeCareBillingRepository(session).get_active_booking_invoice(
        tenant_id=tenant_id, booking_id=booking.id
    )
    if not invoice:
        return None
    _sync_booking_status_from_invoice(session, booking, invoice)
    return _invoice_detail(session, invoice)


@router.post(
    "/bookings/{booking_id}/invoice",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
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
    # Ignore voided invoices so a booking whose invoice was cancelled can be
    # re-billed instead of returning the dead invoice and re-locking it.
    billing = HomeCareBillingRepository(session)
    existing = billing.get_active_booking_invoice(
        tenant_id=tenant_id, booking_id=booking.id
    )
    if existing:
        _sync_booking_status_from_invoice(session, booking, existing)
        return _invoice_detail(session, existing)
    visit_rows = HomeCareVisitLogRepository(
        session
    ).list_completed_billable_for_booking(tenant_id=tenant_id, booking_id=booking.id)
    planned_rows = HomeCareBookingItemRepository(session).list_billable_for_booking(
        tenant_id=tenant_id, booking_id=booking.id
    )
    rows = visit_rows or planned_rows
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one completed billable service before generating invoice",
        )
    patient_id = (booking.patient_id or "").strip()
    if not patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Home care booking must be linked to a patient before generating invoice",
        )
    patient = HomeCareReferenceRepository(session).get_patient_for_tenant(
        tenant_id, patient_id
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Home care booking patient is invalid",
        )
    subtotal = sum(row.total_amount for row in rows)
    discount = min(payload.discount_amount, subtotal)
    taxable = subtotal - discount
    tax_rule = _resolve_tax_rule(
        session, tenant_id, booking.branch_id, payload.tax_rule_id
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    invoice_prefix, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_PREFIX,
        branch_id=booking.branch_id,
    )
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        patient_id=patient_id,
        home_care_booking_id=booking.id,
        invoice_number=next_invoice_number(
            session, tenant_id, str(invoice_prefix or "INV"), booking.branch_id
        ),
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
    billing.add_invoice(invoice)
    session.commit()
    session.refresh(invoice)
    service_by_id = {
        service.id: service
        for service in HomeCareServiceRepository(session).list_by_ids(
            tenant_id=tenant_id,
            service_ids=[row.service_id for row in rows if row.service_id],
        )
    }
    for row in rows:
        service = service_by_id.get(row.service_id or "")
        selling_amount = int(
            row.total_amount
            if row.service_category == "home_care_service"
            else row.unit_amount or (service.default_price if service else 0)
        )
        mrp_amount = int(service.mrp_price if service else 0)
        description = row.description
        if isinstance(row, HomeCareVisitLog):
            description = f"{row.description} ({row.visit_date.isoformat()})"
        billing.add_invoice_item(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type="home_care",
                description=description,
                quantity=row.quantity,
                unit_amount=row.unit_amount,
                total_amount=row.total_amount,
                mrp_amount=mrp_amount,
                selling_amount=selling_amount,
                external_source="home_care",
                external_slug=row.service_category or "home_care_service",
                external_item_code=row.id
                if isinstance(row, HomeCareVisitLog)
                else row.service_id,
            )
        )
    session.commit()
    session.refresh(invoice)
    _sync_booking_status_from_invoice(session, booking, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=booking.branch_id,
        actor_user_id=payload.created_by_user_id or current_user.id,
        action="home_care_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="home_care_billing",
        metadata_json=f'{{"home_care_booking_id":"{booking.id}"}}',
    )
    return _invoice_detail(session, invoice)
