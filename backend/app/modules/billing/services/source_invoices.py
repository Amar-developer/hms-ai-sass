from collections.abc import Callable

from fastapi import HTTPException, status
from sqlmodel import Session, select

from sqlalchemy.exc import IntegrityError

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import record_audit_event
from app.modules.billing.models import ApprovalStatus, Invoice
from app.modules.billing.repositories.source_repository import BillingSourceRepository
from app.modules.billing.schemas import (
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
)
from app.modules.billing.services.consultation_invoice import (
    create_consultation_invoice,
    refresh_consultation_invoice,
)
from app.modules.billing.services.invoice_status import (
    update_invoice_payment_status,
)
from app.modules.billing.services.money import money_value
from app.modules.consultations.models import ConsultationStatus
from app.modules.consultations.repositories import (
    ConsultationBillingReferenceRepository,
)
from app.modules.identity.models import User
from app.modules.lab.models import LabOrderStatus, LabTestPackage
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import (
    queue_notification_if_allowed,
    queue_whatsapp_template_if_allowed,
    whatsapp_template_integration_enabled,
)
from app.modules.pharmacy.models import PharmacyIssueStatus

ServiceInvoiceCreator = Callable[..., Invoice]
InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]
InvoiceRefresher = Callable[[Session, Invoice], Invoice]
LedgerEnsurer = Callable[[Session, Invoice], None]


def _lab_order_item_invoice_line(item) -> dict[str, int | str | None]:
    return {
        "item_type": "lab",
        "description": item.test_name,
        "quantity": 1,
        "unit_amount": item.price,
        "total_amount": item.price,
        "mrp_amount": item.mrp_price,
        "selling_amount": item.selling_price or item.price,
        "buying_amount": item.buying_price,
        "supplier_id": item.supplier_id,
        "external_source": item.external_source,
        "external_slug": item.external_slug,
        "external_item_code": (
            item.test_id or item.package_id or item.external_item_code
        ),
    }


def _lab_invoice_line_items(
    session: Session, tenant_id: str, items: list
) -> list[dict[str, int | str | None]]:
    lines: list[dict[str, int | str | None]] = []
    added_package_ids: set[str] = set()
    # Resolve every referenced package up front instead of once per item.
    package_ids = {item.package_id for item in items if item.package_id}
    packages = (
        {
            row.id: row
            for row in session.exec(
                select(LabTestPackage).where(LabTestPackage.id.in_(package_ids))
            ).all()
        }
        if package_ids
        else {}
    )
    for item in items:
        if not item.package_id:
            lines.append(_lab_order_item_invoice_line(item))
            continue
        if item.package_id in added_package_ids:
            continue
        package = packages.get(item.package_id)
        if not package or package.tenant_id != tenant_id:
            continue
        added_package_ids.add(package.id)
        lines.append(
            {
                "item_type": "lab_service",
                "description": package.name,
                "quantity": 1,
                "unit_amount": package.package_price,
                "total_amount": package.package_price,
                "mrp_amount": package.mrp_price,
                "selling_amount": package.package_price,
                "buying_amount": package.purchase_price,
                "supplier_id": package.supplier_id,
                "external_source": "local",
                "external_slug": package.code,
                "external_item_code": package.id,
            }
        )
    return lines


def _sync_lab_order_item_catalog_prices(
    session: Session,
    tenant_id: str,
    order,
    items: list,
    source_repo: BillingSourceRepository,
) -> None:
    """Refresh lab order item MRP/selling metadata from the catalog."""
    from app.modules.lab.services.catalog import (
        _find_lab_test,
        _resolve_lab_price,
    )

    changed = False
    # One round-trip for every catalog test this order references, instead of
    # one per item inside the loop below.
    lab_tests = source_repo.lab_tests_by_ids(
        {item.test_id for item in items if not item.package_id and item.test_id}
    )
    for item in items:
        # Package/service components are operational tests included in the
        # package price. Keep their zero selling price instead of repricing
        # them as separately billable Lab Test catalog items.
        if item.package_id:
            continue
        old_price = int(item.price or 0)
        old_selling = int(item.selling_price or 0)
        old_mrp = int(item.mrp_price or 0)
        old_buying = int(item.buying_price or 0)
        old_supplier_id = item.supplier_id
        old_external_source = item.external_source
        old_external_slug = item.external_slug
        old_external_item_code = item.external_item_code

        test = lab_tests.get(item.test_id) if item.test_id else None
        if test is None:
            test = _find_lab_test(session, tenant_id, order.branch_id, item.test_name)
        pricing = _resolve_lab_price(test, item.test_name)
        new_price = int(pricing.get("price") or 0)
        new_mrp = int(pricing.get("mrp_price") or 0)
        new_selling = int(pricing.get("selling_price") or new_price or 0)
        new_buying = int(pricing.get("buying_price") or 0)

        if old_price <= 0 and new_price > 0:
            item.price = new_price
        if new_mrp > 0:
            item.mrp_price = new_mrp
        if new_selling > 0:
            item.selling_price = new_selling
        elif int(item.selling_price or 0) <= 0:
            item.selling_price = int(item.price or 0)
        if new_buying > 0:
            item.buying_price = new_buying
        if pricing.get("supplier_id"):
            item.supplier_id = str(pricing.get("supplier_id") or "")
        if pricing.get("external_source"):
            item.external_source = str(pricing.get("external_source"))
            item.external_slug = str(
                pricing.get("external_slug") or item.external_slug or ""
            )
            item.external_item_code = str(
                pricing.get("external_item_code") or item.external_item_code or ""
            )
        if (
            int(item.price or 0) != old_price
            or int(item.selling_price or 0) != old_selling
            or int(item.mrp_price or 0) != old_mrp
            or int(item.buying_price or 0) != old_buying
            or item.supplier_id != old_supplier_id
            or item.external_source != old_external_source
            or item.external_slug != old_external_slug
            or item.external_item_code != old_external_item_code
        ):
            session.add(item)
            changed = True
    if changed:
        if int(order.amount or 0) <= 0:
            order.amount = sum(int(item.price or 0) for item in items)
            session.add(order)
        session.commit()
        for item in items:
            session.refresh(item)


def create_invoice_from_lab_order_source(
    session: Session,
    *,
    tenant_id: str,
    payload: InvoiceCreateFromLabOrder,
    current_user: User,
    create_service_invoice: ServiceInvoiceCreator,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    source_repo = BillingSourceRepository(session)
    order = source_repo.get_lab_order_for_tenant(
        tenant_id=tenant_id,
        lab_order_id=payload.lab_order_id,
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab order"
        )
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled lab order cannot be invoiced",
        )
    require_user_branch_access(current_user, order.branch_id)
    items = source_repo.list_lab_order_items(
        tenant_id=tenant_id,
        lab_order_id=order.id,
    )
    existing = source_repo.get_lab_order_invoice(
        tenant_id=tenant_id,
        lab_order_id=order.id,
    )
    if existing:
        return read_invoice_detail(
            session, update_invoice_payment_status(session, existing)
        )
    _sync_lab_order_item_catalog_prices(session, tenant_id, order, items, source_repo)

    appointment_id = None
    if order.consultation_id:
        consultation = source_repo.get_consultation_for_tenant(
            tenant_id=tenant_id,
            consultation_id=order.consultation_id,
        )
        if consultation:
            appointment_id = consultation.appointment_id
    amount = int(order.amount or sum(item.price for item in items) or 0)
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Lab order amount is zero"
        )

    lab_benefit_amounts: dict[str, int] = {}
    for item in items:
        if item.test_id:
            lab_benefit_amounts[item.test_id] = lab_benefit_amounts.get(
                item.test_id, 0
            ) + int(item.price or 0)
    invoice = create_service_invoice(
        session,
        tenant_id=tenant_id,
        branch_id=order.branch_id,
        patient_id=order.patient_id,
        appointment_id=appointment_id,
        consultation_id=order.consultation_id,
        lab_order_id=order.id,
        item_type="lab",
        description=f"Lab order {order.id}: {order.tests}",
        amount=amount,
        service_scope="lab",
        tax_rule_id=payload.tax_rule_id,
        discount_offer_id=payload.discount_offer_id,
        benefit_item_ids=[item.test_id for item in items if item.test_id],
        benefit_item_amounts=lab_benefit_amounts,
        line_items=_lab_invoice_line_items(session, tenant_id, items) or None,
        created_by_user_id=payload.created_by_user_id,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="lab_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="lab_billing",
    )
    return read_invoice_detail(session, invoice)


def create_invoice_from_pharmacy_issue_source(
    session: Session,
    *,
    tenant_id: str,
    payload: InvoiceCreateFromPharmacyIssue,
    current_user: User,
    create_service_invoice: ServiceInvoiceCreator,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    source_repo = BillingSourceRepository(session)
    issue = source_repo.get_pharmacy_issue_for_tenant(
        tenant_id=tenant_id,
        pharmacy_issue_id=payload.pharmacy_issue_id,
    )
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pharmacy issue"
        )
    if issue.status == PharmacyIssueStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled pharmacy issue cannot be invoiced",
        )
    require_user_branch_access(current_user, issue.branch_id)
    items = source_repo.list_pharmacy_issue_items(
        tenant_id=tenant_id,
        pharmacy_issue_id=issue.id,
    )
    medicine_by_id = {
        medicine_id: medicine
        for medicine_id in {item.medicine_id for item in items if item.medicine_id}
        if (medicine := source_repo.get_medicine(medicine_id)) is not None
    }
    existing = source_repo.get_pharmacy_issue_invoice(
        tenant_id=tenant_id,
        pharmacy_issue_id=issue.id,
    )
    if existing:
        issue.billing_invoice_id = existing.id
        session.add(issue)
        session.commit()
        return read_invoice_detail(
            session, update_invoice_payment_status(session, existing)
        )

    appointment_id = None
    if issue.consultation_id:
        consultation = source_repo.get_consultation_for_tenant(
            tenant_id=tenant_id,
            consultation_id=issue.consultation_id,
        )
        if consultation:
            appointment_id = consultation.appointment_id
    amount = int(
        issue.amount or sum(item.quantity * item.unit_price for item in items) or 0
    )
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pharmacy issue amount is zero",
        )
    pharmacy_benefit_amounts: dict[str, int] = {}
    for item in items:
        if item.medicine_id:
            pharmacy_benefit_amounts[item.medicine_id] = pharmacy_benefit_amounts.get(
                item.medicine_id, 0
            ) + int(item.quantity * item.unit_price)

    def pharmacy_line_item(item) -> dict[str, int | str | None]:
        medicine = medicine_by_id.get(item.medicine_id or "")
        selling_amount = int(
            item.unit_price or (medicine.default_sale_price if medicine else 0) or 0
        )
        mrp_amount = int((medicine.mrp_price if medicine else 0) or selling_amount)
        buying_amount = int((medicine.purchase_price if medicine else 0) or 0)
        return {
            "item_type": "pharmacy",
            "description": item.medicine_name,
            "quantity": item.quantity,
            "unit_amount": selling_amount,
            "total_amount": item.quantity * selling_amount,
            "mrp_amount": mrp_amount,
            "selling_amount": selling_amount,
            "buying_amount": buying_amount,
            "supplier_id": medicine.supplier_id if medicine else None,
            "external_item_code": item.medicine_id,
        }

    invoice = create_service_invoice(
        session,
        tenant_id=tenant_id,
        branch_id=issue.branch_id,
        patient_id=issue.patient_id,
        appointment_id=appointment_id,
        consultation_id=issue.consultation_id,
        pharmacy_issue_id=issue.id,
        item_type="pharmacy",
        description=f"Pharmacy issue {issue.id}: {issue.medicine_text}",
        amount=amount,
        service_scope="pharmacy",
        tax_rule_id=payload.tax_rule_id,
        discount_offer_id=payload.discount_offer_id,
        benefit_item_ids=[item.medicine_id for item in items if item.medicine_id],
        benefit_item_amounts=pharmacy_benefit_amounts,
        line_items=[pharmacy_line_item(item) for item in items] or None,
        created_by_user_id=payload.created_by_user_id,
    )
    issue.billing_invoice_id = invoice.id
    session.add(issue)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="pharmacy_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="pharmacy_billing",
    )
    return read_invoice_detail(session, invoice)


def create_invoice_from_consultation_source(
    session: Session,
    *,
    tenant_id: str,
    payload: InvoiceCreateFromConsultation,
    current_user: User,
    read_invoice_detail: InvoiceDetailReader,
    ensure_invoice_submit_ledger: LedgerEnsurer,
) -> InvoiceDetailRead:
    source_repo = BillingSourceRepository(session)
    consultation = source_repo.get_consultation_for_tenant(
        tenant_id=tenant_id,
        consultation_id=payload.consultation_id,
    )
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation"
        )
    if consultation.status != ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice can be generated only after consultation is signed",
        )
    require_user_branch_access(current_user, consultation.branch_id)
    billing_refs = ConsultationBillingReferenceRepository(session)
    # Lock the consultation row so a concurrent generate-invoice request for the
    # same consultation (double-submit) serializes on this check-then-insert
    # instead of both passing the check; the unique index on
    # Invoice.consultation_id is the DB-level backstop below.
    billing_refs.lock_consultation(consultation.id)
    existing = source_repo.get_consultation_invoice(
        tenant_id=tenant_id,
        consultation_id=consultation.id,
    )
    if existing:
        return read_invoice_detail(
            session, refresh_consultation_invoice(session, existing)
        )
    approved_discount = money_value(payload.discount_amount)
    approval = None
    if payload.discount_approval_id:
        approval = source_repo.get_discount_approval(payload.discount_approval_id)
        if (
            not approval
            or approval.tenant_id != tenant_id
            or approval.branch_id != consultation.branch_id
            or approval.consultation_id != consultation.id
            or approval.status != ApprovalStatus.APPROVED
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Approved discount approval is required for invoice discount",
            )
        if approved_discount <= 0:
            approved_discount = money_value(approval.requested_amount)
    if approved_discount > 0 and (
        not approval or money_value(approval.requested_amount) < approved_discount
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved discount approval is required for invoice discount",
        )
    appointment = source_repo.get_appointment_for_tenant(
        tenant_id=tenant_id,
        appointment_id=consultation.appointment_id,
    )
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment"
        )

    try:
        invoice, _item = create_consultation_invoice(
            session,
            appointment=appointment,
            consultation_id=consultation.id,
            discount_amount=approved_discount,
            discount_approval_id=payload.discount_approval_id,
            discount_offer_id=payload.discount_offer_id,
            tax_rule_id=payload.tax_rule_id,
            created_by_user_id=payload.created_by_user_id,
            treatment_type=consultation.treatment_type,
        )
    except IntegrityError:
        # A concurrent request already created the invoice for this
        # consultation between our check above and this insert; the unique
        # index on Invoice.consultation_id caught it. Return that row instead
        # of erroring out.
        session.rollback()
        existing = source_repo.get_consultation_invoice(
            tenant_id=tenant_id,
            consultation_id=consultation.id,
        )
        if not existing:
            raise
        return read_invoice_detail(
            session, refresh_consultation_invoice(session, existing)
        )
    invoice = refresh_consultation_invoice(session, invoice)
    ensure_invoice_submit_ledger(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
    )
    patient = source_repo.get_patient(invoice.patient_id)
    if invoice.balance_amount > 0 and patient:
        queue_notification_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            provider=NotificationProvider.SMS,
            event_type=NotificationEventType.PAYMENT_REMINDER,
            recipient=patient.mobile,
            subject="Payment pending",
            message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
            resource_type="invoice",
            resource_id=invoice.id,
            queued_by_user_id=payload.created_by_user_id,
        )
        pending_template_event = queue_whatsapp_template_if_allowed(
            session,
            tenant_id=tenant_id,
            branch_id=invoice.branch_id,
            flow_key="payment_pending_patient",
            recipient=patient.mobile,
            resource_type="invoice",
            resource_id=invoice.id,
            dedupe_key=f"whatsapp:invoice:{invoice.id}:initial-pending",
            queued_by_user_id=payload.created_by_user_id,
        )
        if not pending_template_event and not whatsapp_template_integration_enabled(
            session, tenant_id
        ):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=NotificationProvider.WHATSAPP,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.created_by_user_id,
            )
    return read_invoice_detail(session, invoice)
