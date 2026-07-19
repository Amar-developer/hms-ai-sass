from pathlib import Path
import zlib

from app.core.uploads import UPLOADS_DIR
from app.modules.billing.models import InvoiceItem


def pdf_text(value: object) -> str:
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
        .replace("\n", " ")
        .encode("latin-1", "replace")
        .decode("latin-1")
    )


def money_pdf(value: object) -> str:
    return f"Rs. {int(value or 0):,}"


def signed_money_pdf(value: object) -> str:
    amount = int(value or 0)
    if amount < 0:
        return f"- Rs. {abs(amount):,}"
    return money_pdf(amount)


def percent_pdf(amount: int, base: int) -> str:
    if amount <= 0 or base <= 0:
        return "0%"
    percent = amount * 100 / base
    return f"{percent:.1f}".rstrip("0").rstrip(".") + "%"


def text_width(value: object, size: int, bold: bool = False) -> int:
    raw = pdf_text(value)
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
    return money_pdf(mrp) if mrp else "-"


def item_discount_percent(item: InvoiceItem) -> str:
    mrp = item_mrp_amount(item)
    selling = item_selling_amount(item)
    if not mrp or selling >= mrp:
        return "-"
    return f"{((mrp - selling) * 100 / mrp):.2f}"


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


def local_logo_image(logo_url: str | None) -> dict[str, object] | None:
    if not logo_url:
        return None
    path: Path | None = None
    if logo_url.startswith("/uploads/"):
        path = UPLOADS_DIR / Path(logo_url).name
    elif logo_url.startswith("uploads/"):
        path = UPLOADS_DIR / Path(logo_url).name
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
