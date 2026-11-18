from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_PIXELS = 40_000_000
SUPPORTED_FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}


def validate_catalog_image(upload):
    image_stream = None
    try:
        FileExtensionValidator(SUPPORTED_FORMATS)(upload)
        if upload.size > 10 * 1024 * 1024:
            raise ValidationError("Product images must be 10 MB or smaller.")
        upload.seek(0)
        image_stream = BytesIO(upload.read())
        with Image.open(image_stream) as image:
            extension = upload.name.rsplit(".", 1)[-1].lower()
            if image.format != SUPPORTED_FORMATS[extension]:
                raise ValidationError("The image contents must match the selected file type.")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValidationError("Product images must be 40 megapixels or smaller.")
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValidationError("Upload a valid JPG, PNG, or WebP image.") from exc
    finally:
        if image_stream is not None:
            image_stream.close()
        if hasattr(upload, "seek") and not getattr(upload, "closed", False):
            upload.seek(0)
