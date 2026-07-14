from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus, TaxRule
from app.modules.billing.schemas import (
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceRead,
    PaymentRead,
)
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.home_care.models import (
    HomeCareBooking,
    HomeCareBookingItem,
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
from app.modules.home_care.schemas import HomeCareInvoiceCreate
from app.modules.home_care.services.booking_support_service import (
    HomeCareBookingSupportService,
)
from app.modules.identity.models import User
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class HomeCareBillingService:
    """Manages invoice generation and retrieval for home care bookings."""

    def __init__(self, session: Session):
        self.session = session
        self.bookings = HomeCareBookingRepository(session)
        self.items = HomeCareBookingItemRepository(session)
        self.visits = HomeCareVisitLogRepository(session)
        self.services = HomeCareServiceRepository(session)
        self.references = HomeCareReferenceRepository(session)
        self.billing = HomeCareBillingRepository(session)
        self.booking_support = HomeCareBookingSupportService(session)

    def _invoice_detail(self, invoice: Invoice) -> InvoiceDetailRead:
        items = self.billing.list_invoice_items(invoice)
        payments = self.billing.list_invoice_payments(invoice)
        return InvoiceDetailRead(
            status=invoice.status,
            invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
            items=[
                InvoiceItemRead.model_validate(item, from_attributes=True)
                for item in items
            ],
            payments=[
                PaymentRead.model_validate(payment, from_attributes=True)
                for payment in payments
            ],
        )

    def _resolve_tax_rule(
        self, tenant_id: str, branch_id: str, tax_rule_id: str | None
    ) -> TaxRule | None:
        tax_rule = self.billing.get_active_tax_rule(
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
        self, booking: HomeCareBooking, invoice: Invoice
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
            self.bookings.add(booking)
            self.session.commit()

    def get_booking_invoice(
        self, *, tenant_id: str, booking_id: str, actor: User
    ) -> InvoiceDetailRead | None:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        # Ignore voided invoices so a booking whose invoice was cancelled shows as
        # un-billed again (the UI then offers "Generate Invoice" instead of "View").
        invoice = self.billing.get_active_booking_invoice(
            tenant_id=tenant_id, booking_id=booking.id
        )
        if not invoice:
            return None
        self._sync_booking_status_from_invoice(booking, invoice)
        return self._invoice_detail(invoice)

    def generate_invoice(
        self,
        *,
        tenant_id: str,
        booking_id: str,
        payload: HomeCareInvoiceCreate | None,
        actor: User,
    ) -> InvoiceDetailRead:
        enforce_module_enabled(self.session, tenant_id, "home_care")
        payload = payload or HomeCareInvoiceCreate()
        booking = self.booking_support.get_or_404(tenant_id, booking_id, actor)
        # Ignore voided invoices so a booking whose invoice was cancelled can be
        # re-billed instead of returning the dead invoice and re-locking it.
        existing = self.billing.get_active_booking_invoice(
            tenant_id=tenant_id, booking_id=booking.id
        )
        if existing:
            self._sync_booking_status_from_invoice(booking, existing)
            return self._invoice_detail(existing)
        visit_rows = self.visits.list_completed_billable_for_booking(
            tenant_id=tenant_id, booking_id=booking.id
        )
        planned_rows = self.items.list_billable_for_booking(
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
        patient = self.references.get_patient_for_tenant(tenant_id, patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Home care booking patient is invalid",
            )

        def billable_amount(row: HomeCareVisitLog | HomeCareBookingItem) -> int:
            # Visit-log unit_amount is the final amount entered by the user.
            # Using it here also corrects legacy logs whose stored total_amount
            # was previously multiplied by the hours/visit quantity.
            if isinstance(row, HomeCareVisitLog):
                return int(row.unit_amount or 0)
            return int(row.total_amount or 0)

        subtotal = sum(billable_amount(row) for row in rows)
        discount = min(payload.discount_amount, subtotal)
        taxable = subtotal - discount
        tax_rule = self._resolve_tax_rule(
            tenant_id, booking.branch_id, payload.tax_rule_id
        )
        tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
        total = taxable + tax_amount
        invoice_prefix, _scope, _scope_id = resolve_setting(
            self.session,
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
                self.session, tenant_id, str(invoice_prefix or "INV"), booking.branch_id
            ),
            subtotal_amount=subtotal,
            discount_amount=discount,
            taxable_amount=taxable,
            tax_amount=tax_amount,
            tax_rule_id=tax_rule.id if tax_rule else None,
            total_amount=total,
            balance_amount=total,
            clinic_share_amount=total,
            created_by_user_id=payload.created_by_user_id or actor.id,
        )
        self.billing.add_invoice(invoice)
        self.session.commit()
        self.session.refresh(invoice)
        service_by_id = {
            service.id: service
            for service in self.services.list_by_ids(
                tenant_id=tenant_id,
                service_ids=[row.service_id for row in rows if row.service_id],
            )
        }
        for row in rows:
            service = service_by_id.get(row.service_id or "")
            line_amount = billable_amount(row)
            selling_amount = int(
                line_amount
                if row.service_category == "home_care_service"
                else row.unit_amount or (service.default_price if service else 0)
            )
            mrp_amount = int(service.mrp_price if service else 0)
            description = row.description
            if isinstance(row, HomeCareVisitLog):
                description = f"{row.description} ({row.visit_date.isoformat()})"
            self.billing.add_invoice_item(
                InvoiceItem(
                    tenant_id=tenant_id,
                    invoice_id=invoice.id,
                    item_type="home_care",
                    description=description,
                    quantity=row.quantity,
                    unit_amount=row.unit_amount,
                    total_amount=line_amount,
                    mrp_amount=mrp_amount,
                    selling_amount=selling_amount,
                    external_source="home_care",
                    external_slug=row.service_category or "home_care_service",
                    external_item_code=row.id
                    if isinstance(row, HomeCareVisitLog)
                    else row.service_id,
                )
            )
        self.session.commit()
        self.session.refresh(invoice)
        self._sync_booking_status_from_invoice(booking, invoice)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=booking.branch_id,
            actor_user_id=payload.created_by_user_id or actor.id,
            action="home_care_invoice.generated",
            resource_type="invoice",
            resource_id=invoice.id,
            purpose="home_care_billing",
            metadata_json=f'{{"home_care_booking_id":"{booking.id}"}}',
        )
        return self._invoice_detail(invoice)
