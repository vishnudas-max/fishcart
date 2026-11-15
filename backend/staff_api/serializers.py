from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from catalog.models import Category, ProcessingOption, Product
from orders.models import DeliveryServiceArea
from users.models import Address

User = get_user_model()


class StaffDeliveryServiceAreaSerializer(serializers.ModelSerializer):
    configured = serializers.SerializerMethodField()
    class Meta:
        model = DeliveryServiceArea
        fields = ("latitude", "longitude", "radius_km", "configured", "updated_at")
        read_only_fields = ("configured", "updated_at")
    def get_configured(self, obj):
        return obj.latitude is not None and obj.longitude is not None


class StaffLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=256, write_only=True, trim_whitespace=False)


class StaffUserSerializer(serializers.ModelSerializer):
    address_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "phone_number", "phone_verified_at", "is_active", "date_joined", "address_count")


class StaffAddressSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Address
        fields = ("id", "user_id", "username", "label", "recipient_name", "phone_number", "address_line1", "address_line2", "landmark", "city", "state", "postal_code", "country_code", "latitude", "longitude", "is_default", "created_at")


class StaffCategorySerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    parent_name = serializers.CharField(source="parent.name", read_only=True)

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "kind", "parent", "parent_name", "description", "image", "gst_rate", "is_active", "sort_order")

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc


class StaffProductSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    is_fish = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "slug", "description", "image", "category", "category_name", "price_per_unit", "unit", "fish_type", "available_quantity", "minimum_quantity", "quantity_step", "is_active", "is_featured", "is_fish", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc


class StaffProcessingOptionSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(required=False, allow_blank=True)
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ProcessingOption
        fields = ("id", "name", "slug", "category", "category_name", "price_per_kg", "gst_rate", "is_active", "sort_order")

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc

    def update(self, instance, validated_data):
        try:
            return super().update(instance, validated_data)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc


class StaffUserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()
