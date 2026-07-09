from collections.abc import Callable

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.audit.service import diff_changes, record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem
from app.modules.billing.repositories import (
    BillingInvoiceSupportRepository,
    BillingReferenceRepository,
)
from app.modules.billing.schemas import (
    InvoiceDetailRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
)
from app.modules.identity.models import User

InvoiceDetailReader = Callable[[Session, Invoice], InvoiceDetailRead]


def _external_supplier_options(
    session: Session, item: InvoiceItem
) -> list[dict[str, int | str]]:
    options: dict[str, int] = {}

    def add_option(supplier_id: str | None, buying_price: int | None) -> None:
        supplier = str(supplier_id or "").strip()
        if not supplier:
            return
        options[supplier] = int(buying_price or options.get(supplier, 0) or 0)

    if item.item_type == "lab":
        catalog_rows = BillingReferenceRepository(
            session
        ).list_lab_catalog_supplier_options(
            tenant_id=item.tenant_id,
            item_code=item.external_item_code,
            name=item.description,
        )
        for row in catalog_rows:
            add_option(row.supplier_id, row.purchase_price)

    add_option(item.supplier_id, int(item.buying_amount or 0))
    if not options:
        return []

    supplier_names = BillingReferenceRepository(session).supplier_names(
        tenant_id=item.tenant_id,
        supplier_ids=list(options.keys()),
    )
    return [
        {
            "supplier": supplier_id,
            "supplier_name": supplier_names.get(supplier_id, supplier_id),
            "buying_price": buying_price,
        }
        for supplier_id, buying_price in sorted(
            options.items(), key=lambda row: supplier_names.get(row[0], row[0])
        )
    ]


def update_invoice_item_supplier(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    item_id: str,
    payload: InvoiceItemSupplierUpdate,
    current_user: User,
    read_invoice_detail: InvoiceDetailReader,
) -> InvoiceDetailRead:
    support_repo = BillingInvoiceSupportRepository(session)
    invoice = support_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if not invoice.lab_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier can be set only for lab invoices",
        )
    require_user_branch_access(current_user, invoice.branch_id)
    item = support_repo.get_invoice_item_for_invoice(
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        item_id=item_id,
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found"
        )
    options = _external_supplier_options(session, item)
    before = {"supplier_id": item.supplier_id, "buying_amount": item.buying_amount}
    if payload.supplier_id:
        selected = next(
            (
                supplier
                for supplier in options
                if supplier["supplier"] == payload.supplier_id
            ),
            None,
        )
        if not selected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid supplier"
            )
        item.buying_amount = int(selected["buying_price"] or 0)
    else:
        item.buying_amount = 0
    item.supplier_id = payload.supplier_id
    session.add(item)
    session.commit()
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice_item.supplier_updated",
        resource_type="invoice_item",
        resource_id=item.id,
        purpose="billing",
        changes=diff_changes(
            before,
            {"supplier_id": item.supplier_id, "buying_amount": item.buying_amount},
        ),
    )
    return read_invoice_detail(session, invoice)


def list_invoice_item_supplier_options(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    item_id: str,
    current_user: User,
) -> list[InvoiceItemSupplierOptionRead]:
    support_repo = BillingInvoiceSupportRepository(session)
    invoice = support_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    if not invoice.lab_order_id:
        return []
    require_user_branch_access(current_user, invoice.branch_id)
    item = support_repo.get_invoice_item_for_invoice(
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        item_id=item_id,
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found"
        )
    return [
        InvoiceItemSupplierOptionRead(**supplier)
        for supplier in _external_supplier_options(session, item)
    ]
