from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator


def validate_catalog_image(upload):
    FileExtensionValidator(["jpg", "jpeg", "png", "webp"])(upload)
    if upload.size > 10 * 1024 * 1024:
        raise ValidationError("Product images must be 10 MB or smaller.")
