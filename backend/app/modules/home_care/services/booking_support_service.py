from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.home_care.models import HomeCareBooking, HomeCareBookingItem
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
from app.modules.identity.models import User


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

    def read_booking(self, booking: HomeCareBooking) -> HomeCareBookingRead:
        items = self.items.list_for_booking(
            tenant_id=booking.tenant_id, booking_id=booking.id
        )
        data = HomeCareBookingRead.model_validate(
            booking, from_attributes=True
        ).model_dump()
        data["services"] = [
            HomeCareBookingItemRead.model_validate(item, from_attributes=True)
            for item in items
        ]
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
        existing = self.items.list_for_booking(
            tenant_id=tenant_id, booking_id=booking.id
        )
        for row in existing:
            self.items.delete(row)
        for row in services:
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
            total_amount = row.quantity * unit_amount
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
