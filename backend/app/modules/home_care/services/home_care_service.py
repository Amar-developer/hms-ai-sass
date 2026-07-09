from sqlmodel import Session

from app.modules.billing.schemas import InvoiceDetailRead
from app.modules.home_care.schemas import (
    HomeCareBookingCreate,
    HomeCareBookingRead,
    HomeCareBookingUpdate,
    HomeCareInvoiceCreate,
    HomeCareVisitLogCreate,
    HomeCareVisitLogRead,
    HomeCareVisitLogUpdate,
)
from app.modules.home_care.services.billing_service import HomeCareBillingService
from app.modules.home_care.services.booking_service import (
    HomeCareBookingLifecycleService,
)
from app.modules.home_care.services.catalog_service import (  # noqa: F401
    HomeCareCatalogService,
)
from app.modules.home_care.services.visit_service import HomeCareVisitService
from app.modules.identity.models import User


class HomeCareBookingService:
    """Facade over booking, visit log, and billing services for home care."""

    def __init__(self, session: Session):
        self.session = session
        self.booking_service = HomeCareBookingLifecycleService(session)
        self.visit_service = HomeCareVisitService(session)
        self.billing_service = HomeCareBillingService(session)

    def list_bookings(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        patient_id: str | None,
        status_filter: str | None,
        actor: User,
    ) -> list[HomeCareBookingRead]:
        return self.booking_service.list_bookings(
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
            status_filter=status_filter,
            actor=actor,
        )

    def create_booking(
        self, *, tenant_id: str, payload: HomeCareBookingCreate, actor: User
    ) -> HomeCareBookingRead:
        return self.booking_service.create_booking(
            tenant_id=tenant_id, payload=payload, actor=actor
        )

    def update_booking(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareBookingUpdate,
        actor: User,
    ) -> HomeCareBookingRead:
        return self.booking_service.update_booking(
            tenant_id=tenant_id, booking_id=booking_id, payload=payload, actor=actor
        )

    def create_visit_log(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareVisitLogCreate,
        actor: User,
    ) -> HomeCareVisitLogRead:
        return self.visit_service.create_visit_log(
            tenant_id=tenant_id, booking_id=booking_id, payload=payload, actor=actor
        )

    def update_visit_log(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        visit_id: str,
        payload: HomeCareVisitLogUpdate,
        actor: User,
    ) -> HomeCareVisitLogRead:
        return self.visit_service.update_visit_log(
            tenant_id=tenant_id,
            booking_id=booking_id,
            visit_id=visit_id,
            payload=payload,
            actor=actor,
        )

    def delete_visit_log(
        self, *, tenant_id: str, booking_id: str, visit_id: str, actor: User
    ) -> HomeCareVisitLogRead:
        return self.visit_service.delete_visit_log(
            tenant_id=tenant_id, booking_id=booking_id, visit_id=visit_id, actor=actor
        )

    def get_booking_invoice(
        self, *, tenant_id: str, booking_id: str, actor: User
    ) -> InvoiceDetailRead | None:
        return self.billing_service.get_booking_invoice(
            tenant_id=tenant_id, booking_id=booking_id, actor=actor
        )

    def generate_invoice(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareInvoiceCreate | None,
        actor: User,
    ) -> InvoiceDetailRead:
        return self.billing_service.generate_invoice(
            tenant_id=tenant_id, booking_id=booking_id, payload=payload, actor=actor
        )
