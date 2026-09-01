from io import BytesIO
from pathlib import Path
import shutil
import subprocess
import tempfile


def _has_digital_signature(pdf) -> bool:
    try:
        fields = list(pdf.Root.AcroForm.Fields)
    except (AttributeError, TypeError):
        return False
    seen: set[tuple[int, int]] = set()
    while fields:
        field = fields.pop()
        object_id = getattr(field, "objgen", None)
        if object_id and object_id in seen:
            continue
        if object_id:
            seen.add(object_id)
        try:
            if str(field.get("/FT", "")) == "/Sig" and field.get("/V") is not None:
                return True
            fields.extend(list(field.get("/Kids", [])))
        except (AttributeError, TypeError):
            continue
    return False


def _page_count(data: bytes) -> int:
    import pikepdf

    with pikepdf.Pdf.open(BytesIO(data)) as pdf:
        return len(pdf.pages)


def _ghostscript_candidate(
    data: bytes, *, resolution: int, jpeg_quality: int
) -> bytes | None:
    ghostscript = shutil.which("gs")
    if not ghostscript:
        return None
    with tempfile.TemporaryDirectory(prefix="medizinhub-pdf-") as directory:
        input_path = Path(directory) / "input.pdf"
        output_path = Path(directory) / "output.pdf"
        input_path.write_bytes(data)
        command = [
            ghostscript,
            "-dSAFER",
            "-dBATCH",
            "-dNOPAUSE",
            "-dQUIET",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.7",
            "-dDetectDuplicateImages=true",
            "-dCompressFonts=true",
            "-dSubsetFonts=true",
            "-dDownsampleColorImages=true",
            "-dDownsampleGrayImages=true",
            "-dAutoFilterColorImages=false",
            "-dAutoFilterGrayImages=false",
            "-dColorImageFilter=/DCTEncode",
            "-dGrayImageFilter=/DCTEncode",
            "-dPassThroughJPEGImages=false",
            "-dColorImageDownsampleType=/Bicubic",
            "-dGrayImageDownsampleType=/Bicubic",
            f"-dColorImageResolution={resolution}",
            f"-dGrayImageResolution={resolution}",
            f"-dJPEGQ={jpeg_quality}",
            f"-sOutputFile={output_path}",
            str(input_path),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=90,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        try:
            return output_path.read_bytes()
        except OSError:
            return None


def optimize_pdf(data: bytes, *, target_size_bytes: int | None = None) -> bytes:
    try:
        import pikepdf
    except ImportError as exc:  # pragma: no cover - deployment guard
        raise RuntimeError("pikepdf is required for PDF optimization") from exc

    try:
        with pikepdf.Pdf.open(BytesIO(data)) as pdf:
            original_page_count = len(pdf.pages)
            if _has_digital_signature(pdf):
                raise ValueError(
                    "Digitally signed PDFs cannot be compressed without invalidating the signature"
                )
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
    # Pikepdf is lossless and is preferred. Image-heavy scans often need
    # downsampling as a second stage; keep the least aggressive candidate that
    # reaches the target, or the smallest valid candidate if none does.
    if target_size_bytes and len(optimized) > target_size_bytes:
        best = optimized
        for resolution, quality in ((200, 84), (150, 78)):
            candidate = _ghostscript_candidate(
                optimized, resolution=resolution, jpeg_quality=quality
            )
            if not candidate or len(candidate) >= len(best):
                continue
            try:
                if _page_count(candidate) != original_page_count:
                    continue
            except (pikepdf.PdfError, ValueError):
                continue
            best = candidate
            if len(best) <= target_size_bytes:
                break
        optimized = best
    return optimized
