import hashlib
import hmac
import secrets
from email import encoders
from email.mime.base import MIMEBase
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import LoginOTP


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def digest_otp(email: str, code: str) -> str:
    material = f"{email}:{code}".encode()
    return hmac.new(settings.OTP_PEPPER.encode(), material, hashlib.sha256).hexdigest()


def create_login_otp(email: str) -> str:
    code = generate_otp()
    now = timezone.now()
    LoginOTP.objects.filter(email=email, consumed_at__isnull=True).update(consumed_at=now)
    LoginOTP.objects.create(email=email, code_digest=digest_otp(email, code), expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS))
    return code


@transaction.atomic
def verify_login_otp(email: str, code: str) -> bool:
    now = timezone.now()
    otp = LoginOTP.objects.select_for_update().filter(email=email, consumed_at__isnull=True, expires_at__gt=now).order_by("-created_at").first()
    if otp is None or otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        return False
    otp.attempts += 1
    valid = hmac.compare_digest(otp.code_digest, digest_otp(email, code))
    if valid:
        otp.consumed_at = now
    otp.save(update_fields=["attempts", "consumed_at"])
    return valid


def send_login_otp_email(email: str, code: str) -> None:
    """Email adapter; never write the recipient or OTP to application logs."""
    from pathlib import Path

    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string

    expiry_minutes = max(1, (settings.OTP_TTL_SECONDS + 59) // 60)
    logo_path = Path(__file__).parent / "email_assets" / "thatt-logo.webp"
    context = {"code": code, "expiry_minutes": expiry_minutes, "brand_name": "തട്ട്", "has_logo": logo_path.is_file()}
    message = EmailMultiAlternatives(
        subject="Your തട്ട് sign-in code",
        body=render_to_string("users/emails/otp.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    message.attach_alternative(render_to_string("users/emails/otp.html", context), "text/html")

    # Attach the logo inline when its optional email asset is present. Keeping
    # this as a local asset avoids external image requests from mail clients.
    if logo_path.is_file():
        logo = MIMEBase("image", "webp")
        logo.set_payload(logo_path.read_bytes())
        encoders.encode_base64(logo)
        logo.add_header("Content-ID", "<thatt-logo>")
        logo.add_header("Content-Disposition", "inline", filename="thatt-logo.webp")
        message.attach(logo)
    if message.send(fail_silently=False) != 1:
        raise RuntimeError("The login email could not be sent.")
