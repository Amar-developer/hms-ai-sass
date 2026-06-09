from datetime import date, datetime, timezone
from pathlib import Path
import re
import zlib

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.access_control import enforce_entitlement, require_branch_in_tenant, require_user_branch_access, scoped_branch_id
from app.core.auth import require_any_permission, require_permission
from app.core.config import get_settings
from app.core.database import get_session
from app.core.tenant_context import require_tenant_id
from app.modules.appointments.models import Appointment
from app.modules.audit.service import record_audit_event

from app.modules.billing.models import (
    DoctorFeeRule,
    CreditNote,
    DiscountApproval,
    DiscountOffer,
    ApprovalStatus,
    DoctorSettlement,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    Payment,
    PaymentStatus,
    SettlementStatus,
    TaxRule,
)
from app.modules.billing.schemas import (
    CancelInvoiceRequest,
    CreditNoteCreate,
    CreditNoteRead,
    DiscountApprovalCreate,
    DiscountApprovalDecision,
    DiscountApprovalRead,
    DiscountOfferCreate,
    DiscountOfferRead,
    DiscountOfferUpdate,
    DoctorFeeRuleCreate,
    DoctorFeeRuleRead,
    DoctorSettlementFinalize,
    DoctorSettlementRead,
    DoctorSettlementSummary,
    DueCollectionReport,
    InvoiceCreateFromConsultation,
    InvoiceCreateFromLabOrder,
    InvoiceCreateFromPharmacyIssue,
    InvoiceDetailRead,
    InvoiceItemRead,
    InvoiceItemSupplierOptionRead,
    InvoiceItemSupplierUpdate,
    InvoiceMembershipBenefitRead,
    InvoiceRead,
    PaymentCreate,
    PaymentRead,
    RevenueReport,
    RefundRequest,
    TaxRuleCreate,
    TaxRuleRead,
    TaxRuleUpdate,
)
from app.modules.billing.service import (
    calculate_offer_discount,
    create_consultation_invoice,
    find_tax_rule,
    next_credit_note_number,
    next_invoice_number,
    refresh_consultation_invoice,
    refundable_paid_total,
    update_invoice_payment_status,
)
from app.modules.consultations.models import Consultation, ConsultationStatus
from app.modules.identity import permissions
from app.modules.identity.models import User
from app.modules.integrations.frappe import FrappeCatalogClient
from app.modules.notifications.models import NotificationEventType, NotificationProvider
from app.modules.notifications.service import queue_notification_if_allowed
from app.modules.patient_subscriptions.models import PatientSubscriptionEnrollment
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.subscriptions.service import enforce_module_enabled
from app.modules.tenants.models import Tenant

router = APIRouter(prefix="/billing")


def _sync_physiotherapy_case_status(session: Session, invoice: Invoice) -> None:
    if not invoice.physiotherapy_case_id:
        return
    from app.modules.physiotherapy.models import PhysiotherapyCase
    from app.modules.tenants.models import now_utc

    case = session.get(PhysiotherapyCase, invoice.physiotherapy_case_id)
    if not case or case.tenant_id != invoice.tenant_id:
        return
    target_status = "paid" if invoice.balance_amount <= 0 and invoice.total_amount > 0 else "completed"
    if case.status == target_status:
        return
    case.status = target_status
    case.updated_at = now_utc()
    session.add(case)
    session.commit()


def _sync_home_care_booking_status(session: Session, invoice: Invoice) -> None:
    if not invoice.home_care_booking_id:
        return
    from app.modules.home_care.models import HomeCareBooking
    from app.modules.tenants.models import now_utc

    booking = session.get(HomeCareBooking, invoice.home_care_booking_id)
    if not booking or booking.tenant_id != invoice.tenant_id:
        return
    target_status = "paid" if invoice.balance_amount <= 0 and invoice.total_amount > 0 else "invoiced"
    if booking.status == target_status:
        return
    booking.status = target_status
    booking.updated_at = now_utc()
    session.add(booking)
    session.commit()


def _sync_patient_membership_payment(session: Session, invoice: Invoice) -> None:
    if not invoice.patient_subscription_enrollment_id:
        return
    enrollment = session.get(PatientSubscriptionEnrollment, invoice.patient_subscription_enrollment_id)
    if not enrollment or enrollment.tenant_id != invoice.tenant_id:
        return
    paid_amount = max(0, min(int(invoice.paid_amount or 0), int(invoice.total_amount or 0)))
    if enrollment.paid_amount == paid_amount:
        return
    enrollment.paid_amount = paid_amount
    enrollment.updated_at = datetime.now(timezone.utc)
    session.add(enrollment)
    session.commit()


def _frappe_catalog_client() -> FrappeCatalogClient:
    settings = get_settings()
    if not settings.maha_clinic_url or not settings.maha_clinic_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ERPNext catalog plugin is not configured")
    return FrappeCatalogClient(
        base_url=settings.maha_clinic_url,
        token=settings.maha_clinic_token,
        timeout_seconds=settings.maha_clinic_timeout_seconds,
    )


def _invoice_item_external_slug(item: InvoiceItem) -> str:
    if item.external_slug:
        return item.external_slug
    return re.sub(r"[^a-z0-9]+", "-", str(item.external_item_code or item.description or "").strip().lower()).strip("-")


def _external_supplier_options(item: InvoiceItem) -> list[dict[str, int | str]]:
    if item.external_source != "erpnext":
        return []
    detail = _frappe_catalog_client().get_lab_item_details(_invoice_item_external_slug(item))
    suppliers = detail.get("suppliers") if isinstance(detail, dict) else []
    if not isinstance(suppliers, list):
        return []
    return [
        {
            "supplier": str(supplier.get("supplier") or supplier.get("supplier_name") or ""),
            "supplier_name": str(supplier.get("supplier_name") or supplier.get("supplier") or ""),
            "buying_price": max(round(float(supplier.get("buying_price") or 0)), 0),
        }
        for supplier in suppliers
        if isinstance(supplier, dict) and (supplier.get("supplier") or supplier.get("supplier_name"))
    ]


def _invoice_membership_service(invoice: Invoice) -> str | None:
    if invoice.lab_order_id:
        return "lab"
    if invoice.pharmacy_issue_id:
        return "pharmacy"
    if invoice.consultation_id and not invoice.ip_admission_id and not invoice.physiotherapy_case_id and not invoice.home_care_booking_id:
        return "consultation"
    return None


def _invoice_membership_item_ids(session: Session, invoice: Invoice, service_type: str) -> list[str]:
    if service_type == "lab" and invoice.lab_order_id:
        from app.modules.lab.models import LabOrderItem

        return [
            item.test_id
            for item in session.exec(
                select(LabOrderItem).where(
                    LabOrderItem.tenant_id == invoice.tenant_id,
                    LabOrderItem.lab_order_id == invoice.lab_order_id,
                )
            ).all()
            if item.test_id
        ]
    if service_type == "pharmacy" and invoice.pharmacy_issue_id:
        from app.modules.pharmacy.models import PharmacyIssueItem

        return [
            item.medicine_id
            for item in session.exec(
                select(PharmacyIssueItem).where(
                    PharmacyIssueItem.tenant_id == invoice.tenant_id,
                    PharmacyIssueItem.pharmacy_issue_id == invoice.pharmacy_issue_id,
                )
            ).all()
            if item.medicine_id
        ]
    return []


def _invoice_membership_benefit(session: Session, invoice: Invoice) -> InvoiceMembershipBenefitRead | None:
    service_type = _invoice_membership_service(invoice)
    if not service_type:
        return None
    applied_amount = int(invoice.membership_discount_amount or 0)
    if applied_amount > 0:
        return InvoiceMembershipBenefitRead(
            has_active_subscription=True,
            is_applied=True,
            can_apply=False,
            service_type=service_type,
            plan_id=invoice.patient_subscription_plan_id,
            discount_amount=applied_amount,
            payable_amount=max(int(invoice.subtotal_amount or 0) - applied_amount, 0),
            reason="Membership benefit applied",
        )
    try:
        from app.modules.patient_subscriptions.service import active_patient_enrollment, benefit_preview
    except Exception:
        return None
    membership = active_patient_enrollment(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        patient_id=invoice.patient_id,
    )
    if not membership:
        return InvoiceMembershipBenefitRead(
            has_active_subscription=False,
            is_applied=False,
            can_apply=False,
            service_type=service_type,
            discount_amount=0,
            payable_amount=int(invoice.subtotal_amount or 0),
            reason="No active patient subscription",
        )
    enrollment, plan = membership
    preview = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type=service_type,
        item_ids=_invoice_membership_item_ids(session, invoice, service_type),
        subtotal_amount=int(invoice.subtotal_amount or 0),
    )
    discount_amount = int(preview["discount_amount"] or 0)
    return InvoiceMembershipBenefitRead(
        has_active_subscription=True,
        is_applied=False,
        can_apply=discount_amount > 0 and int(invoice.paid_amount or 0) <= 0,
        service_type=service_type,
        plan_id=preview.get("plan_id"),
        plan_name=preview.get("plan_name"),
        discount_amount=discount_amount,
        payable_amount=int(preview.get("payable_amount") or 0),
        reason=preview.get("reason"),
    )


def _apply_invoice_membership_benefit(session: Session, invoice: Invoice) -> Invoice:
    if int(invoice.membership_discount_amount or 0) > 0:
        return update_invoice_payment_status(session, invoice)
    if int(invoice.paid_amount or 0) > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot apply membership benefit after payment is recorded")
    service_type = _invoice_membership_service(invoice)
    if not service_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Membership benefit is not available for this invoice type")
    from app.modules.patient_subscriptions.service import active_patient_enrollment, benefit_preview

    membership = active_patient_enrollment(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        patient_id=invoice.patient_id,
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active patient membership found")
    enrollment, plan = membership
    preview = benefit_preview(
        plan=plan,
        enrollment=enrollment,
        service_type=service_type,
        item_ids=_invoice_membership_item_ids(session, invoice, service_type),
        subtotal_amount=int(invoice.subtotal_amount or 0),
    )
    membership_discount = int(preview["discount_amount"] or 0)
    if membership_discount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=preview.get("reason") or "No membership benefit available")
    offer_discount = max(int(invoice.discount_amount or 0) - int(invoice.membership_discount_amount or 0), 0)
    discount = min(offer_discount + membership_discount, int(invoice.subtotal_amount or 0))
    taxable = max(int(invoice.subtotal_amount or 0) - discount, 0)
    tax_rule = find_tax_rule(
        session,
        tenant_id=invoice.tenant_id,
        branch_id=invoice.branch_id,
        service_scope=service_type,
        tax_rule_id=invoice.tax_rule_id,
    )
    tax_amount = round(taxable * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total = taxable + tax_amount
    invoice.discount_amount = discount
    invoice.membership_discount_amount = membership_discount
    invoice.taxable_amount = taxable
    invoice.tax_amount = tax_amount
    invoice.total_amount = total
    invoice.balance_amount = max(total - int(invoice.paid_amount or 0), 0)
    invoice.clinic_share_amount = max(total - int(invoice.doctor_share_amount or 0), 0)
    invoice.patient_subscription_enrollment_id = enrollment.id
    invoice.patient_subscription_plan_id = plan.id
    if service_type == "consultation":
        enrollment.used_consultations += 1
        session.add(enrollment)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return update_invoice_payment_status(session, invoice)


def _pdf_text(value: object) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\n", " ")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def _money_pdf(value: object) -> str:
    return f"Rs. {int(value or 0):,}"


def _percent_pdf(amount: int, base: int) -> str:
    if amount <= 0 or base <= 0:
        return "0%"
    percent = amount * 100 / base
    return f"{percent:.1f}".rstrip("0").rstrip(".") + "%"


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        block_length = int.from_bytes(data[index + 2 : index + 4], "big")
        if marker in {0xC0, 0xC1, 0xC2} and index + 8 < len(data):
            height = int.from_bytes(data[index + 5 : index + 7], "big")
            width = int.from_bytes(data[index + 7 : index + 9], "big")
            return width, height
        index += 2 + block_length
    return None


def _png_logo_image(data: bytes) -> dict[str, object] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    offset = 8
    width = height = color_type = bit_depth = interlace = None
    compressed = bytearray()
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            width = int.from_bytes(chunk_data[0:4], "big")
            height = int.from_bytes(chunk_data[4:8], "big")
            bit_depth = chunk_data[8]
            color_type = chunk_data[9]
            interlace = chunk_data[12]
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if not width or not height or bit_depth != 8 or color_type not in {2, 6} or interlace != 0:
        return None
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    try:
        raw = zlib.decompress(bytes(compressed))
    except zlib.error:
        return None
    previous = [0] * stride
    rows: list[bytes] = []
    index = 0
    for _row in range(height):
        if index >= len(raw):
            return None
        filter_type = raw[index]
        index += 1
        scan = list(raw[index : index + stride])
        index += stride
        for i, value in enumerate(scan):
            left = scan[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            if filter_type == 1:
                scan[i] = (value + left) & 0xFF
            elif filter_type == 2:
                scan[i] = (value + up) & 0xFF
            elif filter_type == 3:
                scan[i] = (value + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                scan[i] = (value + predictor) & 0xFF
            elif filter_type != 0:
                return None
        previous = scan
        if channels == 4:
            composited = bytearray()
            for pixel in range(0, len(scan), 4):
                alpha = scan[pixel + 3]
                for channel in scan[pixel : pixel + 3]:
                    composited.append((channel * alpha + 255 * (255 - alpha)) // 255)
            rows.append(bytes(composited))
        else:
            rows.append(bytes(scan))
    image_data = zlib.compress(b"".join(rows))
    return {"data": image_data, "width": width, "height": height, "filter": "FlateDecode"}


def _local_logo_image(logo_url: str | None) -> dict[str, object] | None:
    if not logo_url:
        return None
    path: Path | None = None
    if logo_url.startswith("/uploads/"):
        path = Path("uploads") / Path(logo_url).name
    elif logo_url.startswith("uploads/"):
        path = Path(logo_url)
    if not path or not path.exists():
        return None
    data = path.read_bytes()
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        size = _jpeg_size(data)
        if not size:
            return None
        return {"data": data, "width": size[0], "height": size[1], "filter": "DCTDecode"}
    if path.suffix.lower() == ".png":
        return _png_logo_image(data)
    return None


def _build_receipt_pdf(
    *,
    tenant: Tenant | None,
    patient: Patient | None,
    invoice: Invoice,
    items: list[InvoiceItem],
    payments: list[Payment],
    logo_url: str | None,
) -> bytes:
    width, height = 595, 842
    ops: list[str] = []
    logo = _local_logo_image((tenant.logo_url if tenant else "") or logo_url)

    def color(stroke="0.86 0.90 0.95", fill: str | None = None) -> None:
        ops.append(f"{stroke} RG")
        if fill:
            ops.append(f"{fill} rg")

    def rect(x: int, y: int, w: int, h: int, fill: bool = False) -> None:
        ops.append(f"{x} {y} {w} {h} re {'B' if fill else 'S'}")

    def line(x1: int, y1: int, x2: int, y2: int, stroke: str = "0.20 0.20 0.20") -> None:
        ops.append(f"{stroke} RG {x1} {y1} m {x2} {y2} l S")

    def text(
        x: int,
        y: int,
        value: object,
        size: int = 10,
        bold: bool = False,
        align: str = "left",
        fill: str = "0.02 0.03 0.08",
    ) -> None:
        value = _pdf_text(value)
        if align == "right":
            x -= int(len(value) * size * 0.48)
        font = "F2" if bold else "F1"
        ops.append(f"{fill} rg BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({value}) Tj ET")

    def wrap_text(value: object, max_chars: int) -> list[str]:
        words = str(value or "").split()
        lines: list[str] = []
        current = ""
        for word in words:
            next_value = f"{current} {word}".strip()
            if len(next_value) > max_chars and current:
                lines.append(current)
                current = word
            else:
                current = next_value
        if current:
            lines.append(current)
        return lines or [""]

    tenant_name = tenant.name if tenant else "MedizinHub"
    patient_name = getattr(patient, "full_name", None) or getattr(patient, "name", None) or "Patient"
    color(stroke="1 1 1", fill="1 1 1")
    rect(0, 0, width, height, True)
    if logo:
        image_w = 92
        image_h = max(34, int(image_w * int(logo["height"]) / int(logo["width"])))
        ops.append(f"q {image_w} 0 0 {image_h} 45 704 cm /Logo Do Q")
    else:
        text(45, 742, tenant_name, 22, True, fill="0.00 0.48 0.62")
    text(535, 742, "Invoice", 21, True, "right", fill="0.80 0.00 0.00")
    text(45, 665, "Order Status:", 11)
    text(122, 665, "Completed", 11, True, fill="0.00 0.50 0.00")
    text(535, 665, f"INVOICE #{invoice.invoice_number}", 11, False, "right")
    text(535, 638, f"ORDER #{invoice.invoice_number}", 11, False, "right")
    text(535, 611, invoice.created_at.strftime("%B %d %Y"), 11, False, "right")

    y = 535
    headers = [("Product Name", 45), ("SKU", 255), ("Price", 352), ("Qty Invoiced", 430), ("Subtotal", 535)]
    for label, x in headers:
        text(x, y, label, 10, False, "right" if label == "Subtotal" else "left", fill="0.32 0.32 0.36")
    line(45, y - 16, 535, y - 16)

    y -= 42
    for item in items[:8]:
        for offset, line_value in enumerate(wrap_text(item.description, 28)[:2]):
            text(45, y - offset * 13, line_value, 11)
        text(255, y, item.item_type.replace("_", " ").title(), 9)
        text(352, y, _money_pdf(item.unit_amount), 10)
        text(430, y, item.quantity, 10)
        text(535, y, _money_pdf(item.total_amount), 10, False, "right")
        y -= 30

    if len(items) > 8:
        text(45, y, f"+ {len(items) - 8} more item(s)", 10, True)
        y -= 26

    line(45, y + 8, 535, y + 8)
    subtotal = int(invoice.subtotal_amount or 0)
    membership = int(invoice.membership_discount_amount or 0)
    offer = max(int(invoice.discount_amount or 0) - membership, 0)
    tax = int(invoice.tax_amount or 0)
    summary_rows = [("Subtotal", _money_pdf(subtotal), False)]
    if offer > 0:
        summary_rows.append((f"Offer Discount ({_percent_pdf(offer, subtotal)})", f"-{_money_pdf(offer)}", False))
    if membership > 0:
        summary_rows.append((f"Membership Benefit ({_percent_pdf(membership, subtotal)})", f"-{_money_pdf(membership)}", False))
    summary_rows.extend(
        [
            ("Tax", _money_pdf(tax), False),
            ("Grand Total (Incl.Tax)", _money_pdf(invoice.total_amount), True),
            ("Paid Amount", _money_pdf(invoice.paid_amount), False),
            ("Balance Due", _money_pdf(invoice.balance_amount), True),
        ]
    )
    y -= 18
    for label, value, note in summary_rows:
        text(455, y, label, 10, bool(note), "right")
        text(535, y, value, 10, bool(note), "right")
        y -= 28

    method = payments[-1].method.value.replace("_", " ").title() if payments else "-"
    detail_y = max(155, y - 44)
    text(45, detail_y, "Billing Details :", 13, True)
    text(45, detail_y - 28, patient_name, 11)
    if patient and patient.mobile:
        text(45, detail_y - 56, f"Phone : {patient.mobile}", 10)
    text(340, detail_y, "Payment Method:", 13, True)
    text(340, detail_y - 28, method, 11)
    text(45, 55, "Have a nice day...", 10)

    content = "\n".join(ops).encode("latin-1", "replace")
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    ]
    resources = b"/Font << /F1 4 0 R /F2 5 0 R >>"
    image_object_id = None
    if logo:
        image_object_id = 6
        resources += b" /XObject << /Logo 6 0 R >>"
    objects.append(
        f"<< /Type /Page /Parent 2 0 R /Resources << {resources.decode()} >> /MediaBox [0 0 {width} {height}] /Contents {'7' if logo else '6'} 0 R >>".encode()
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    if logo and image_object_id:
        logo_data = bytes(logo["data"])
        logo_filter = str(logo.get("filter") or "DCTDecode")
        objects.append(
            f"<< /Type /XObject /Subtype /Image /Width {logo['width']} /Height {logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /{logo_filter} /Length {len(logo_data)} >>\nstream\n".encode()
            + logo_data
            + b"\nendstream"
        )
    objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    startxref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{startxref}\n%%EOF".encode())
    return bytes(pdf)


def _read_invoice_detail(session: Session, invoice: Invoice) -> InvoiceDetailRead:
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id)
            .order_by(Payment.collected_at)
        ).all()
    )
    return InvoiceDetailRead(
        invoice=InvoiceRead.model_validate(invoice, from_attributes=True),
        items=[InvoiceItemRead.model_validate(item, from_attributes=True) for item in items],
        payments=[PaymentRead.model_validate(payment, from_attributes=True) for payment in payments],
        membership_benefit=_invoice_membership_benefit(session, invoice),
    )


def _create_service_invoice(
    session: Session,
    *,
    tenant_id: str,
    branch_id: str,
    patient_id: str,
    appointment_id: str | None,
    consultation_id: str | None,
    lab_order_id: str | None = None,
    pharmacy_issue_id: str | None = None,
    item_type: str,
    description: str,
    amount: int,
    created_by_user_id: str | None,
    line_items: list[dict[str, int | str | None]] | None = None,
    service_scope: str,
    tax_rule_id: str | None = None,
    discount_offer_id: str | None = None,
    benefit_item_ids: list[str] | None = None,
) -> Invoice:
    discount_amount, offer = calculate_offer_discount(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        service_scope=service_scope,
        subtotal=amount,
        discount_offer_id=discount_offer_id,
    )
    taxable_amount = amount - discount_amount
    tax_rule = find_tax_rule(
        session,
        tenant_id=tenant_id,
        branch_id=branch_id,
        service_scope=service_scope,
        tax_rule_id=tax_rule_id,
    )
    membership = None
    membership_discount = 0
    membership_enrollment_id = None
    membership_plan_id = None
    try:
        from app.modules.patient_subscriptions.service import active_patient_enrollment, benefit_preview

        membership = active_patient_enrollment(
            session,
            tenant_id=tenant_id,
            branch_id=branch_id,
            patient_id=patient_id,
        )
        if membership:
            enrollment, plan = membership
            preview = benefit_preview(
                plan=plan,
                enrollment=enrollment,
                service_type=service_scope,
                item_ids=benefit_item_ids or [],
                subtotal_amount=amount,
            )
            membership_discount = int(preview["discount_amount"] or 0)
            if membership_discount > 0:
                membership_enrollment_id = enrollment.id
                membership_plan_id = plan.id
            discount_amount = min(discount_amount + membership_discount, amount)
            taxable_amount = amount - discount_amount
            tax_amount = round(taxable_amount * (tax_rule.tax_percentage if tax_rule else 0) / 100)
            total_amount = taxable_amount + tax_amount
    except Exception:
        membership = None
    tax_amount = round(taxable_amount * (tax_rule.tax_percentage if tax_rule else 0) / 100)
    total_amount = taxable_amount + tax_amount
    invoice = Invoice(
        tenant_id=tenant_id,
        branch_id=branch_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        consultation_id=consultation_id,
        lab_order_id=lab_order_id,
        pharmacy_issue_id=pharmacy_issue_id,
        invoice_number=next_invoice_number(session, tenant_id, branch_id=branch_id),
        subtotal_amount=amount,
        discount_amount=discount_amount,
        membership_discount_amount=membership_discount,
        taxable_amount=taxable_amount,
        tax_amount=tax_amount,
        tax_rule_id=tax_rule.id if tax_rule else None,
        total_amount=total_amount,
        balance_amount=total_amount,
        doctor_share_amount=0,
        clinic_share_amount=total_amount,
        discount_offer_id=offer.id if offer else None,
        patient_subscription_enrollment_id=membership_enrollment_id,
        patient_subscription_plan_id=membership_plan_id,
        created_by_user_id=created_by_user_id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    rows = line_items or [
        {
            "item_type": item_type,
            "description": description,
            "quantity": 1,
            "unit_amount": amount,
            "total_amount": amount,
        }
    ]
    for row in rows:
        session.add(
            InvoiceItem(
                tenant_id=tenant_id,
                invoice_id=invoice.id,
                item_type=str(row.get("item_type") or item_type),
                description=str(row.get("description") or description),
                quantity=int(row.get("quantity") or 1),
                unit_amount=int(row.get("unit_amount") or 0),
                total_amount=int(row.get("total_amount") or 0),
                mrp_amount=int(row.get("mrp_amount") or 0),
                selling_amount=int(row.get("selling_amount") or row.get("unit_amount") or 0),
                buying_amount=int(row.get("buying_amount") or 0),
                supplier_id=str(row.get("supplier_id") or "") or None,
                external_source=str(row.get("external_source") or "") or None,
                external_slug=str(row.get("external_slug") or "") or None,
                external_item_code=str(row.get("external_item_code") or "") or None,
            )
        )
    session.commit()
    session.refresh(invoice)
    return invoice


@router.post(
    "/doctor-fee-rules",
    response_model=DoctorFeeRuleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_doctor_fee_rule(
    payload: DoctorFeeRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_CREATE,
            permissions.PRACTITIONERS_EDIT,
        )
    ),
) -> DoctorFeeRule:
    enforce_entitlement(session, tenant_id, "billing_basic", current_user=current_user)
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    if payload.share_type.value == "percentage" and payload.doctor_share_percentage is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_share_percentage is required for percentage share",
        )
    if payload.share_type.value == "fixed" and payload.doctor_fixed_amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doctor_fixed_amount is required for fixed share",
        )
    existing_rules = session.exec(
        select(DoctorFeeRule).where(
            DoctorFeeRule.tenant_id == tenant_id,
            DoctorFeeRule.branch_id == payload.branch_id,
            DoctorFeeRule.department_id == payload.department_id,
            DoctorFeeRule.practitioner_id == payload.practitioner_id,
            DoctorFeeRule.appointment_type == payload.appointment_type,
            DoctorFeeRule.treatment_type == payload.treatment_type,
            DoctorFeeRule.is_active == True,  # noqa: E712
        )
    ).all()
    for existing in existing_rules:
        existing.is_active = False
        session.add(existing)

    rule = DoctorFeeRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        action="doctor_fee_rule.created",
        resource_type="doctor_fee_rule",
        resource_id=rule.id,
        purpose="billing_configuration",
    )
    return rule


@router.get("/doctor-fee-rules", response_model=list[DoctorFeeRuleRead])
def list_doctor_fee_rules(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(
        require_any_permission(
            permissions.BILLING_MANAGE,
            permissions.PRACTITIONERS_MANAGE,
            permissions.PRACTITIONERS_READ,
            permissions.PRACTITIONERS_EDIT,
            permissions.PHYSIOTHERAPY_READ,
            permissions.PHYSIOTHERAPY_EDIT,
        )
    ),
) -> list[DoctorFeeRule]:
    enforce_entitlement(session, tenant_id, "billing_basic", current_user=current_user)
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(DoctorFeeRule).where(DoctorFeeRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(DoctorFeeRule.branch_id == branch_id)
    return list(
        session.exec(
            statement.order_by(DoctorFeeRule.created_at)
        ).all()
    )


@router.post("/tax-rules", response_model=TaxRuleRead, status_code=status.HTTP_201_CREATED)
def create_tax_rule(
    payload: TaxRuleCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.TAX_MANAGE, permissions.TAX_CREATE, permissions.BILLING_MANAGE)),
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    rule = TaxRule.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="tax_rule.created",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
    )
    return rule


@router.get("/tax-rules", response_model=list[TaxRuleRead])
def list_tax_rules(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.TAX_MANAGE, permissions.TAX_READ, permissions.BILLING_MANAGE)),
) -> list[TaxRule]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(TaxRule).where(TaxRule.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(TaxRule.branch_id == branch_id)
    return list(session.exec(statement.order_by(TaxRule.created_at.desc())).all())


@router.patch("/tax-rules/{rule_id}", response_model=TaxRuleRead)
def update_tax_rule(
    rule_id: str,
    payload: TaxRuleUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.TAX_MANAGE, permissions.TAX_EDIT, permissions.BILLING_MANAGE)),
) -> TaxRule:
    enforce_entitlement(session, tenant_id, "billing_basic")
    rule = session.get(TaxRule, rule_id)
    if not rule or rule.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax rule not found")
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id or rule.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=rule.branch_id,
        actor_user_id=current_user.id,
        action="tax_rule.updated",
        resource_type="tax_rule",
        resource_id=rule.id,
        purpose="billing_tax_configuration",
    )
    return rule


@router.post("/discount-offers", response_model=DiscountOfferRead, status_code=status.HTTP_201_CREATED)
def create_discount_offer(
    payload: DiscountOfferCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.DISCOUNTS_MANAGE, permissions.DISCOUNTS_CREATE, permissions.BILLING_MANAGE)),
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    offer = DiscountOffer.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="discount_offer.created",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
    )
    return offer


@router.get("/discount-offers", response_model=list[DiscountOfferRead])
def list_discount_offers(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.DISCOUNTS_MANAGE, permissions.DISCOUNTS_READ, permissions.BILLING_MANAGE)),
) -> list[DiscountOffer]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(DiscountOffer).where(DiscountOffer.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where((DiscountOffer.branch_id == branch_id) | (DiscountOffer.branch_id.is_(None)))
    return list(session.exec(statement.order_by(DiscountOffer.created_at.desc())).all())


@router.patch("/discount-offers/{offer_id}", response_model=DiscountOfferRead)
def update_discount_offer(
    offer_id: str,
    payload: DiscountOfferUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.DISCOUNTS_MANAGE, permissions.DISCOUNTS_EDIT, permissions.BILLING_MANAGE)),
) -> DiscountOffer:
    enforce_entitlement(session, tenant_id, "billing_basic")
    offer = session.get(DiscountOffer, offer_id)
    if not offer or offer.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount offer not found")
    if payload.branch_id:
        require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id or offer.branch_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(offer, key, value)
    session.add(offer)
    session.commit()
    session.refresh(offer)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=offer.branch_id,
        actor_user_id=current_user.id,
        action="discount_offer.updated",
        resource_type="discount_offer",
        resource_id=offer.id,
        purpose="discount_offer_configuration",
    )
    return offer


@router.post("/discount-approvals", response_model=DiscountApprovalRead, status_code=status.HTTP_201_CREATED)
def request_discount_approval(
    payload: DiscountApprovalCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    enforce_entitlement(session, tenant_id, "billing_basic")
    require_branch_in_tenant(session, tenant_id, payload.branch_id)
    require_user_branch_access(current_user, payload.branch_id)
    approval = DiscountApproval.model_validate(payload, update={"tenant_id": tenant_id})
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.requested_by_user_id,
        action="discount_approval.requested",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
    )
    return approval


@router.post("/discount-approvals/{approval_id}/decision", response_model=DiscountApprovalRead)
def decide_discount_approval(
    approval_id: str,
    payload: DiscountApprovalDecision,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DiscountApproval:
    approval = session.get(DiscountApproval, approval_id)
    if not approval or approval.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Discount approval not found")
    require_user_branch_access(current_user, approval.branch_id)
    approval.status = payload.status
    approval.approved_by_user_id = payload.approved_by_user_id
    approval.decided_at = datetime.now(timezone.utc)
    session.add(approval)
    session.commit()
    session.refresh(approval)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=approval.branch_id,
        actor_user_id=payload.approved_by_user_id,
        action=f"discount_approval.{payload.status.value}",
        resource_type="discount_approval",
        resource_id=approval.id,
        purpose="discount_control",
    )
    return approval


@router.post(
    "/invoices/from-consultation",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def create_invoice_from_consultation(
    payload: InvoiceCreateFromConsultation,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    consultation = session.get(Consultation, payload.consultation_id)
    if not consultation or consultation.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid consultation")
    if consultation.status != ConsultationStatus.SIGNED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice can be generated only after consultation is signed",
        )
    require_user_branch_access(current_user, consultation.branch_id)
    existing = session.exec(
        select(Invoice).where(
            Invoice.tenant_id == tenant_id,
            Invoice.consultation_id == consultation.id,
            Invoice.lab_order_id.is_(None),
            Invoice.pharmacy_issue_id.is_(None),
            Invoice.ip_admission_id.is_(None),
            Invoice.physiotherapy_case_id.is_(None),
        )
    ).first()
    if existing:
        return _read_invoice_detail(session, refresh_consultation_invoice(session, existing))
    if payload.discount_amount > 0:
        approval = session.get(DiscountApproval, payload.discount_approval_id) if payload.discount_approval_id else None
        if (
            not approval
            or approval.tenant_id != tenant_id
            or approval.branch_id != consultation.branch_id
            or approval.status != ApprovalStatus.APPROVED
            or approval.requested_amount < payload.discount_amount
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Approved discount approval is required for invoice discount",
            )

    appointment = session.get(Appointment, consultation.appointment_id)
    if not appointment or appointment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid appointment")

    invoice, _item = create_consultation_invoice(
        session,
        appointment=appointment,
        consultation_id=consultation.id,
        discount_amount=payload.discount_amount,
        discount_approval_id=payload.discount_approval_id,
        discount_offer_id=payload.discount_offer_id,
        tax_rule_id=payload.tax_rule_id,
        created_by_user_id=payload.created_by_user_id,
        treatment_type=consultation.treatment_type,
    )
    invoice = refresh_consultation_invoice(session, invoice)
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
    patient = session.get(Patient, invoice.patient_id)
    if invoice.balance_amount > 0 and patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=provider,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.created_by_user_id,
            )
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/from-lab-order", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def create_invoice_from_lab_order(
    payload: InvoiceCreateFromLabOrder,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    from app.modules.lab.models import LabOrder, LabOrderItem, LabOrderStatus

    order = session.get(LabOrder, payload.lab_order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lab order")
    if order.status == LabOrderStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cancelled lab order cannot be invoiced")
    require_user_branch_access(current_user, order.branch_id)
    existing = session.exec(
        select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.lab_order_id == order.id)
    ).first()
    if existing:
        return _read_invoice_detail(session, update_invoice_payment_status(session, existing))

    appointment_id = None
    if order.consultation_id:
        consultation = session.get(Consultation, order.consultation_id)
        if consultation and consultation.tenant_id == tenant_id:
            appointment_id = consultation.appointment_id
    items = list(
        session.exec(
            select(LabOrderItem).where(LabOrderItem.tenant_id == tenant_id, LabOrderItem.lab_order_id == order.id)
        ).all()
    )
    amount = int(order.amount or sum(item.price for item in items) or 0)
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lab order amount is zero")

    def lab_line_item(item: LabOrderItem) -> dict[str, int | str | None]:
        supplier_id = item.supplier_id
        buying_amount = item.buying_price
        if item.external_source == "erpnext" and item.external_slug:
            try:
                suppliers = _external_supplier_options(
                    InvoiceItem(
                        tenant_id=tenant_id,
                        invoice_id="preview",
                        item_type="lab",
                        description=item.test_name,
                        quantity=1,
                        unit_amount=item.price,
                        total_amount=item.price,
                        external_source=item.external_source,
                        external_slug=item.external_slug,
                        external_item_code=item.external_item_code,
                    )
                )
                if suppliers:
                    supplier_id = str(suppliers[0]["supplier"] or "")
                    buying_amount = int(suppliers[0]["buying_price"] or 0)
            except HTTPException:
                pass
        return {
            "item_type": "lab",
            "description": item.test_name,
            "quantity": 1,
            "unit_amount": item.price,
            "total_amount": item.price,
            "mrp_amount": item.mrp_price,
            "selling_amount": item.selling_price or item.price,
            "buying_amount": buying_amount,
            "supplier_id": supplier_id,
            "external_source": item.external_source,
            "external_slug": item.external_slug,
            "external_item_code": item.external_item_code,
        }

    invoice = _create_service_invoice(
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
        line_items=[lab_line_item(item) for item in items] or None,
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
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/from-pharmacy-issue", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
def create_invoice_from_pharmacy_issue(
    payload: InvoiceCreateFromPharmacyIssue,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_module_enabled(session, tenant_id, "billing_basic")
    from app.modules.pharmacy.models import PharmacyIssue, PharmacyIssueItem, PharmacyIssueStatus

    issue = session.get(PharmacyIssue, payload.pharmacy_issue_id)
    if not issue or issue.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pharmacy issue")
    if issue.status == PharmacyIssueStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cancelled pharmacy issue cannot be invoiced")
    require_user_branch_access(current_user, issue.branch_id)
    existing = session.exec(
        select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.pharmacy_issue_id == issue.id)
    ).first()
    if existing:
        issue.billing_invoice_id = existing.id
        session.add(issue)
        session.commit()
        return _read_invoice_detail(session, update_invoice_payment_status(session, existing))

    appointment_id = None
    if issue.consultation_id:
        consultation = session.get(Consultation, issue.consultation_id)
        if consultation and consultation.tenant_id == tenant_id:
            appointment_id = consultation.appointment_id
    items = list(
        session.exec(
            select(PharmacyIssueItem).where(
                PharmacyIssueItem.tenant_id == tenant_id,
                PharmacyIssueItem.pharmacy_issue_id == issue.id,
            )
        ).all()
    )
    amount = int(issue.amount or sum(item.quantity * item.unit_price for item in items) or 0)
    if amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pharmacy issue amount is zero")
    invoice = _create_service_invoice(
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
        line_items=[
            {
                "item_type": "pharmacy",
                "description": item.medicine_name,
                "quantity": item.quantity,
                "unit_amount": item.unit_price,
                "total_amount": item.quantity * item.unit_price,
            }
            for item in items
        ] or None,
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
    return _read_invoice_detail(session, invoice)


@router.get("/invoices", response_model=list[InvoiceRead])
def list_invoices(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    patient_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_any_permission(permissions.BILLING_MANAGE, permissions.INVOICES_READ, permissions.PATIENT_SUBSCRIPTIONS_READ, permissions.PATIENT_SUBSCRIPTIONS_MANAGE)),
) -> list[Invoice]:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id)
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if patient_id:
        statement = statement.where(Invoice.patient_id == patient_id)
    return list(session.exec(statement.order_by(Invoice.created_at.desc())).all())


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
def get_invoice(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    return _read_invoice_detail(session, invoice)


@router.patch("/invoices/{invoice_id}/items/{item_id}/supplier", response_model=InvoiceDetailRead)
def update_invoice_item_supplier(
    invoice_id: str,
    item_id: str,
    payload: InvoiceItemSupplierUpdate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if not invoice.lab_order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Supplier can be set only for lab invoices")
    require_user_branch_access(current_user, invoice.branch_id)
    item = session.get(InvoiceItem, item_id)
    if not item or item.tenant_id != tenant_id or item.invoice_id != invoice.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found")
    options = _external_supplier_options(item)
    if payload.supplier_id:
        selected = next((supplier for supplier in options if supplier["supplier"] == payload.supplier_id), None)
        if not selected:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid supplier")
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
    )
    return _read_invoice_detail(session, invoice)


@router.get("/invoices/{invoice_id}/items/{item_id}/supplier-options", response_model=list[InvoiceItemSupplierOptionRead])
def list_invoice_item_supplier_options(
    invoice_id: str,
    item_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> list[InvoiceItemSupplierOptionRead]:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if not invoice.lab_order_id:
        return []
    require_user_branch_access(current_user, invoice.branch_id)
    item = session.get(InvoiceItem, item_id)
    if not item or item.tenant_id != tenant_id or item.invoice_id != invoice.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice item not found")
    return [InvoiceItemSupplierOptionRead(**supplier) for supplier in _external_supplier_options(item)]


@router.post("/invoices/{invoice_id}/membership-benefit/apply", response_model=InvoiceDetailRead)
def apply_invoice_membership_benefit(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    invoice = _apply_invoice_membership_benefit(session, invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=current_user.id,
        action="invoice.membership_benefit_applied",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing",
    )
    return _read_invoice_detail(session, invoice)


@router.get("/invoices/{invoice_id}/receipt.pdf")
def invoice_receipt_pdf(
    invoice_id: str,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> Response:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    tenant = session.get(Tenant, tenant_id)
    patient = session.get(Patient, invoice.patient_id)
    items = list(
        session.exec(
            select(InvoiceItem)
            .where(InvoiceItem.tenant_id == invoice.tenant_id, InvoiceItem.invoice_id == invoice.id)
            .order_by(InvoiceItem.created_at)
        ).all()
    )
    payments = list(
        session.exec(
            select(Payment)
            .where(Payment.tenant_id == invoice.tenant_id, Payment.invoice_id == invoice.id)
            .order_by(Payment.collected_at)
        ).all()
    )
    logo_url, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
        branch_id=invoice.branch_id,
    )
    pdf = _build_receipt_pdf(
        tenant=tenant,
        patient=patient,
        invoice=invoice,
        items=items,
        payments=payments,
        logo_url=str(logo_url or ""),
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}-receipt.pdf"'},
    )


@router.post("/invoices/{invoice_id}/credit-notes", response_model=CreditNoteRead, status_code=status.HTTP_201_CREATED)
def create_credit_note(
    invoice_id: str,
    payload: CreditNoteCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> CreditNote:
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if payload.amount > invoice.total_amount:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Credit note amount cannot exceed invoice total")
    credit = CreditNote(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, tenant_id),
        amount=payload.amount,
        reason=payload.reason,
        created_by_user_id=payload.created_by_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.created_by_user_id,
        action="credit_note.issued",
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="credit_note",
    )
    return credit


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=InvoiceDetailRead,
    status_code=status.HTTP_201_CREATED,
)
def record_payment(
    invoice_id: str,
    payload: PaymentCreate,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.status in {InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot record payment for {invoice.status.value} invoice",
        )
    if payload.amount > invoice.balance_amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount cannot exceed invoice balance",
        )

    payment = Payment(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        method=payload.method,
        amount=payload.amount,
        reference_number=payload.reference_number,
        collected_by_user_id=payload.collected_by_user_id,
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    invoice = update_invoice_payment_status(session, invoice)
    _sync_physiotherapy_case_status(session, invoice)
    _sync_home_care_booking_status(session, invoice)
    _sync_patient_membership_payment(session, invoice)
    patient = session.get(Patient, invoice.patient_id)
    if invoice.balance_amount > 0 and patient:
        for provider in (NotificationProvider.WHATSAPP, NotificationProvider.SMS):
            queue_notification_if_allowed(
                session,
                tenant_id=tenant_id,
                branch_id=invoice.branch_id,
                provider=provider,
                event_type=NotificationEventType.PAYMENT_REMINDER,
                recipient=patient.mobile,
                subject="Payment pending",
                message=f"Payment pending for invoice {invoice.invoice_number}: Rs. {invoice.balance_amount}.",
                resource_type="invoice",
                resource_id=invoice.id,
                queued_by_user_id=payload.collected_by_user_id,
            )
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.collected_by_user_id,
        action="payment.recorded",
        resource_type="payment",
        resource_id=payment.id,
        purpose="payment_collection",
    )
    return _read_invoice_detail(session, invoice)


@router.post("/payments/{payment_id}/refund", response_model=InvoiceDetailRead)
def refund_payment(
    payment_id: str,
    payload: RefundRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.PAYMENTS_MANAGE)),
) -> InvoiceDetailRead:
    enforce_entitlement(session, tenant_id, "billing_basic")
    payment = session.get(Payment, payment_id)
    if not payment or payment.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if payment.status == PaymentStatus.REFUNDED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment already refunded")
    invoice = session.get(Invoice, payment.invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)

    payment.status = PaymentStatus.REFUNDED
    payment.refunded_at = datetime.now(timezone.utc)
    payment.refund_reason = payload.reason
    session.add(payment)
    session.commit()
    session.refresh(payment)
    invoice = update_invoice_payment_status(session, invoice)
    _sync_physiotherapy_case_status(session, invoice)
    _sync_home_care_booking_status(session, invoice)
    _sync_patient_membership_payment(session, invoice)
    if refundable_paid_total(session, invoice) == 0:
        invoice.status = InvoiceStatus.REFUNDED
        session.add(invoice)
        session.commit()
        session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="payment.refunded",
        resource_type="payment",
        resource_id=payment.id,
        purpose="refund",
    )
    credit = CreditNote(
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        invoice_id=invoice.id,
        credit_note_number=next_credit_note_number(session, tenant_id),
        amount=payment.amount,
        reason=payload.reason,
        created_by_user_id=payload.actor_user_id,
    )
    session.add(credit)
    session.commit()
    session.refresh(credit)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="credit_note.issued_for_refund",
        resource_type="credit_note",
        resource_id=credit.id,
        purpose="refund_credit_note",
    )
    return _read_invoice_detail(session, invoice)


@router.post("/invoices/{invoice_id}/cancel", response_model=InvoiceRead)
def cancel_invoice(
    invoice_id: str,
    payload: CancelInvoiceRequest,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> Invoice:
    enforce_entitlement(session, tenant_id, "billing_basic")
    invoice = session.get(Invoice, invoice_id)
    if not invoice or invoice.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    require_user_branch_access(current_user, invoice.branch_id)
    if invoice.paid_amount > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paid invoices cannot be cancelled; refund payments first",
        )
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invoice already cancelled")
    invoice.status = InvoiceStatus.CANCELLED
    invoice.updated_at = datetime.now(timezone.utc)
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=invoice.branch_id,
        actor_user_id=payload.actor_user_id,
        action="invoice.cancelled",
        resource_type="invoice",
        resource_id=invoice.id,
        purpose="billing_cancellation",
        metadata_json=f'{{"reason": "{payload.reason}"}}',
    )
    return invoice


@router.get("/doctor-settlements/summary", response_model=DoctorSettlementSummary)
def doctor_settlement_summary(
    tenant_id: str = Depends(require_tenant_id),
    practitioner_id: str | None = None,
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.SETTLEMENTS_READ)),
) -> DoctorSettlementSummary:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = (
        select(Invoice, Appointment)
        .join(Appointment, Invoice.appointment_id == Appointment.id)
        .where(Invoice.tenant_id == tenant_id)
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if practitioner_id:
        statement = statement.where(Appointment.practitioner_id == practitioner_id)
    rows = list(session.exec(statement).all())
    invoice_count = len(rows)
    total_invoice_amount = sum(invoice.total_amount for invoice, _appointment in rows)
    total_paid_amount = sum(invoice.paid_amount for invoice, _appointment in rows)
    total_doctor_share = sum(invoice.doctor_share_amount for invoice, _appointment in rows)
    doctor_share_paid_basis = 0
    for invoice, _appointment in rows:
        if invoice.total_amount:
            doctor_share_paid_basis += round(invoice.doctor_share_amount * invoice.paid_amount / invoice.total_amount)
    settlement_statement = select(DoctorSettlement).where(
        DoctorSettlement.tenant_id == tenant_id,
        DoctorSettlement.status == SettlementStatus.FINALIZED,
    )
    if branch_id:
        settlement_statement = settlement_statement.where(DoctorSettlement.branch_id == branch_id)
    else:
        settlement_statement = settlement_statement.where(DoctorSettlement.branch_id.is_(None))
    if practitioner_id:
        settlement_statement = settlement_statement.where(DoctorSettlement.practitioner_id == practitioner_id)
    else:
        settlement_statement = settlement_statement.where(DoctorSettlement.practitioner_id.is_(None))
    settlements = list(session.exec(settlement_statement).all())
    finalized_amount = sum(row.settlement_amount for row in settlements)
    payable_amount = max(doctor_share_paid_basis - finalized_amount, 0)
    latest_finalized_at = max((row.finalized_at for row in settlements), default=None)
    return DoctorSettlementSummary(
        tenant_id=tenant_id,
        practitioner_id=practitioner_id,
        branch_id=branch_id,
        invoice_count=invoice_count,
        total_invoice_amount=total_invoice_amount,
        total_paid_amount=total_paid_amount,
        total_doctor_share=total_doctor_share,
        doctor_share_paid_basis=doctor_share_paid_basis,
        finalized_settlement_amount=finalized_amount,
        payable_settlement_amount=payable_amount,
        pending_doctor_share=max(total_doctor_share - doctor_share_paid_basis, 0),
        can_finalize=payable_amount > 0,
        latest_finalized_at=latest_finalized_at,
    )


@router.post("/doctor-settlements/finalize", response_model=DoctorSettlementRead)
def finalize_doctor_settlement(
    payload: DoctorSettlementFinalize,
    tenant_id: str = Depends(require_tenant_id),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DoctorSettlementRead:
    summary = doctor_settlement_summary(
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=payload.branch_id,
        session=session,
        current_user=current_user,
    )
    if summary.payable_settlement_amount <= 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Doctor settlement is already finalized.")
    settlement = DoctorSettlement(
        tenant_id=tenant_id,
        branch_id=summary.branch_id,
        practitioner_id=payload.practitioner_id,
        invoice_count=summary.invoice_count,
        total_invoice_amount=summary.total_invoice_amount,
        total_paid_amount=summary.total_paid_amount,
        total_doctor_share=summary.total_doctor_share,
        settlement_amount=summary.payable_settlement_amount,
        finalized_by_user_id=payload.finalized_by_user_id,
    )
    session.add(settlement)
    session.commit()
    session.refresh(settlement)
    record_audit_event(
        session,
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        actor_user_id=payload.finalized_by_user_id,
        action="doctor_settlement.finalized",
        resource_type="doctor_settlement",
        resource_id=settlement.id,
        purpose="doctor_settlement",
    )
    updated_summary = doctor_settlement_summary(
        tenant_id=tenant_id,
        practitioner_id=payload.practitioner_id,
        branch_id=summary.branch_id,
        session=session,
        current_user=current_user,
    )
    return DoctorSettlementRead(
        **updated_summary.model_dump(exclude={"branch_id"}),
        id=settlement.id,
        branch_id=settlement.branch_id,
        settlement_amount=settlement.settlement_amount,
        status=settlement.status,
        finalized_by_user_id=settlement.finalized_by_user_id,
        finalized_at=settlement.finalized_at,
    )


@router.get("/reports/due-collection", response_model=DueCollectionReport)
def due_collection_report(
    tenant_id: str = Depends(require_tenant_id),
    branch_id: str | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> DueCollectionReport:
    enforce_entitlement(session, tenant_id, "billing_basic")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = select(Invoice).where(Invoice.tenant_id == tenant_id, Invoice.balance_amount > 0)
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    invoices = list(session.exec(statement.order_by(Invoice.created_at)).all())
    return DueCollectionReport(
        tenant_id=tenant_id,
        branch_id=branch_id,
        invoice_count=len(invoices),
        total_due_amount=sum(invoice.balance_amount for invoice in invoices),
        rows=[
            {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "patient_id": invoice.patient_id,
                "total_amount": invoice.total_amount,
                "paid_amount": invoice.paid_amount,
                "balance_amount": invoice.balance_amount,
                "created_at": invoice.created_at.isoformat(),
            }
            for invoice in invoices
        ],
    )


@router.get("/reports/revenue", response_model=RevenueReport)
def revenue_report(
    tenant_id: str = Depends(require_tenant_id),
    group_by: str = Query(default="branch", pattern="^(branch|doctor|department|visit_purpose)$"),
    branch_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permission(permissions.BILLING_MANAGE)),
) -> RevenueReport:
    enforce_module_enabled(session, tenant_id, "billing_advanced")
    branch_id = scoped_branch_id(current_user, branch_id)
    statement = (
        select(Invoice, Appointment)
        .join(Appointment, Invoice.appointment_id == Appointment.id)
        .where(Invoice.tenant_id == tenant_id)
    )
    if branch_id:
        statement = statement.where(Invoice.branch_id == branch_id)
    if from_date:
        statement = statement.where(func.date(Invoice.created_at) >= from_date)
    if to_date:
        statement = statement.where(func.date(Invoice.created_at) <= to_date)
    rows = list(session.exec(statement).all())
    grouped: dict[str, dict] = {}
    for invoice, appointment in rows:
        key = (
            invoice.branch_id
            if group_by == "branch"
            else appointment.practitioner_id
            if group_by == "doctor"
            else appointment.department_id
            if group_by == "department"
            else appointment.visit_purpose or appointment.appointment_type.value
        )
        key = key or "unassigned"
        bucket = grouped.setdefault(
            key,
            {"key": key, "invoice_count": 0, "invoice_amount": 0, "paid_amount": 0, "tax_amount": 0, "doctor_share": 0},
        )
        bucket["invoice_count"] += 1
        bucket["invoice_amount"] += invoice.total_amount
        bucket["paid_amount"] += invoice.paid_amount
        bucket["tax_amount"] += invoice.tax_amount
        bucket["doctor_share"] += invoice.doctor_share_amount
    report_rows = list(grouped.values())
    return RevenueReport(
        tenant_id=tenant_id,
        group_by=group_by,
        rows=report_rows,
        total_invoice_amount=sum(row["invoice_amount"] for row in report_rows),
        total_paid_amount=sum(row["paid_amount"] for row in report_rows),
        total_tax_amount=sum(row["tax_amount"] for row in report_rows),
        total_doctor_share=sum(row["doctor_share"] for row in report_rows),
    )
