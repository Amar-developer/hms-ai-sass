from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.home_care.constants import LOCKED_BOOKING_STATUSES
from app.modules.home_care.models import HomeCareBooking, HomeCareVisitLog
from app.modules.home_care.repositories import (
    HomeCareBookingRepository,
    HomeCareReferenceRepository,
    HomeCareServiceRepository,
    HomeCareVisitLogRepository,
)
from app.modules.home_care.schemas import (
    HomeCareVisitLogCreate,
    HomeCareVisitLogRead,
    HomeCareVisitLogUpdate,
)
from app.modules.home_care.services.booking_support_service import (
    HomeCareBookingSupportService,
)
from app.modules.identity.models import User
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class HomeCareVisitService:
    """Manages home care visit log creation, updates, and deletion."""

    def __init__(self, session: Session):
        self.session = session
        self.bookings = HomeCareBookingRepository(session)
        self.visits = HomeCareVisitLogRepository(session)
        self.services = HomeCareServiceRepository(session)
        self.references = HomeCareReferenceRepository(session)
        self.booking_support = HomeCareBookingSupportService(session)

    def _visit_log_from_payload(
        self,
        tenant_id: str,
        booking: HomeCareBooking,
        payload: HomeCareVisitLogCreate | HomeCareVisitLogUpdate,
        actor: User,
        existing: HomeCareVisitLog | None = None,
    ) -> HomeCareVisitLog:
        staff_id = payload.assigned_staff_user_id
        if staff_id:
            staff = self.references.get_active_staff_for_tenant(tenant_id, staff_id)
            if not staff:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid assigned staff",
                )
        service = (
            self.services.get_active_for_tenant(tenant_id, payload.service_id)
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
                existing.assigned_staff_name
                if existing
                else booking.assigned_staff_name
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
            existing.updated_by_user_id = actor.id
            existing.updated_at = now_utc()
            return existing
        return HomeCareVisitLog(
            **values,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )

    def create_visit_log(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareVisitLogCreate,
        actor: User,
    ) -> HomeCareVisitLogRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        if booking.status in LOCKED_BOOKING_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This booking is {booking.status} and cannot accept visit logs",
            )
        row = self._visit_log_from_payload(tenant_id, booking, payload, actor)
        self.visits.add(row)
        booking.updated_at = now_utc()
        booking.updated_by_user_id = actor.id
        self.bookings.add(booking)
        self.session.commit()
        self.session.refresh(row)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=booking.branch_id,
            actor_user_id=actor.id,
            action="home_care_visit.logged",
            resource_type="home_care_visit_log",
            resource_id=row.id,
            purpose="home_care",
        )
        return HomeCareVisitLogRead.model_validate(row, from_attributes=True)

    def update_visit_log(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        visit_id: str,
        payload: HomeCareVisitLogUpdate,
        actor: User,
    ) -> HomeCareVisitLogRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        if booking.status in LOCKED_BOOKING_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This booking is {booking.status} and can no longer be edited",
            )
        row = self.visits.get_for_booking(
            tenant_id=tenant_id, booking_id=booking.id, visit_id=visit_id
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Visit log not found"
            )
        row = self._visit_log_from_payload(tenant_id, booking, payload, actor, row)
        self.visits.add(row)
        booking.updated_at = now_utc()
        booking.updated_by_user_id = actor.id
        self.bookings.add(booking)
        self.session.commit()
        self.session.refresh(row)
        return HomeCareVisitLogRead.model_validate(row, from_attributes=True)

    def delete_visit_log(
        self, *, tenant_id: str, booking_id: str, visit_id: str, actor: User
    ) -> HomeCareVisitLogRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        if booking.status in LOCKED_BOOKING_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This booking is {booking.status} and can no longer be edited",
            )
        row = self.visits.get_for_booking(
            tenant_id=tenant_id, booking_id=booking.id, visit_id=visit_id
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Visit log not found"
            )
        data = HomeCareVisitLogRead.model_validate(row, from_attributes=True)
        self.visits.delete(row)
        booking.updated_at = now_utc()
        booking.updated_by_user_id = actor.id
        self.bookings.add(booking)
        self.session.commit()
        return data
