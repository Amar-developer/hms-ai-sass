from io import BytesIO


def optimize_pdf(data: bytes) -> bytes:
    try:
        import pikepdf
    except ImportError as exc:  # pragma: no cover - deployment guard
        raise RuntimeError("pikepdf is required for PDF optimization") from exc

    try:
        with pikepdf.Pdf.open(BytesIO(data)) as pdf:
            original_page_count = len(pdf.pages)
            try:
                for key in list(pdf.docinfo):
                    del pdf.docinfo[key]
            except (AttributeError, KeyError, TypeError):
                pass
            output = BytesIO()
            pdf.save(
                output,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                linearize=True,
            )
    except pikepdf.PasswordError as exc:
        raise ValueError("Password-protected PDFs are not supported") from exc
    except pikepdf.PdfError as exc:
        raise ValueError("PDF is corrupted or cannot be decoded") from exc

    optimized = output.getvalue()
    try:
        with pikepdf.Pdf.open(BytesIO(optimized)) as verified:
            if len(verified.pages) != original_page_count:
                raise ValueError("Optimized PDF page count changed")
    except pikepdf.PdfError as exc:
        raise ValueError("Optimized PDF failed validation") from exc
    return optimized
