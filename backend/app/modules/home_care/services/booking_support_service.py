from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.home_care.models import (
    HomeCareBooking,
    HomeCareBookingItem,
    HomeCareVisitLog,
)
from app.modules.home_care.repositories import (
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
    HomeCareVisitLogRead,
)
from app.modules.home_care.visit_days import parse_weekdays, planned_visit_count
from app.modules.identity.models import User
from app.modules.patients.services.references import PatientReference


class HomeCareBookingSupportService:
    """Reusable booking lookup, read-model, validation, and item helpers."""

    def __init__(self, session: Session):
        self.bookings = HomeCareBookingRepository(session)
        self.items = HomeCareBookingItemRepository(session)
        self.visits = HomeCareVisitLogRepository(session)
        self.services = HomeCareServiceRepository(session)
        self.references = HomeCareReferenceRepository(session)

    def get_or_404(
        self, tenant_id: str, booking_id: str, actor: User
    ) -> HomeCareBooking:
        booking = self.bookings.get_for_tenant(tenant_id, booking_id)
        if not booking:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Home care booking not found",
            )
        require_user_branch_access(actor, booking.branch_id)
        return booking

    def read_booking(
        self,
        booking: HomeCareBooking,
        patient_reference: PatientReference | None = None,
        *,
        items: list[HomeCareBookingItem] | None = None,
        visit_logs: list[HomeCareVisitLog] | None = None,
    ) -> HomeCareBookingRead:
        if items is None:
            items = self.items.list_for_booking(
                tenant_id=booking.tenant_id, booking_id=booking.id
            )
        data = HomeCareBookingRead.model_validate(
            booking, from_attributes=True
        ).model_dump()
        # Expand the stored day selection into the plan, so callers never have
        # to re-derive "how many visits is this booking actually for".
        weekdays = parse_weekdays(booking.visit_weekdays_json)
        data["visit_weekdays"] = weekdays
        data["planned_visit_count"] = planned_visit_count(
            start_date=booking.start_date,
            end_date=booking.end_date,
            visit_day_mode=booking.visit_day_mode,
            visit_weekdays=weekdays,
        )
        if patient_reference is None:
            patient = self.references.get_patient_for_tenant(
                booking.tenant_id, booking.patient_id
            )
            if patient:
                patient_reference = PatientReference(
                    id=patient.id,
                    name=patient.full_name,
                    number=patient.patient_number,
                    mobile=patient.mobile,
                )
        if patient_reference:
            data["patient_name"] = patient_reference.name
            data["patient_number"] = patient_reference.number
        data["services"] = [
            HomeCareBookingItemRead.model_validate(item, from_attributes=True)
            for item in items
        ]
        if visit_logs is None:
            visit_logs = self.visits.list_for_booking(
                tenant_id=booking.tenant_id, booking_id=booking.id
            )
        data["visit_logs"] = [
            HomeCareVisitLogRead.model_validate(row, from_attributes=True)
            for row in visit_logs
        ]
        return HomeCareBookingRead(**data)

    def validate_patient_and_staff(
        self,
        tenant_id: str,
        payload: HomeCareBookingCreate | HomeCareBookingUpdate,
    ) -> None:
        patient_id = getattr(payload, "patient_id", None)
        if patient_id is not None:
            patient_id = patient_id.strip()
            if not patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Patient is required",
                )
            patient = self.references.get_patient_for_tenant(tenant_id, patient_id)
            if not patient:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found"
                )
        staff_id = getattr(payload, "assigned_staff_user_id", None)
        if staff_id:
            staff = self.references.get_active_staff_for_tenant(tenant_id, staff_id)
            if not staff:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned staff",
                )

    def replace_booking_items(
        self,
        tenant_id: str,
        booking: HomeCareBooking,
        services: list[HomeCareBookingItemCreate],
    ) -> None:
        booking_type = str(booking.booking_type or "home_care").lower()
        existing = self.items.list_for_booking(
            tenant_id=tenant_id, booking_id=booking.id
        )
        for row in existing:
            self.items.delete(row)
        for row in services:
            if booking_type == "home_care" and row.service_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Home care services must be entered manually",
                )
            if booking_type == "home_visit" and not row.service_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Home visit service is required",
                )
            service = (
                self.services.get_active_for_tenant(tenant_id, row.service_id)
                if row.service_id
                else None
            )
            if row.service_id and not service:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid home care service",
                )
            description = (
                row.description or service.name if service else row.description
            )
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
            total_amount = (
                row.quantity * unit_amount
                if booking_type == "home_visit"
                else unit_amount
            )
            self.items.add(
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
