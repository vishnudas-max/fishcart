import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import LoginOTP


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def digest_otp(phone_number: str, code: str) -> str:
    material = f"{phone_number}:{code}".encode()
    return hmac.new(settings.OTP_PEPPER.encode(), material, hashlib.sha256).hexdigest()


def create_login_otp(phone_number: str) -> str:
    code = generate_otp()
    now = timezone.now()
    LoginOTP.objects.filter(phone_number=phone_number, consumed_at__isnull=True).update(consumed_at=now)
    LoginOTP.objects.create(phone_number=phone_number, code_digest=digest_otp(phone_number, code), expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS))
    return code


@transaction.atomic
def verify_login_otp(phone_number: str, code: str) -> bool:
    now = timezone.now()
    otp = LoginOTP.objects.select_for_update().filter(phone_number=phone_number, consumed_at__isnull=True, expires_at__gt=now).order_by("-created_at").first()
    if otp is None or otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        return False
    otp.attempts += 1
    valid = hmac.compare_digest(otp.code_digest, digest_otp(phone_number, code))
    if valid:
        otp.consumed_at = now
    otp.save(update_fields=["attempts", "consumed_at"])
    return valid


def send_sms(phone_number: str, message: str) -> None:
    """Provider boundary. Authentication flow does not depend on an SMS SDK."""
    print(settings.SMS_PROVIDER)
    if settings.SMS_PROVIDER == "console":
        if not settings.DEBUG:
            raise RuntimeError("Console SMS delivery is only allowed in development")
        # Local console output is the development delivery channel for the OTP.
        print(f"[DEV SMS] {phone_number}: {message}", flush=True)
        return
    if settings.SMS_PROVIDER == "twilio":
        from twilio.rest import Client
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not (settings.TWILIO_MESSAGING_SERVICE_SID or settings.TWILIO_FROM_NUMBER):
            raise RuntimeError("Twilio credentials and a sender are required")
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        options = {"to": phone_number, "body": "sms_2fa"}
        if settings.TWILIO_MESSAGING_SERVICE_SID:
            options["messaging_service_sid"] = settings.TWILIO_MESSAGING_SERVICE_SID
        else:
            options["from_"] = settings.TWILIO_FROM_NUMBER
        client.messages.create(**options)
        # Do not log recipient, OTP body, Twilio credentials, or message identifiers.
        print("message sent via Twilio", message)
        print("[TWILIO SMS] Message accepted by provider", flush=True)
        return
    raise ValueError(f"Unsupported SMS_PROVIDER: {settings.SMS_PROVIDER}")
