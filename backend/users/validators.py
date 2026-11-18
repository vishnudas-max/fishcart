from django.core.exceptions import ValidationError
from catalog.validators import validate_catalog_image

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def validate_profile_image(upload):
    if upload.size > MAX_IMAGE_BYTES:
        raise ValidationError("Image must be 5 MB or smaller.")
    try:
        validate_catalog_image(upload)
    except ValidationError as exc:
        raise ValidationError(exc.messages) from exc
