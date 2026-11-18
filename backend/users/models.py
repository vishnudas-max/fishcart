import re

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator

from .validators import validate_profile_image


class UserManager(DjangoUserManager):
    """Normalize optional profile phone numbers while Django manages users."""

    use_in_migrations = True

    def _require_unique_phone_number(self, extra_fields):
        phone_number = (extra_fields.get("phone_number") or "").strip()
        if not phone_number:
            extra_fields["phone_number"] = None
            return
        if not re.fullmatch(r"\+[1-9]\d{7,14}", phone_number):
            raise ValueError("A valid phone_number in E.164 format is required (for example, +14155552671).")
        if self.model._default_manager.filter(phone_number=phone_number).exists():
            raise ValueError("A user with this phone number already exists. Use that account or provide another phone number.")
        extra_fields["phone_number"] = phone_number

    def create_user(self, username, email=None, password=None, **extra_fields):
        email = email.strip().lower() if email else None
        self._require_unique_phone_number(extra_fields)
        return super().create_user(username, email=email, password=password, **extra_fields)

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        email = email.strip().lower() if email else None
        self._require_unique_phone_number(extra_fields)
        return super().create_superuser(username, email=email, password=password, **extra_fields)


class User(AbstractUser):
    """Application user; Django's AbstractUser supplies the abstract auth base."""
    email = models.EmailField(max_length=254, unique=True, null=True, blank=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_number = models.CharField(max_length=16, unique=True, db_index=True, null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)  # legacy verification metadata
    profile_photo = models.ImageField(upload_to="profiles/%Y/%m/", blank=True, validators=[validate_profile_image])
    objects = UserManager()

    # Django's createsuperuser prompts for these fields after USERNAME_FIELD.
    REQUIRED_FIELDS = []

    def save(self, *args, **kwargs):
        original_email = self.email
        self.email = self.email.strip().lower() if self.email else None
        update_fields = kwargs.get("update_fields")
        if update_fields is not None and original_email != self.email:
            kwargs["update_fields"] = set(update_fields) | {"email"}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email or self.phone_number or self.username


class LoginOTP(models.Model):
    email = models.EmailField(max_length=254, db_index=True)
    code_digest = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["email", "created_at"], name="users_login_email_created_idx")]

    def __str__(self):
        return "Email login OTP"


class Address(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=40, default="Home")
    recipient_name = models.CharField(max_length=120)
    phone_number = models.CharField(max_length=16)
    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    landmark = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20)
    country_code = models.CharField(max_length=2, default="IN")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, validators=[MinValueValidator(-180), MaxValueValidator(180)])
    is_default = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "-updated_at"]
        constraints = [models.UniqueConstraint(fields=["user"], condition=models.Q(is_default=True), name="one_default_address_per_user")]

    def __str__(self):
        return f"{self.label} — {self.city}"
