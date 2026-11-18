import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


class OTPVerifySerializer(OTPRequestSerializer):
    code = serializers.RegexField(r"^\d{6}$")
    username = serializers.CharField(max_length=150, required=False, validators=User._meta.get_field("username").validators)

    def validate(self, attrs):
        username = attrs.get("username")
        if username and User.objects.filter(username__iexact=username).exclude(email=attrs["email"]).exists():
            raise serializers.ValidationError({"username": "This username is unavailable."})
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    default_address = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "email_verified_at", "first_name", "last_name", "phone_number", "phone_verified_at", "profile_photo", "default_address")
        read_only_fields = ("id", "email", "email_verified_at", "phone_verified_at")

    def validate_phone_number(self, value):
        if value in (None, ""):
            return None
        normalized = value.strip()
        if not re.fullmatch(r"\+[1-9]\d{7,14}", normalized):
            raise serializers.ValidationError("Enter a phone number in E.164 format, such as +14155552671.")
        duplicate = User.objects.filter(phone_number=normalized).exclude(pk=self.instance.pk).exists()
        if duplicate:
            raise serializers.ValidationError("This phone number is already used by another account.")
        return normalized

    def get_default_address(self, user):
        address = user.addresses.filter(is_default=True).first()
        if address is None:
            return None
        return AddressSerializer(address, context=self.context).data

    def validate_username(self, value):
        normalized = value.strip()
        if User.objects.filter(username__iexact=normalized).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This username is unavailable.")
        return normalized


from .models import Address


class AddressSerializer(serializers.ModelSerializer):
    phone_number = serializers.RegexField(r"^\+[1-9]\d{7,14}$", max_length=16)

    class Meta:
        model = Address
        exclude = ("user",)
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        lat = attrs.get("latitude", getattr(self.instance, "latitude", None))
        lng = attrs.get("longitude", getattr(self.instance, "longitude", None))
        if (lat is None) != (lng is None):
            raise serializers.ValidationError("Latitude and longitude must be provided together.")
        return attrs
import re
