from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def validate_profile_image(upload):
    FileExtensionValidator(["jpg", "jpeg", "png", "webp"])(upload)
    if upload.size > MAX_IMAGE_BYTES:
        raise ValidationError("Image must be 5 MB or smaller.")
