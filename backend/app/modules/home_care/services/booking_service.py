from datetime import date

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import (
    require_branch_in_tenant,
    require_user_branch_access,
    scoped_branch_id,
)
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.home_care.constants import LOCKED_BOOKING_STATUSES
from app.modules.home_care.models import HomeCareBooking
from app.modules.home_care.repositories import HomeCareBookingRepository
from app.modules.home_care.schemas import (
    HomeCareBookingCreate,
    HomeCareBookingRead,
    HomeCareBookingUpdate,
)
from app.modules.home_care.services.booking_support_service import (
    HomeCareBookingSupportService,
)
from app.modules.identity.models import User
from app.modules.settings.numbering import next_document_number
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class HomeCareBookingLifecycleService:
    """Manages home care booking creation, updates, and listing."""

    def __init__(self, session: Session):
        self.session = session
        self.bookings = HomeCareBookingRepository(session)
        self.booking_support = HomeCareBookingSupportService(session)

    def list_bookings(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: str | None,
        actor: User,
    ) -> list[HomeCareBookingRead]:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        branch_scope = scoped_branch_id(actor, branch_id)
        rows = self.bookings.list_for_tenant(
            tenant_id=tenant_id,
            branch_id=branch_scope,
            patient_id=patient_id,
            status_filter=status_filter,
        )
        return [self.booking_support.read_booking(row) for row in rows]

    def create_booking(
        self, *, tenant_id: str, payload: HomeCareBookingCreate, actor: User
    ) -> HomeCareBookingRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        require_branch_in_tenant(self.session, tenant_id, payload.branch_id)
        require_user_branch_access(actor, payload.branch_id)
        self.booking_support.validate_patient_and_staff(tenant_id, payload)
        if payload.end_date and (payload.start_date or date.today()) > payload.end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date must be on or after start date",
            )
        booking = HomeCareBooking.model_validate(
            payload,
            update={
                "tenant_id": tenant_id,
                "booking_number": next_document_number(
                    self.session,
                    tenant_id=tenant_id,
                    branch_id=payload.branch_id,
                    entity="home_care_booking",
                ),
                "start_date": payload.start_date or date.today(),
                "booking_type": payload.booking_type.lower(),
                "recurrence": payload.recurrence.lower(),
                "status": payload.status.lower(),
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            },
        )
        self.bookings.add(booking)
        self.session.commit()
        self.session.refresh(booking)
        self.booking_support.replace_booking_items(tenant_id, booking, payload.services)
        self.session.commit()
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=booking.branch_id,
            actor_user_id=actor.id,
            action="home_care_booking.created",
            resource_type="home_care_booking",
            resource_id=booking.id,
            purpose="home_care",
        )
        return self.booking_support.read_booking(booking)

    def update_booking(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareBookingUpdate,
        actor: User,
    ) -> HomeCareBookingRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        if booking.status in LOCKED_BOOKING_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This booking is {booking.status} and can no longer be edited",
            )
        self.booking_support.validate_patient_and_staff(tenant_id, payload)
        data = payload.model_dump(exclude_unset=True, exclude={"services"})
        before = {key: getattr(booking, key) for key in data}
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
        booking.updated_by_user_id = actor.id
        self.bookings.add(booking)
        if payload.services is not None:
            self.booking_support.replace_booking_items(
                tenant_id, booking, payload.services
            )
        self.session.commit()
        self.session.refresh(booking)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=booking.branch_id,
            actor_user_id=actor.id,
            action="home_care_booking.updated",
            resource_type="home_care_booking",
            resource_id=booking.id,
            purpose="home_care",
            changes=diff_changes(before, {key: getattr(booking, key) for key in data}),
        )
        return self.booking_support.read_booking(booking)
