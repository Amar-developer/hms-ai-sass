from dataclasses import dataclass
from pathlib import Path
import re
import zlib

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.access_control import require_user_branch_access
from app.modules.billing.models import Invoice, InvoiceItem, Payment
from app.modules.billing.repositories import BillingInvoiceSupportRepository
from app.modules.identity.models import User
from app.modules.patients.models import Patient
from app.modules.settings.models import SettingKey
from app.modules.settings.service import resolve_setting
from app.modules.tenants.models import Branch, Tenant


@dataclass(frozen=True)
class ReceiptPdfDocument:
    content: bytes
    filename: str


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


def _signed_money_pdf(value: object) -> str:
    amount = int(value or 0)
    if amount < 0:
        return f"- Rs. {abs(amount):,}"
    return _money_pdf(amount)


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
    if (
        not width
        or not height
        or bit_depth != 8
        or color_type not in {2, 6}
        or interlace != 0
    ):
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
                predictor = (
                    left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                )
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
    return {
        "data": image_data,
        "width": width,
        "height": height,
        "filter": "FlateDecode",
    }


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
        return {
            "data": data,
            "width": size[0],
            "height": size[1],
            "filter": "DCTDecode",
        }
    if path.suffix.lower() == ".png":
        return _png_logo_image(data)
    return None


def build_receipt_pdf(
    *,
    tenant: Tenant | None,
    branch: Branch | None,
    patient: Patient | None,
    invoice: Invoice,
    items: list[InvoiceItem],
    payments: list[Payment],
    logo_url: str | None,
    bank_details: dict[str, object] | None = None,
) -> bytes:
    width, height = 595, 842
    ops: list[str] = []
    # The invoice-specific "Invoice Logo" setting (logo_url) is the authoritative
    # source for receipts; fall back to the general tenant logo. Resolve at the
    # image level (not the string level) so a stale/missing file for one source
    # never blocks a valid file from the other.
    logo = _local_logo_image(logo_url) or _local_logo_image(
        tenant.logo_url if tenant else None
    )
    green = "0.10 0.95 0.22"
    blue = "0.08 0.60 0.85"
    brand_green = "0.09 0.78 0.06"
    red = "0.78 0.00 0.00"

    def color(stroke="0.86 0.90 0.95", fill: str | None = None) -> None:
        ops.append(f"{stroke} RG")
        if fill:
            ops.append(f"{fill} rg")

    def rect(x: int, y: int, w: int, h: int, fill: bool = False) -> None:
        ops.append(f"{x} {y} {w} {h} re {'B' if fill else 'S'}")

    def line(
        x1: int, y1: int, x2: int, y2: int, stroke: str = "0.20 0.20 0.20"
    ) -> None:
        ops.append(f"{stroke} RG {x1} {y1} m {x2} {y2} l S")

    def location_icon(x: int, y: int, fill: str = "0.00 0.68 0.00") -> None:
        scale = 0.58
        ops.append(
            f"q {scale} 0 0 {-scale} {x} {y + int(25 * scale)} cm {fill} rg "
            "12.3153 11.803 m "
            "11.6349 11.803 10.9824 11.5327 10.5013 11.0516 c "
            "10.0202 10.5705 9.74994 9.91801 9.74994 9.23764 c "
            "9.74994 8.55727 10.0202 7.90477 10.5013 7.42367 c "
            "10.9824 6.94258 11.6349 6.6723 12.3153 6.6723 c "
            "12.9956 6.6723 13.6482 6.94258 14.1292 7.42367 c "
            "14.6103 7.90477 14.8806 8.55727 14.8806 9.23764 c "
            "14.8806 9.57453 14.8143 9.90811 14.6853 10.2194 c "
            "14.5564 10.5306 14.3675 10.8134 14.1292 11.0516 c "
            "13.891 11.2898 13.6082 11.4788 13.297 11.6077 c "
            "12.9858 11.7366 12.6522 11.803 12.3153 11.803 c "
            "12.3153 2.05469 m "
            "10.4102 2.05469 8.58323 2.81146 7.23616 4.15853 c "
            "5.8891 5.50559 5.13232 7.3326 5.13232 9.23764 c "
            "5.13232 14.6249 12.3153 22.5774 12.3153 22.5774 c "
            "12.3153 22.5774 19.4982 14.6249 19.4982 9.23764 c "
            "19.4982 7.3326 18.7415 5.50559 17.3944 4.15853 c "
            "16.0473 2.81146 14.2203 2.05469 12.3153 2.05469 c f Q"
        )

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
        elif align == "center":
            x -= int(len(value) * size * 0.24)
        font = "F2" if bold else "F1"
        ops.append(f"{fill} rg BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({value}) Tj ET")

    def text_width(value: object, size: int, bold: bool = False) -> int:
        raw = _pdf_text(value)
        if bold:
            widths = {
                " ": 0.278,
                ".": 0.278,
                ",": 0.278,
                "-": 0.333,
                "|": 0.280,
                "#": 0.556,
                "+": 0.584,
                "/": 0.278,
            }
            total = 0.0
            for char in raw:
                if char.isupper():
                    total += {
                        "I": 0.278,
                        "J": 0.389,
                        "M": 0.833,
                        "W": 0.944,
                    }.get(char, 0.722)
                elif char.islower():
                    total += {
                        "i": 0.278,
                        "j": 0.278,
                        "l": 0.278,
                        "m": 0.833,
                        "r": 0.389,
                        "t": 0.333,
                        "w": 0.722,
                    }.get(char, 0.556)
                elif char.isdigit():
                    total += 0.556
                else:
                    total += widths.get(char, 0.556)
            return int(total * size)
        return int(len(raw) * size * 0.50)

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

    def center(x1: int, x2: int, y: int, value: object, size=8, bold=False) -> None:
        text((x1 + x2) // 2, y, value, size, bold, "center")

    def paid_stamp(cx: int, cy: int) -> None:
        # Rotated "PAID / THANK YOU" badge for fully settled invoices. Wraps a
        # border + two text lines in a rotated coordinate space (cos/sin for a
        # fixed 15 degree tilt, precomputed to avoid a math import) centered
        # at (cx, cy); Tm-positioned text composes with the outer `cm` so it
        # rotates along with the border.
        cos_t, sin_t, neg_sin_t = "0.9659", "0.2588", "-0.2588"
        # #37A94C, the exact stamp green from the source design file.
        stamp_green = "0.216 0.663 0.298"
        ops.append(f"q {cos_t} {sin_t} {neg_sin_t} {cos_t} {cx} {cy} cm")
        ops.append(f"{stamp_green} RG 1.6 w 0 j -35 -14 70 28 re S")
        # Both lines are x-centered on the local origin (align="center") so
        # they stay centered inside the border regardless of its width. The
        # border is sized close to the text (not a large card) so there's no
        # empty margin left/right of "PAID"/"THANK YOU".
        text(0, 2, "PAID", 14, True, "center", stamp_green)
        text(0, -11, "THANK YOU", 6, True, "center", stamp_green)
        ops.append("Q")

    def item_selling_amount(item: InvoiceItem) -> int:
        return int(item.selling_amount or item.unit_amount or 0)

    def item_mrp_amount(item: InvoiceItem) -> int | None:
        mrp = int(item.mrp_amount or 0)
        if mrp > 0:
            return mrp
        if item.item_type == "pharmacy":
            return item_selling_amount(item) or None
        return None

    def item_mrp_text(item: InvoiceItem) -> str:
        mrp = item_mrp_amount(item)
        return _money_pdf(mrp) if mrp else "-"

    def item_discount_percent(item: InvoiceItem) -> str:
        mrp = item_mrp_amount(item)
        selling = item_selling_amount(item)
        if not mrp or selling >= mrp:
            return "-"
        return f"{((mrp - selling) * 100 / mrp):.2f}"

    def field_label(
        x: int, y: int, label: str, value: object = "", max_chars: int = 33
    ) -> int:
        """Draws a label/value row. Returns the number of value lines drawn
        so callers can shift subsequent rows down when the value wraps."""
        text(x, y, label, 8, True)
        text(x + 58, y, ":", 8, True)
        lines_drawn = 1
        if value not in (None, ""):
            wrapped = wrap_text(value, max_chars)[:3]
            for offset, line_value in enumerate(wrapped):
                text(x + 70, y - offset * 10, line_value, 8)
            lines_drawn = max(len(wrapped), 1)
        return lines_drawn

    def field_label_height(value: object, max_chars: int = 33) -> int:
        """Vertical space (in row units of 10pt) a field_label call will need
        beyond its first line, so the next row can be pushed down accordingly."""
        if value in (None, ""):
            return 0
        return max(len(wrap_text(value, max_chars)[:3]) - 1, 0)

    def amount_words(value: int) -> str:
        ones = [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ]
        tens = [
            "",
            "",
            "twenty",
            "thirty",
            "forty",
            "fifty",
            "sixty",
            "seventy",
            "eighty",
            "ninety",
        ]

        def small(number: int) -> str:
            parts: list[str] = []
            if number >= 100:
                parts.append(f"{ones[number // 100]} hundred")
                number %= 100
            if number >= 20:
                parts.append(tens[number // 10])
                number %= 10
            if number:
                parts.append(ones[number])
            return " ".join(parts)

        value = max(int(value or 0), 0)
        if value == 0:
            return "Rupees Zero Only"
        parts: list[str] = []
        for scale, label in ((10000000, "crore"), (100000, "lakh"), (1000, "thousand")):
            if value >= scale:
                parts.append(f"{small(value // scale)} {label}")
                value %= scale
        if value:
            parts.append(small(value))
        return f"Rupees {' '.join(parts)} Only".title()

    tenant_name = (tenant.name if tenant and tenant.name else "").strip()
    legal_name = (
        (tenant.legal_name if tenant and tenant.legal_name else "")
        or tenant_name
        or "Hospital"
    ).strip()
    header_address = (tenant.address if tenant and tenant.address else "").strip()
    patient_name = (
        getattr(patient, "full_name", None)
        or getattr(patient, "name", None)
        or "Patient"
    )
    patient_phone = (
        getattr(patient, "mobile", None)
        or getattr(patient, "guardian_mobile", None)
        or ""
    )
    patient_address = (
        getattr(patient, "address", None) or getattr(patient, "area", None) or ""
    )
    color(stroke="1 1 1", fill="1 1 1")
    rect(0, 0, width, height, True)

    logo_x = 30
    logo_w = 78 if logo else 0
    if logo:
        image_w = logo_w
        image_h = max(
            34, min(62, int(image_w * int(logo["height"]) / int(logo["width"])))
        )
        ops.append(f"q {image_w} 0 0 {image_h} {logo_x} 765 cm /Logo Do Q")
    title_size = 20 if len(legal_name) <= 36 else 17 if len(legal_name) <= 52 else 14
    title_parts = legal_name.split(maxsplit=1)
    title_left_bound = 120 if logo else 24
    title_right_bound = 522
    title_center_x = (title_left_bound + title_right_bound) // 2
    title_first = title_parts[0] if title_parts else legal_name
    title_total_width = text_width(legal_name, title_size, True)
    title_available_width = title_right_bound - title_left_bound
    while title_size > 12 and title_total_width > title_available_width:
        title_size -= 1
        title_total_width = text_width(legal_name, title_size, True)
    title_x = max(title_left_bound, title_center_x - title_total_width // 2)
    text(title_x, 790, legal_name, title_size, True, fill=brand_green)
    if title_first:
        text(title_x, 790, title_first, title_size, True, fill=blue)
    title_line_end = min(title_right_bound, title_x + title_total_width)
    line(title_x, 781, title_line_end, 781, green)
    bank_details = bank_details if isinstance(bank_details, dict) else {}
    bank_name = str(
        bank_details.get("account_name") or bank_details.get("name") or ""
    ).strip()
    bank_branch = str(
        bank_details.get("branch_name") or bank_details.get("branch") or ""
    ).strip()
    bank_account = str(
        bank_details.get("account_number") or bank_details.get("acc_number") or ""
    ).strip()
    bank_ifsc = str(bank_details.get("ifsc") or "").strip().upper()
    bank_upi = str(bank_details.get("upi_id") or bank_details.get("upi") or "").strip()
    tenant_gstin = str(bank_details.get("gstin") or "").strip().upper()
    address_line = wrap_text(header_address, 90)[0] if header_address else ""
    if header_address:
        address_width = 18 + text_width(address_line, 10, True)
        address_x = max(title_left_bound, title_center_x - address_width // 2)
        location_icon(address_x, 763)
        text(address_x + 18, 764, address_line, 10, True, fill=brand_green)
    text(575, 776, "INVOICE", 13, True, "right", fill=red)
    line(16, 752, 579, 752, green)
    text(
        297,
        734,
        "A Single Stop for All Your HealthCare Needs !",
        9,
        True,
        "center",
        fill="0.00 0.70 0.30",
    )

    color(stroke=green)
    rect(16, 592, 563, 126)
    line(16, 700, 579, 700, green)
    line(291, 592, 291, 718, green)
    text(130, 706, "Customer Details", 9, True, "center")
    # Center the whole "<name> GSTIN : <value>" line within the right column
    # section (between the divider at x=291 and the right border at x=579).
    gst_label = f"{tenant_name or legal_name} GSTIN"
    gst_size = 8 if len(gst_label) <= 28 else 7
    gst_sep = " : "
    gst_value = tenant_gstin or ""
    gst_label_w = text_width(gst_label, gst_size, True)
    gst_sep_w = text_width(gst_sep, gst_size, True)
    gst_value_w = text_width(gst_value, 8, True)
    gst_total_w = gst_label_w + gst_sep_w + gst_value_w
    gst_start_x = (291 + 579) // 2 - gst_total_w // 2
    text(gst_start_x, 706, gst_label, gst_size, True)
    text(gst_start_x + gst_label_w, 706, gst_sep, gst_size, True)
    if gst_value:
        text(gst_start_x + gst_label_w + gst_sep_w, 706, gst_value, 8, True)
    field_label(25, 682, "Patient ID", getattr(patient, "patient_number", "") or "")
    field_label(25, 666, "Name", patient_name)
    field_label(25, 650, "Phone No.", patient_phone)
    field_label(25, 634, "WhatsApp No.", patient_phone)
    field_label(25, 618, "Address", patient_address)
    field_label(306, 679, "Invoice No.", invoice.invoice_number)
    field_label(306, 662, "Invoice Date", invoice.created_at.strftime("%d/%m/%Y"))

    table_top = 578
    table_bottom = 280
    x_cols = [16, 38, 226, 274, 371, 419, 467, 515, 579]
    rect(16, table_bottom, 563, table_top - table_bottom)
    line(16, 552, 579, 552, green)
    for x in x_cols[1:-1]:
        line(x, table_bottom, x, table_top, green)
    center(16, 38, 563, "Sr.\nNo", 7, True)
    center(38, 226, 563, "Name of Product / Service", 8, True)
    center(226, 274, 563, "Exp. Date", 8, True)
    center(274, 371, 563, "HSN / SAC", 8, True)
    center(371, 419, 563, "Qty", 8, True)
    center(419, 467, 563, "MRP", 8, True)
    center(467, 515, 563, "Disc. %", 8, True)
    center(515, 579, 563, "Rate", 8, True)

    subtotal = int(invoice.subtotal_amount or 0)
    membership_discount = min(
        int(getattr(invoice, "membership_discount_amount", 0) or 0),
        int(invoice.discount_amount or 0),
    )
    extra_discount = max(int(invoice.discount_amount or 0) - membership_discount, 0)
    total_invoice_discount = extra_discount + membership_discount
    taxable = int(invoice.taxable_amount or max(subtotal - total_invoice_discount, 0))
    tax = int(invoice.tax_amount or 0)
    item_quantity_total = sum(int(item.quantity or 0) for item in items)
    item_discount_total = sum(
        max((item_mrp_amount(item) or 0) - item_selling_amount(item), 0)
        * int(item.quantity or 0)
        for item in items
    )
    total_discount = item_discount_total + total_invoice_discount

    row_y = 532
    for index, item in enumerate(items[:10], start=1):
        text(25, row_y, index, 8)
        for offset, line_value in enumerate(wrap_text(item.description, 36)[:2]):
            text(45, row_y - offset * 10, line_value, 8)
        text(396, row_y, item.quantity, 8, align="right")
        text(459, row_y, item_mrp_text(item), 8, align="right")
        text(505, row_y, item_discount_percent(item), 8, align="right")
        text(570, row_y, _money_pdf(item.total_amount), 8, align="right")
        row_y -= 18
    if len(items) > 10:
        text(45, row_y, f"+ {len(items) - 10} more item(s)", 8, True)

    summary_y = 338
    summary_rows: list[tuple[str, int]] = [
        ("Subtotal", subtotal),
    ]
    if membership_discount > 0:
        summary_rows.append(("Membership Benefit", -membership_discount))
    if extra_discount > 0:
        summary_rows.append(("Extra Discount", -extra_discount))
    if tax > 0:
        summary_rows.append((f"Tax ({_percent_pdf(tax, taxable)})", tax))
    for label, amount in summary_rows:
        text(350, summary_y, label, 8, True, "right")
        text(570, summary_y, _signed_money_pdf(amount), 8, amount >= 0, "right")
        summary_y -= 16

    line(16, 264, 579, 264, green)
    for x in [371, 419, 467, 515]:
        line(x, 264, x, 280, green)
    text(406, 269, item_quantity_total, 8, True, "right")
    if total_discount > 0:
        text(505, 269, _money_pdf(total_discount), 8, True, "right")
    text(350, 269, "Total", 9, True, "right")
    text(570, 269, _money_pdf(invoice.total_amount), 9, True, "right")

    rect(16, 241, 563, 23)
    words_label = "Total in words: "
    text(25, 250, words_label, 8)
    text(
        25 + text_width(words_label, 8),
        250,
        amount_words(int(invoice.total_amount or 0)),
        8,
        True,
        fill="0.012 0.780 0.467",  # #03C777
    )

    # ------------------------------------------------------------------
    # Footer: Bank Details (left column) cascades dynamically based on how
    # many lines each field wraps to, so long bank/account names never
    # collide with the QR box or the rows below them. Terms & Conditions
    # and the Customer Signature box (left column), plus the certification
    # text and Authorized Signature (right column), all derive their
    # vertical position from the bank box's actual height instead of using
    # fixed y-coordinates.
    # ------------------------------------------------------------------
    # 7:5 column split — bank details (left) gets 7/12 of the footer width,
    # the certification column (right) gets the remaining 5/12.
    left_x, right_x = 16, 579
    mid_x = left_x + round((right_x - left_x) * 7 / 12)  # = 344
    footer_bottom = 24
    row_gap = 16  # vertical gap between label rows when value is a single line
    min_sig_box_height = 30  # never shrink the signature box below this
    min_terms_box_height = 20  # never shrink the terms box below this (last resort)
    page_top_y = 241  # original fixed top of the whole left-column box stack

    bank_header_y = 224  # "Bank Details" header divider stays anchored here
    name_y = bank_header_y - 15
    name_extra = field_label_height(bank_name)
    branch_y = name_y - row_gap - (name_extra * 10)
    branch_extra = field_label_height(bank_branch)
    acc_y = branch_y - row_gap - (branch_extra * 10)
    acc_extra = field_label_height(bank_account)
    ifsc_y = acc_y - row_gap - (acc_extra * 10)
    ifsc_extra = field_label_height(bank_ifsc)
    upi_y = ifsc_y - row_gap - (ifsc_extra * 10)
    upi_extra = field_label_height(bank_upi)

    bank_box_top = page_top_y
    # 8pt gap from the last drawn row down to the box border, same as original.
    bank_box_bottom = upi_y - (upi_extra * 10) - 8
    bank_box_height = bank_box_top - bank_box_bottom

    rect(left_x, bank_box_bottom, mid_x - left_x, bank_box_height)
    line(left_x, bank_header_y, mid_x, bank_header_y, green)
    center(left_x, mid_x, bank_header_y + 5, "Bank Details", 8, True)
    field_label(25, name_y, "Name", bank_name)
    field_label(25, branch_y, "Branch", bank_branch)
    field_label(25, acc_y, "Acc. Number", bank_account)
    field_label(25, ifsc_y, "IFSC", bank_ifsc)
    field_label(25, upi_y, "UPI ID", bank_upi)

    # QR box: a true square (equal width/height), right-aligned within the
    # bank box and vertically centered against the Acc. Number / IFSC rows,
    # clamped so the whole square always stays inside the (possibly taller)
    # bank box.
    qr_size = 48
    caption_gap = 14  # room for the "Pay using UPI" caption below the square
    qr_x = mid_x - 28 - qr_size  # leave a ~28pt margin to the column border
    qr_y_top = min(acc_y + 6, bank_box_top - 8)
    qr_y_bottom = qr_y_top - qr_size
    # Keep the square *and* its caption inside the bank box so the caption
    # never crosses the Terms & Conditions border below.
    if qr_y_bottom - caption_gap < bank_box_bottom + 4:
        qr_y_bottom = bank_box_bottom + 4 + caption_gap
        qr_y_top = qr_y_bottom + qr_size
    rect(qr_x, qr_y_bottom, qr_size, qr_size)
    text(qr_x + 3, qr_y_bottom - 10, "Pay using UPI", 8, True)

    # Terms & Conditions and Customer Signature share whatever vertical room
    # is left below the bank box (the three boxes are contiguous, just as in
    # the original fixed layout). The signature box keeps a usable minimum
    # height first; Terms & Conditions absorbs the remaining wrap overflow
    # from the bank box, and only shrinks below its natural height once the
    # bank box has grown enough to need it. This guarantees the stack never
    # overflows past the page footer, however long the bank details are.
    remaining_height = bank_box_bottom - footer_bottom
    sig_box_height = min_sig_box_height
    terms_box_height = max(remaining_height - sig_box_height, min_terms_box_height)
    natural_terms_height = 75
    if terms_box_height > natural_terms_height:
        # Plenty of room: give Terms & Conditions its natural height and let
        # the signature box take any leftover space.
        terms_box_height = natural_terms_height
        sig_box_height = max(remaining_height - terms_box_height, min_sig_box_height)

    terms_box_top = bank_box_bottom
    terms_box_bottom = terms_box_top - terms_box_height
    rect(left_x, terms_box_bottom, mid_x - left_x, terms_box_height)
    # Header text sits 12pt *below* the top border (matching the original
    # fixed layout's relationship between its rect-top and header y), so it
    # never crowds the bank box's last row sitting just above this border.
    header_divider_y = terms_box_top - 18
    line(left_x, header_divider_y, mid_x, header_divider_y, green)
    center(left_x, mid_x, terms_box_top - 12, "Terms and Conditions", 8, True)
    terms_lines = [
        "Subject to Tamil Nadu Junction.",
        "Our Responsibility Ceases as soon as goods leaves our Premises.",
        "Goods Once sold will not taken back.",
        "Delivery Ex-Premises.",
    ]
    # Show as many terms lines as fit in whatever height this box ended up
    # with, instead of overflowing past its own border when squeezed.
    max_terms_lines = max(int((terms_box_height - 24) // 11), 1)
    for offset, line_value in enumerate(terms_lines[:max_terms_lines]):
        text(25, terms_box_top - 33 - offset * 11, line_value, 7)

    sig_box_top = terms_box_bottom
    sig_box_bottom = sig_box_top - sig_box_height
    rect(left_x, sig_box_bottom, mid_x - left_x, sig_box_height)
    text(
        25, sig_box_bottom + max(sig_box_height - 20, 4), "Customer Signature", 8, True
    )

    # Right column mirrors the full combined height of the left column boxes
    # so the two columns' outer borders always line up with each other.
    right_col_top = bank_box_top
    right_col_bottom = sig_box_bottom
    rect(mid_x, right_col_bottom, right_x - mid_x, right_col_top - right_col_bottom)
    # Left padding inside the right column so text never sits on the column
    # border; the certification line wraps to the column width.
    cert_pad = mid_x + 10
    top_divider_y = right_col_top - 44
    line(mid_x, top_divider_y, right_x, top_divider_y, green)
    line(mid_x, right_col_bottom + 38, right_x, right_col_bottom + 38, green)
    cert_lines = wrap_text(
        "Certified that the particulars give above are true and correct.", 50
    )
    for offset, cert_line in enumerate(cert_lines):
        text(cert_pad, right_col_top - 11 - offset * 11, cert_line, 7)
    # "For <legal name>" gets clear space above the divider line below it.
    text(cert_pad, top_divider_y + 9, f"For {legal_name}", 8, True)
    # Fully settled invoices get a PAID stamp in the otherwise-empty middle
    # band of this column, between the certification text and the signature
    # line — same "fully paid" condition used elsewhere for invoice status.
    if invoice.balance_amount <= 0 and invoice.total_amount > 0:
        paid_stamp(
            (mid_x + right_x) // 2,
            (top_divider_y + (right_col_bottom + 38)) // 2,
        )
    text(
        (mid_x + right_x) // 2,
        right_col_bottom + 15,
        "Authorized Signature",
        8,
        True,
        "center",
    )

    text(
        25,
        8,
        "Thanks for your order! We look forward to working with you again soon.",
        7,
    )

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
    objects.append(
        f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream"
    )

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
    pdf.extend(
        f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{startxref}\n%%EOF".encode()
    )
    return bytes(pdf)


def _receipt_filename(patient: Patient | None, invoice: Invoice) -> str:
    patient_name = (
        getattr(patient, "full_name", None)
        or getattr(patient, "name", None)
        or "Patient"
    )
    return (
        "-".join(
            part
            for part in (
                re.sub(r"[^a-zA-Z0-9]+", "-", str(patient_name)).strip("-"),
                re.sub(r"[^a-zA-Z0-9]+", "-", str(invoice.invoice_number)).strip("-"),
            )
            if part
        )
        or "receipt"
    )


def build_invoice_receipt_document(
    session: Session,
    *,
    tenant_id: str,
    invoice_id: str,
    current_user: User,
) -> ReceiptPdfDocument:
    support_repo = BillingInvoiceSupportRepository(session)
    invoice = support_repo.get_invoice_for_tenant(
        tenant_id=tenant_id,
        invoice_id=invoice_id,
    )
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found"
        )
    require_user_branch_access(current_user, invoice.branch_id)
    tenant = support_repo.get_tenant(tenant_id)
    branch = support_repo.get_branch(invoice.branch_id)
    patient = support_repo.get_patient(invoice.patient_id)
    items = support_repo.list_invoice_items(invoice)
    payments = support_repo.list_payments(invoice)
    logo_url, _scope, _scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="invoice",
        key=SettingKey.INVOICE_LOGO_URL,
    )
    # Bank/account details are tenant-wide (managed identically by super admin
    # and tenant admin screens), so resolve at tenant scope only. Passing
    # branch_id here let a stale branch-scoped row permanently shadow tenant
    # edits, so receipts kept printing old account details.
    bank_details, _bank_scope, _bank_scope_id = resolve_setting(
        session,
        tenant_id=tenant_id,
        module="accounts",
        key=SettingKey.ACCOUNTS_BANK_DETAILS,
    )
    return ReceiptPdfDocument(
        content=build_receipt_pdf(
            tenant=tenant,
            branch=branch,
            patient=patient,
            invoice=invoice,
            items=items,
            payments=payments,
            logo_url=str(logo_url or getattr(tenant, "logo_url", "") or ""),
            bank_details=bank_details if isinstance(bank_details, dict) else {},
        ),
        filename=_receipt_filename(patient, invoice),
    )
