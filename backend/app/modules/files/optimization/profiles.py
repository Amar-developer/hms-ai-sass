from dataclasses import dataclass


@dataclass(frozen=True)
class OptimizationProfile:
    name: str
    kind: str
    preserve_original: bool
    max_dimension: int | None = None
    quality: int | None = None
    output_format: str | None = None
    minimum_size_bytes: int = 0
    target_size_bytes: int | None = None
    maximum_size_bytes: int | None = None
    lossless: bool = False


INVOICE_PDF = OptimizationProfile(
    name="invoice_pdf",
    kind="pdf",
    preserve_original=False,
    target_size_bytes=2 * 1024 * 1024,
    maximum_size_bytes=5 * 1024 * 1024,
)
UPLOADED_LAB_PDF = OptimizationProfile(
    name="uploaded_lab_pdf",
    kind="pdf",
    # Lab PDFs are optimized before object storage. The resulting verified PDF
    # remains the immutable clinical artifact; the oversized transport bytes
    # are not duplicated in S3.
    preserve_original=False,
    minimum_size_bytes=512 * 1024,
    target_size_bytes=5 * 1024 * 1024,
    maximum_size_bytes=10 * 1024 * 1024,
)
LAB_SCAN_DELIVERY = OptimizationProfile(
    name="lab_scan_delivery",
    kind="image",
    preserve_original=True,
    max_dimension=2400,
    quality=85,
    output_format="JPEG",
    minimum_size_bytes=256 * 1024,
)
PATIENT_PHOTO = OptimizationProfile(
    name="patient_photo",
    kind="image",
    preserve_original=False,
    max_dimension=1600,
    quality=82,
    output_format="JPEG",
)
LOGO = OptimizationProfile(
    name="logo",
    kind="image",
    preserve_original=False,
    max_dimension=1200,
    output_format="PNG",
    lossless=True,
)
SIGNATURE = OptimizationProfile(
    name="signature",
    kind="image",
    preserve_original=False,
    max_dimension=1200,
    output_format="PNG",
    lossless=True,
)
QR_CODE = OptimizationProfile(
    name="qr_code",
    kind="image",
    preserve_original=False,
    max_dimension=1200,
    output_format="PNG",
    lossless=True,
)


def select_optimization_profile(
    *,
    category: str | None,
    source_module: str | None,
    attached_to_field: str | None,
    content_type: str | None,
) -> OptimizationProfile | None:
    category_key = str(category or "").strip().lower()
    source_key = str(source_module or "").strip().lower()
    field_key = str(attached_to_field or "").strip().lower()
    content_key = str(content_type or "").strip().lower()

    if content_key == "application/pdf":
        if category_key == "invoice" or source_key == "billing":
            return INVOICE_PDF
        if category_key == "lab_report" or source_key == "lab":
            return UPLOADED_LAB_PDF
        return None
    if not content_key.startswith("image/"):
        return None
    if "qr" in category_key or "qr" in field_key:
        return QR_CODE
    if "signature" in category_key or "signature" in field_key:
        return SIGNATURE
    if category_key == "logo" or "logo" in field_key:
        return LOGO
    if category_key == "patient_photo" or field_key == "photo_url":
        return PATIENT_PHOTO
    if category_key == "lab_report" or source_key == "lab":
        return LAB_SCAN_DELIVERY
    return None
