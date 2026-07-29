from dataclasses import dataclass

from app.modules.files.optimization.images import optimize_image
from app.modules.files.optimization.pdfs import optimize_pdf
from app.modules.files.optimization.profiles import OptimizationProfile


class OptimizationError(ValueError):
    pass


@dataclass(frozen=True)
class OptimizationResult:
    data: bytes
    content_type: str
    extension: str
    profile: str
    changed: bool


def optimize_document(
    *, data: bytes, content_type: str, profile: OptimizationProfile
) -> OptimizationResult:
    if not data:
        raise OptimizationError("Document is empty")
    if profile.minimum_size_bytes and len(data) < profile.minimum_size_bytes:
        return OptimizationResult(
            data=data,
            content_type=content_type,
            extension=".pdf" if profile.kind == "pdf" else "",
            profile=profile.name,
            changed=False,
        )
    try:
        if profile.kind == "image":
            optimized, optimized_type, extension = optimize_image(data, profile)
        elif profile.kind == "pdf":
            optimized = optimize_pdf(data)
            optimized_type = "application/pdf"
            extension = ".pdf"
        else:
            raise OptimizationError("Unsupported optimization profile")
    except (RuntimeError, ValueError) as exc:
        raise OptimizationError(str(exc)) from exc

    changed = optimized != data and len(optimized) < len(data)
    if not changed:
        if profile.maximum_size_bytes and len(data) > profile.maximum_size_bytes:
            raise OptimizationError(
                f"Document exceeds the {profile.maximum_size_bytes // (1024 * 1024)} MB limit"
            )
        return OptimizationResult(
            data=data,
            content_type=content_type,
            extension=".pdf" if profile.kind == "pdf" else extension,
            profile=profile.name,
            changed=False,
        )
    if profile.maximum_size_bytes and len(optimized) > profile.maximum_size_bytes:
        raise OptimizationError(
            f"Optimized document exceeds the {profile.maximum_size_bytes // (1024 * 1024)} MB limit"
        )
    return OptimizationResult(
        data=optimized,
        content_type=optimized_type,
        extension=extension,
        profile=profile.name,
        changed=True,
    )
