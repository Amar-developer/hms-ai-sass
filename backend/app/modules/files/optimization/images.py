from io import BytesIO

from app.modules.files.optimization.profiles import OptimizationProfile


MAX_DECODED_PIXELS = 40_000_000


def optimize_image(data: bytes, profile: OptimizationProfile) -> tuple[bytes, str, str]:
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
    except ImportError as exc:  # pragma: no cover - deployment guard
        raise RuntimeError("Pillow is required for image optimization") from exc

    try:
        with Image.open(BytesIO(data)) as source:
            if getattr(source, "is_animated", False):
                raise ValueError("Animated images are not supported for documents")
            source.load()
            if source.width * source.height > MAX_DECODED_PIXELS:
                raise ValueError("Image dimensions exceed the safe processing limit")
            image = ImageOps.exif_transpose(source)
            image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Image is corrupted or cannot be decoded") from exc

    max_dimension = profile.max_dimension
    if max_dimension and max(image.size) > max_dimension:
        resampling = (
            Image.Resampling.NEAREST
            if profile.name == "qr_code"
            else Image.Resampling.LANCZOS
        )
        image.thumbnail((max_dimension, max_dimension), resampling)

    output_format = profile.output_format or "PNG"
    output = BytesIO()
    if output_format == "JPEG":
        if image.mode in {"RGBA", "LA"}:
            background = Image.new("RGB", image.size, "white")
            alpha = image.getchannel("A")
            background.paste(image.convert("RGB"), mask=alpha)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
        image.save(
            output,
            format="JPEG",
            quality=profile.quality or 82,
            optimize=True,
            progressive=True,
        )
        return output.getvalue(), "image/jpeg", ".jpg"

    if image.mode == "P":
        image = image.convert("RGBA")
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue(), "image/png", ".png"
