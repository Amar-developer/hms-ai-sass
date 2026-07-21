from fastapi import HTTPException, status
from sqlmodel import Session

from app.modules.audit.service import record_audit_event
from app.modules.billing.models import Invoice, InvoiceItem, InvoiceStatus
from app.modules.billing.schemas import InvoiceDetailRead, InvoiceItemRead, InvoiceRead
from app.modules.billing.services.numbering import next_invoice_number
from app.modules.identity.models import User
from app.modules.ip.models import IPAdmission, IPBillingItem, IPCharge
from app.modules.ip.repositories import IPBillingRepository, IPRoomRepository
from app.modules.ip.schemas import IPBillingItemCreate, IPChargeCreate
from app.modules.ip.services.pricing import lab_catalog_price, medicine_catalog_price
from app.modules.ip.services.validation import (
    admission_end_date,
    assert_ip_enabled,
    chargeable_days,
    ensure_admission_open,
    get_admission,
)
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import now_utc


def create_billing_item(
    session: Session,
    admission: IPAdmission,
    *,
    source_type: str,
    source_id: str | None,
    description: str,
    quantity: int,
    unit_amount: int,
    created_by_user_id: str | None,
) -> IPBillingItem:
    if source_id:
        existing = IPBillingRepository(session).get_existing_item(
            tenant_id=admission.tenant_id,
            admission_id=admission.id,
            source_type=source_type,
            source_id=source_id,
        )
        if existing:
            return existing
    item = IPBillingItem(
        tenant_id=admission.tenant_id,
        branch_id=admission.branch_id,
        admission_id=admission.id,
        source_type=source_type,
        source_id=source_id,
        description=description,
        quantity=quantity,
        unit_amount=unit_amount,
        total_amount=quantity * unit_amount,
        created_by_user_id=created_by_user_id,
    )
    session.add(item)
    return item


def ip_care_invoice_items(
    session: Session, admission: IPAdmission, billing_items: list[IPBillingItem]
) -> list[dict[str, int | str]]:
    existing_sources = {
        (item.source_type, item.source_id) for item in billing_items if item.source_id
    }
    existing_descriptions = {item.description for item in billing_items}
    rows: list[dict[str, int | str]] = []

    administrations = IPBillingRepository(
        session
    ).list_given_medication_administrations(
        tenant_id=admission.tenant_id,
        admission_id=admission.id,
    )
    for administration, order in administrations:
        if (
            administration.billing_item_id
            or ("medication_administration", administration.id) in existing_sources
        ):
            continue
        unit_amount = int(order.unit_amount or 0) or medicine_catalog_price(
            session, admission.tenant_id, order.medicine_name
        )
        if unit_amount <= 0:
            continue
        description = f"Medicine given - {order.medicine_name}{f' {order.dosage}' if order.dosage else ''}"
        rows.append(
            {
                "item_type": "ip_medication_administration",
                "description": description,
                "quantity": int(administration.quantity or 1),
                "unit_amount": unit_amount,
                "total_amount": int(administration.quantity or 1) * unit_amount,
            }
        )

    treatments = IPBillingRepository(session).list_treatments(
        tenant_id=admission.tenant_id,
        admission_id=admission.id,
    )
    for treatment in treatments:
        for line in (treatment.orders or "").splitlines():
            parts = [part.strip() for part in line.split("|")]
            if len(parts) < 2:
                continue
            source_type = parts[0] or "lab"
            item_name = parts[1]
            priority = parts[2] if len(parts) > 2 else ""
            instructions = parts[3] if len(parts) > 3 else ""
            amount_text = parts[4] if len(parts) > 4 else ""
            if not item_name:
                continue
            normalized_type = (
                "scan_referral" if source_type == "scan" else "lab_referral"
            )
            description = f"{source_type.upper()} - {item_name}{f' ({priority})' if priority else ''}{f' - {instructions}' if instructions else ''}"
            if description in existing_descriptions:
                continue
            amount = int(
                "".join(ch for ch in amount_text if ch.isdigit()) or 0
            ) or lab_catalog_price(session, admission.tenant_id, item_name)
            if amount <= 0:
                continue
            rows.append(
                {
                    "item_type": f"ip_{normalized_type}",
                    "description": description,
                    "quantity": 1,
                    "unit_amount": amount,
                    "total_amount": amount,
                }
            )
    return rows


def invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = IPBillingRepository(session).list_invoice_items(invoice)
    return InvoiceDetailRead(
        status=invoice.status,
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[
            InvoiceItemRead.model_validate(item, from_attributes=True) for item in items
        ],
        payments=[],
    )


def generate_ip_invoice_detail(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    current_user: User,
) -> tuple[InvoiceDetailRead, Invoice, bool]:
    billing_repo = IPBillingRepository(session)
    charges = billing_repo.list_charges(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
    billing_items = billing_repo.list_billing_items(
        tenant_id=tenant_id,
        admission_id=admission.id,
        status_filter="billable",
    )
    computed_care_items = ip_care_invoice_items(session, admission, billing_items)
    if computed_care_items:
        for item in computed_care_items:
            source_type = str(item["item_type"]).removeprefix("ip_")
            session.add(
                IPBillingItem(
                    tenant_id=tenant_id,
                    branch_id=admission.branch_id,
                    admission_id=admission.id,
                    source_type=source_type,
                    source_id=None,
                    description=str(item["description"]),
                    quantity=int(item["quantity"]),
                    unit_amount=int(item["unit_amount"]),
                    total_amount=int(item["total_amount"]),
                    created_by_user_id=current_user.id,
                )
            )
        session.flush()
        billing_items = billing_repo.list_billing_items(
            tenant_id=tenant_id,
            admission_id=admission.id,
            status_filter="billable",
        )
    existing = billing_repo.get_invoice_for_admission(
        tenant_id=tenant_id,
        admission_id=admission.id,
    )
    room_charge: tuple[str, int, int, int] | None = None
    if admission.room_id:
        room = IPRoomRepository(session).get_for_tenant(
            tenant_id=tenant_id,
            room_id=admission.room_id,
        )
        if room:
            bill_until = admission_end_date(session, admission)
            days = chargeable_days(admission.admission_date, bill_until)
            room_charge = (
                f"{room.ward_name} {room.room_number} Bed {room.bed_number} ({admission.admission_date} to {bill_until})",
                days,
                room.daily_rate,
                days * room.daily_rate,
            )
    subtotal = (
        sum(charge.total_amount for charge in charges)
        + sum(item.total_amount for item in billing_items)
        + (room_charge[3] if room_charge else 0)
    )
    if subtotal <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one IP charge, billable clinical event, or assign a chargeable room before generating invoice",
        )
    if existing:
        invoice = existing
        invoice.subtotal_amount = subtotal
        invoice.taxable_amount = subtotal
        invoice.total_amount = subtotal
        invoice.clinic_share_amount = subtotal
        invoice.balance_amount = max(subtotal - invoice.paid_amount, 0)
        if invoice.paid_amount >= subtotal and subtotal > 0:
            invoice.status = InvoiceStatus.PAID
        elif invoice.paid_amount > 0:
            invoice.status = InvoiceStatus.PARTIALLY_PAID
        else:
            invoice.status = InvoiceStatus.ISSUED
        invoice.updated_at = now_utc()
        billing_repo.delete_invoice_items(tenant_id=tenant_id, invoice_id=invoice.id)
    else:
        invoice_prefix, _scope, _scope_id = resolve_setting(
            session,
            tenant_id=tenant_id,
            module="invoice",
            key=SettingKey.INVOICE_PREFIX,
            branch_id=admission.branch_id,
        )
        invoice = Invoice(
            tenant_id=tenant_id,
            branch_id=admission.branch_id,
            patient_id=admission.patient_id,
            appointment_id=admission.source_appointment_id,
            ip_admission_id=admission.id,
            invoice_number=next_invoice_number(
                session, tenant_id, str(invoice_prefix or "INV"), admission.branch_id
            ),
            subtotal_amount=subtotal,
            taxable_amount=subtotal,
            total_amount=subtotal,
            balance_amount=subtotal,
            clinic_share_amount=subtotal,
            created_by_user_id=current_user.id,
        )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    if room_charge:
        description, quantity, unit_amount, total_amount = room_charge
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type="ip_room",
                description=description,
                quantity=quantity,
                unit_amount=unit_amount,
                total_amount=total_amount,
            )
        )
    for charge in charges:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=f"ip_{charge.charge_type}",
                description=charge.description,
                quantity=charge.quantity,
                unit_amount=charge.unit_amount,
                total_amount=charge.total_amount,
            )
        )
    for item in billing_items:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=f"ip_{item.source_type}",
                description=item.description,
                quantity=item.quantity,
                unit_amount=item.unit_amount,
                total_amount=item.total_amount,
            )
        )
    session.commit()
    session.refresh(invoice)
    return invoice_detail(session, invoice), invoice, bool(existing)


def generate_ip_invoice_with_audit(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    current_user: User,
) -> InvoiceDetailRead:
    detail, invoice, was_existing = generate_ip_invoice_detail(
        session,
        tenant_id=tenant_id,
        admission=admission,
        current_user=current_user,
    )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_invoice.refreshed" if was_existing else "ip_invoice.generated",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="ip_billing",
        metadata_json=f'{{"ip_admission_id":"{admission.id}","total_amount":{invoice.total_amount}}}',
    )
    return detail


def generate_ip_invoice_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    current_user: User,
) -> InvoiceDetailRead:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return generate_ip_invoice_with_audit(
        session,
        tenant_id=tenant_id,
        admission=admission,
        current_user=current_user,
    )


def create_charge_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPChargeCreate,
    current_user: User,
) -> IPCharge:
    charge = IPCharge.model_validate(
        payload,
        update={
            "tenant_id": tenant_id,
            "branch_id": admission.branch_id,
            "admission_id": admission.id,
            "total_amount": payload.quantity * payload.unit_amount,
            "created_by_user_id": current_user.id,
        },
    )
    session.add(charge)
    session.commit()
    session.refresh(charge)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_charge.created",
        resource_type="ip_charge",
        resource_id=charge.id,
        purpose="ip_billing",
    )
    return charge


def create_charge_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPChargeCreate,
    current_user: User,
) -> IPCharge:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_charge_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )


def create_billing_item_record(
    session: Session,
    *,
    tenant_id: str,
    admission: IPAdmission,
    payload: IPBillingItemCreate,
    current_user: User,
) -> IPBillingItem:
    item = create_billing_item(
        session,
        admission,
        source_type=payload.source_type,
        source_id=payload.source_id,
        description=payload.description,
        quantity=payload.quantity,
        unit_amount=payload.unit_amount,
        created_by_user_id=current_user.id,
    )
    item.status = payload.status
    session.add(item)
    session.commit()
    session.refresh(item)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=admission.branch_id,
        actor_user_id=current_user.id,
        action="ip_billing_item.created",
        resource_type="ip_billing_item",
        resource_id=item.id,
        purpose="ip_billing",
    )
    return item


def create_billing_item_by_admission_id(
    session: Session,
    *,
    tenant_id: str,
    admission_id: str,
    payload: IPBillingItemCreate,
    current_user: User,
) -> IPBillingItem:
    assert_ip_enabled(session, tenant_id)
    admission = get_admission(session, tenant_id, admission_id, current_user)
    ensure_admission_open(admission)
    return create_billing_item_record(
        session,
        tenant_id=tenant_id,
        admission=admission,
        payload=payload,
        current_user=current_user,
    )
