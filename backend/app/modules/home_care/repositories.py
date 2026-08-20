from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.list_filters import (
    ListFilter,
    ListFilterOption,
    ListSort,
    apply_list_filters,
    apply_list_sort,
    labeled_filter_options,
    tenant_user_filter_options,
)
from app.core.pagination import DEFAULT_LIST_LIMIT
from app.modules.billing.models import (
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    TaxRule,
)
from app.modules.home_care.listing import HOME_CARE_SERVICE_LIST_SPEC
from app.modules.home_care.models import (
    HomeCareBooking,
    HomeCareBookingItem,
    HomeCareService,
    HomeCareVisitLog,
)
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.tenants.models import Branch


class HomeCareServiceRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, service: HomeCareService) -> HomeCareService:
        self.session.add(service)
        return service

    def get_for_tenant(self, tenant_id: str, service_id: str) -> HomeCareService | None:
        service = self.session.get(HomeCareService, service_id)
        if not service or service.tenant_id != tenant_id:
            return None
        return service

    def get_active_for_tenant(
        self, tenant_id: str, service_id: str
    ) -> HomeCareService | None:
        service = self.get_for_tenant(tenant_id, service_id)
        if not service or not service.is_active:
            return None
        return service

    def list_active(self, tenant_id: str) -> list[HomeCareService]:
        return list(
            self.session.exec(
                select(HomeCareService)
                .where(
                    HomeCareService.tenant_id == tenant_id,
                    HomeCareService.is_active == True,  # noqa: E712
                )
                .order_by(HomeCareService.name)
            ).all()
        )

    def list_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
        list_sort: ListSort | None = None,
        limit: int = DEFAULT_LIST_LIMIT,
        offset: int = 0,
    ) -> list[HomeCareService]:
        statement = self._list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        )
        statement = apply_list_sort(
            statement,
            HOME_CARE_SERVICE_LIST_SPEC,
            list_sort,
            default_order=[
                HomeCareService.updated_at.desc(),
                HomeCareService.created_at.desc(),
            ],
        )
        return list(self.session.exec(statement.offset(offset).limit(limit)).all())

    def count_page(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None = None,
        list_filters: list[ListFilter] | None = None,
    ) -> int:
        filtered = self._list_statement(
            tenant_id=tenant_id,
            branch_id=branch_id,
            include_inactive=include_inactive,
            q=q,
            list_filters=list_filters,
        ).subquery()
        return int(self.session.exec(select(func.count()).select_from(filtered)).one())

    def filter_options(self, *, tenant_id: str) -> dict[str, list[ListFilterOption]]:
        branches = (
            select(Branch.id, Branch.name)
            .where(Branch.tenant_id == tenant_id)
            .order_by(Branch.name)
        )
        return {
            "branch_id": labeled_filter_options(
                list(self.session.exec(branches).all())
            ),
            "is_active": [
                ListFilterOption(value="true", label="Active"),
                ListFilterOption(value="false", label="Inactive"),
            ],
            "created_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
            "updated_by_user_id": tenant_user_filter_options(
                self.session,
                User,
                tenant_id=tenant_id,
            ),
        }

    def _list_statement(
        self,
        *,
        tenant_id: str,
        branch_id: str | None,
        include_inactive: bool,
        q: str | None,
        list_filters: list[ListFilter] | None,
    ):
        statement = (
            select(HomeCareService)
            .outerjoin(Branch, HomeCareService.branch_id == Branch.id)
            .where(HomeCareService.tenant_id == tenant_id)
        )
        if branch_id:
            statement = statement.where(
                (HomeCareService.branch_id == branch_id)
                | (HomeCareService.branch_id.is_(None))
            )
        if not include_inactive:
            statement = statement.where(HomeCareService.is_active == True)  # noqa: E712
        if q:
            term = q.strip().lower()
            statement = statement.where(
                or_(
                    func.lower(HomeCareService.code).contains(term, autoescape=True),
                    func.lower(HomeCareService.name).contains(term, autoescape=True),
                    func.lower(HomeCareService.description).contains(
                        term,
                        autoescape=True,
                    ),
                )
            )
        if list_filters:
            statement = apply_list_filters(
                statement,
                HOME_CARE_SERVICE_LIST_SPEC,
                list_filters,
            )
        return statement

    def list_by_ids(
        self, *, tenant_id: str, service_ids: list[str]
    ) -> list[HomeCareService]:
        if not service_ids:
            return []
        return list(
            self.session.exec(
                select(HomeCareService).where(
                    HomeCareService.tenant_id == tenant_id,
                    HomeCareService.id.in_(service_ids),
                )
            ).all()
        )


class HomeCareBookingRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, booking: HomeCareBooking) -> HomeCareBooking:
        self.session.add(booking)
        return booking

    def get_for_tenant(self, tenant_id: str, booking_id: str) -> HomeCareBooking | None:
        booking = self.session.get(HomeCareBooking, booking_id)
        if not booking or booking.tenant_id != tenant_id:
            return None
        return booking

    def list_for_tenant(
        self,
        *,
        tenant_id: str,
        branch_id: str | None = None,
        patient_id: str | None = None,
        status_filter: str | None = None,
    ) -> list[HomeCareBooking]:
        statement = select(HomeCareBooking).where(
            HomeCareBooking.tenant_id == tenant_id
        )
        if branch_id:
            statement = statement.where(HomeCareBooking.branch_id == branch_id)
        if patient_id:
            statement = statement.where(HomeCareBooking.patient_id == patient_id)
        if status_filter:
            statement = statement.where(HomeCareBooking.status == status_filter)
        return list(
            self.session.exec(
                statement.order_by(
                    HomeCareBooking.updated_at.desc(),
                    HomeCareBooking.created_at.desc(),
                )
            ).all()
        )


class HomeCareBookingItemRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, item: HomeCareBookingItem) -> HomeCareBookingItem:
        self.session.add(item)
        return item

    def delete(self, item: HomeCareBookingItem) -> None:
        self.session.delete(item)

    def list_for_booking(
        self, *, tenant_id: str, booking_id: str
    ) -> list[HomeCareBookingItem]:
        return list(
            self.session.exec(
                select(HomeCareBookingItem)
                .where(
                    HomeCareBookingItem.tenant_id == tenant_id,
                    HomeCareBookingItem.booking_id == booking_id,
                )
                .order_by(HomeCareBookingItem.created_at)
            ).all()
        )

    def list_for_bookings(
        self, *, tenant_id: str, booking_ids: set[str]
    ) -> list[HomeCareBookingItem]:
        if not booking_ids:
            return []
        return list(
            self.session.exec(
                select(HomeCareBookingItem)
                .where(
                    HomeCareBookingItem.tenant_id == tenant_id,
                    HomeCareBookingItem.booking_id.in_(booking_ids),
                )
                .order_by(
                    HomeCareBookingItem.booking_id,
                    HomeCareBookingItem.created_at,
                )
            ).all()
        )

    def list_billable_for_booking(
        self, *, tenant_id: str, booking_id: str
    ) -> list[HomeCareBookingItem]:
        return list(
            self.session.exec(
                select(HomeCareBookingItem).where(
                    HomeCareBookingItem.tenant_id == tenant_id,
                    HomeCareBookingItem.booking_id == booking_id,
                    HomeCareBookingItem.total_amount > 0,
                )
            ).all()
        )


class HomeCareVisitLogRepository:
    def __init__(self, session: Session):
        self.session = session

    def add(self, visit: HomeCareVisitLog) -> HomeCareVisitLog:
        self.session.add(visit)
        return visit

    def delete(self, visit: HomeCareVisitLog) -> None:
        self.session.delete(visit)

    def get_for_booking(
        self, *, tenant_id: str, booking_id: str, visit_id: str
    ) -> HomeCareVisitLog | None:
        visit = self.session.get(HomeCareVisitLog, visit_id)
        if not visit or visit.tenant_id != tenant_id or visit.booking_id != booking_id:
            return None
        return visit

    def list_for_booking(
        self, *, tenant_id: str, booking_id: str
    ) -> list[HomeCareVisitLog]:
        return list(
            self.session.exec(
                select(HomeCareVisitLog)
                .where(
                    HomeCareVisitLog.tenant_id == tenant_id,
                    HomeCareVisitLog.booking_id == booking_id,
                )
                .order_by(HomeCareVisitLog.visit_date, HomeCareVisitLog.created_at)
            ).all()
        )

    def list_for_bookings(
        self, *, tenant_id: str, booking_ids: set[str]
    ) -> list[HomeCareVisitLog]:
        if not booking_ids:
            return []
        return list(
            self.session.exec(
                select(HomeCareVisitLog)
                .where(
                    HomeCareVisitLog.tenant_id == tenant_id,
                    HomeCareVisitLog.booking_id.in_(booking_ids),
                )
                .order_by(
                    HomeCareVisitLog.booking_id,
                    HomeCareVisitLog.visit_date,
                    HomeCareVisitLog.created_at,
                )
            ).all()
        )

    def list_completed_billable_for_booking(
        self, *, tenant_id: str, booking_id: str
    ) -> list[HomeCareVisitLog]:
        return list(
            self.session.exec(
                select(HomeCareVisitLog).where(
                    HomeCareVisitLog.tenant_id == tenant_id,
                    HomeCareVisitLog.booking_id == booking_id,
                    HomeCareVisitLog.status == "completed",
                    HomeCareVisitLog.total_amount > 0,
                )
            ).all()
        )


class HomeCareReferenceRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_patient_for_tenant(self, tenant_id: str, patient_id: str) -> Patient | None:
        patient = self.session.get(Patient, patient_id)
        if not patient or patient.tenant_id != tenant_id:
            return None
        return patient

    def get_active_staff_for_tenant(self, tenant_id: str, staff_id: str) -> User | None:
        staff = self.session.get(User, staff_id)
        if not staff or staff.tenant_id != tenant_id or not staff.is_active:
            return None
        return staff


class HomeCareBillingRepository:
    def __init__(self, session: Session):
        self.session = session

    def add_invoice(self, invoice: Invoice) -> Invoice:
        self.session.add(invoice)
        return invoice

    def add_invoice_item(self, item: InvoiceItem) -> InvoiceItem:
        self.session.add(item)
        return item

    def get_active_booking_invoice(
        self, *, tenant_id: str, booking_id: str
    ) -> Invoice | None:
        return self.session.exec(
            select(Invoice).where(
                Invoice.tenant_id == tenant_id,
                Invoice.home_care_booking_id == booking_id,
                Invoice.status.notin_(
                    [InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED]
                ),
            )
        ).first()

    def list_invoice_items(self, invoice: Invoice) -> list[InvoiceItem]:
        return list(
            self.session.exec(
                select(InvoiceItem)
                .where(
                    InvoiceItem.tenant_id == invoice.tenant_id,
                    InvoiceItem.invoice_id == invoice.id,
                )
                .order_by(InvoiceItem.created_at)
            ).all()
        )

    def list_invoice_payments(self, invoice: Invoice) -> list[Payment]:
        return list(
            self.session.exec(
                select(Payment)
                .where(
                    Payment.tenant_id == invoice.tenant_id,
                    Payment.invoice_id == invoice.id,
                )
                .order_by(Payment.collected_at)
            ).all()
        )

    def get_active_tax_rule(
        self, *, tenant_id: str, branch_id: str, tax_rule_id: str | None
    ) -> TaxRule | None:
        tax_rule = self.session.get(TaxRule, tax_rule_id) if tax_rule_id else None
        if tax_rule:
            return tax_rule
        return self.session.exec(
            select(TaxRule).where(
                TaxRule.tenant_id == tenant_id,
                TaxRule.is_active == True,  # noqa: E712
                (TaxRule.branch_id == branch_id) | (TaxRule.branch_id.is_(None)),
            )
        ).first()
