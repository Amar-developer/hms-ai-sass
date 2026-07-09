from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, TaxRule
from app.modules.billing.schemas import (
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceRead,
    PaymentRead,
)
from app.modules.billing.service import next_invoice_number
from app.modules.identity.models import User
from app.modules.physiotherapy.models import PhysiotherapyCase
from app.modules.physiotherapy.repositories import (
    PhysiotherapyBillingRepository,
    PhysiotherapySessionRepository,
)
from app.modules.physiotherapy.schemas import PhysiotherapyInvoiceCreate
from app.modules.physiotherapy.services.case_lookup import PhysiotherapyCaseLookup
from app.modules.physiotherapy.services.fee_strategies import PhysiotherapistFeeResolver
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import now_utc


class PhysiotherapyBillingService:
    """Generates and retrieves invoices for physiotherapy cases, splitting the
    bill between clinic and physiotherapist shares via fee-share strategies."""

    def __init__(self, session: Session):
        self.session = session
        self.sessions = PhysiotherapySessionRepository(session)
        self.billing = PhysiotherapyBillingRepository(session)
        self.lookup = PhysiotherapyCaseLookup(session)
        self.fees = PhysiotherapistFeeResolver(session)

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

    def _sync_case_status_from_invoice(
        self, case: PhysiotherapyCase, invoice: Invoice
    ) -> PhysiotherapyCase:
        target_status = (
            "paid"
            if invoice.balance_amount <= 0 and invoice.total_amount > 0
            else "completed"
        )
        if case.status != target_status:
            case.status = target_status
            case.updated_at = now_utc()
            self.lookup.cases.add(case)
            self.session.commit()
            self.session.refresh(case)
        return case

    def get_case_invoice(
        self, *, tenant_id: str, case_id: str, actor: User
    ) -> InvoiceDetailRead | None:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        invoice = self.billing.get_case_invoice(tenant_id=tenant_id, case_id=case.id)
        if not invoice:
            return None
        self._sync_case_status_from_invoice(case, invoice)
        return self._invoice_detail(invoice)

    def generate_invoice(
        self,
        *,
        tenant_id: str,
        case_id: str,
        payload: PhysiotherapyInvoiceCreate | None,
        actor: User,
    ) -> InvoiceDetailRead:
        enforce_module_enabled(self.session, tenant_id, "physiotherapy")
        payload = payload or PhysiotherapyInvoiceCreate()
        case = self.lookup.get_or_404(tenant_id, case_id, actor)
        # Lock the case row so a concurrent generate-invoice request for the same
        # case serializes on this check-then-insert; the unique index on
        # Invoice.physiotherapy_case_id is the DB-level backstop below.
        self.billing.lock_case(case.id)
        existing = self.billing.get_case_invoice(tenant_id=tenant_id, case_id=case.id)
        if existing:
            self._sync_case_status_from_invoice(case, existing)
            return self._invoice_detail(existing)
        rows = self.sessions.list_billable_for_case(
            tenant_id=tenant_id, case_id=case.id
        )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Add at least one billable physiotherapy session before generating invoice",
            )
        subtotal = sum(row.charge_amount for row in rows)
        discount = min(payload.discount_amount, subtotal)
        taxable = subtotal - discount
        tax_rule = self._resolve_tax_rule(
            tenant_id, case.branch_id, payload.tax_rule_id
        )
        tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
        total = taxable + tax_amount
        discount_ratio = discount / subtotal if subtotal else 0
        doctor_share = 0
        first_fee_rule_id = None
        for row in rows:
            therapist_id = row.physiotherapist_id or case.physiotherapist_id
            fee_rule = self.fees.resolve_fee_rule(
                tenant_id, case.branch_id, therapist_id
            )
            if fee_rule and not first_fee_rule_id:
                first_fee_rule_id = fee_rule.id
            session_taxable = max(
                row.charge_amount - round(row.charge_amount * discount_ratio), 0
            )
            session_tax = round(
                session_taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100
            )
            share_basis = (
                session_taxable + session_tax
                if fee_rule and fee_rule.share_tax_with_doctor
                else session_taxable
            )
            doctor_share += self.fees.doctor_share_for_amount(fee_rule, share_basis)
        clinic_share = max(total - doctor_share, 0)
        invoice_prefix, _scope, _scope_id = resolve_setting(
            self.session,
            tenant_id=tenant_id,
            module="invoice",
            key=SettingKey.INVOICE_PREFIX,
            branch_id=case.branch_id,
        )
        invoice = Invoice(
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            patient_id=case.patient_id,
            appointment_id=case.source_appointment_id,
            ip_admission_id=case.ip_admission_id,
            physiotherapy_case_id=case.id,
            invoice_number=next_invoice_number(
                self.session, tenant_id, str(invoice_prefix or "INV"), case.branch_id
            ),
            subtotal_amount=subtotal,
            discount_amount=discount,
            taxable_amount=taxable,
            tax_amount=tax_amount,
            tax_rule_id=tax_rule.id if tax_rule else None,
            total_amount=total,
            balance_amount=total,
            doctor_share_amount=doctor_share,
            clinic_share_amount=clinic_share,
            fee_rule_id=first_fee_rule_id,
            created_by_user_id=payload.created_by_user_id or actor.id,
        )
        self.billing.add_invoice(invoice)
        try:
            self.session.commit()
        except IntegrityError:
            # A concurrent request already created the invoice for this case
            # between our check above and this insert; return that one instead.
            self.session.rollback()
            existing = self.billing.get_case_invoice(
                tenant_id=tenant_id, case_id=case.id
            )
            if existing:
                self._sync_case_status_from_invoice(case, existing)
                return self._invoice_detail(existing)
            raise
        self.session.refresh(invoice)
        for row in rows:
            self.billing.add_invoice_item(
                InvoiceItem(
                    tenant_id=tenant_id,
                    invoice_id=invoice.id,
                    item_type="physiotherapy",
                    description=f"Physiotherapy session {row.session_number}: {row.modality_type}",
                    quantity=1,
                    unit_amount=row.charge_amount,
                    total_amount=row.charge_amount,
                )
            )
        self.session.commit()
        self.session.refresh(invoice)
        self._sync_case_status_from_invoice(case, invoice)
        record_audit_event(
            self.session,
            tenant_id=tenant_id,
            branch_id=case.branch_id,
            actor_user_id=payload.created_by_user_id or actor.id,
            action="physiotherapy_invoice.generated",
            resource_type="invoice",
            resource_id=invoice.id,
            purpose="physiotherapy_billing",
            metadata_json=f'{{"physiotherapy_case_id":"{case.id}"}}',
        )
        return self._invoice_detail(invoice)
