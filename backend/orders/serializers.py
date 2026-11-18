import re

from rest_framework import serializers

from .models import DeliveryServiceArea, Order, OrderItem, OrderItemOption


class DeliveryServiceAreaSerializer(serializers.ModelSerializer):
    configured = serializers.SerializerMethodField()
    class Meta:
        model = DeliveryServiceArea
        fields = ("latitude", "longitude", "max_delivery_distance_km", "free_delivery_km", "delivery_fee_per_km", "configured", "updated_at")
        read_only_fields = ("configured", "updated_at")
    def get_configured(self, obj):
        return obj.latitude is not None and obj.longitude is not None


class OrderItemOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItemOption
        fields = ("name", "price_per_kg", "subtotal", "gst_rate", "gst_amount")


class OrderItemSerializer(serializers.ModelSerializer):
    options = OrderItemOptionSerializer(many=True, read_only=True)

    class Meta:
        model = OrderItem
        fields = ("id", "product", "product_name", "unit", "quantity", "unit_price", "product_subtotal", "processing_subtotal", "gst_rate", "gst_amount", "processing_gst_amount", "gst_total", "total", "options")


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True, allow_null=True)
    email = serializers.EmailField(source="user.email", read_only=True, allow_null=True)
    is_preorder = serializers.BooleanField(read_only=True)
    cancellation_reason_label = serializers.CharField(source="get_cancellation_reason_display", read_only=True)

    class Meta:
        model = Order
        fields = ("id", "user_id", "username", "email", "phone_number", "address_snapshot", "fulfillment_type", "is_preorder", "scheduled_for", "status", "subtotal", "gst_total", "delivery_distance_km", "delivery_free_distance_km", "delivery_fee_per_km", "delivery_fee", "total", "stock_reserved", "customer_note", "staff_note", "cancellation_reason", "cancellation_reason_label", "cancellation_message", "items", "created_at", "updated_at")
        read_only_fields = fields


class DeliveryQuoteSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(min_value=1, required=False)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90, required=False)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180, required=False)

    def validate(self, attrs):
        has_saved_address = "address_id" in attrs
        has_latitude = "latitude" in attrs
        has_longitude = "longitude" in attrs
        if has_saved_address and (has_latitude or has_longitude):
            raise serializers.ValidationError("Provide a saved address ID or map coordinates, not both.")
        if not has_saved_address and has_latitude != has_longitude:
            raise serializers.ValidationError("Provide both latitude and longitude.")
        if not has_saved_address and not has_latitude:
            raise serializers.ValidationError("A saved address or pinned map coordinates are required.")
        return attrs


class OrderCreateSerializer(serializers.Serializer):
    address_id = serializers.IntegerField(min_value=1)
    fulfillment_type = serializers.ChoiceField(choices=Order.FulfillmentType.choices, default=Order.FulfillmentType.ASAP)
    scheduled_for = serializers.DateTimeField(required=False, allow_null=True)
    customer_note = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_scheduled_for(self, value):
        raw = self.initial_data.get("scheduled_for")
        if isinstance(raw, str) and not re.search(r"(?:Z|[+-]\d{2}:\d{2})$", raw):
            raise serializers.ValidationError("Include a timezone offset, such as Z or +05:30.")
        return value

    def validate(self, attrs):
        is_preorder = attrs["fulfillment_type"] == Order.FulfillmentType.PREORDER
        scheduled_for = attrs.get("scheduled_for")
        if is_preorder and scheduled_for is None:
            raise serializers.ValidationError({"scheduled_for": "Choose a date and time for this preorder."})
        if not is_preorder and scheduled_for is not None:
            raise serializers.ValidationError({"scheduled_for": "Scheduled time is only used for preorders."})
        return attrs


class AdminOrderUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices, required=False)
    staff_note = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    cancellation_reason = serializers.ChoiceField(choices=Order.CancellationReason.choices, required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide status and/or staff_note.")
        if attrs.get("status") == Order.Status.CANCELLED and not attrs.get("cancellation_reason"):
            raise serializers.ValidationError({"cancellation_reason": "Choose a predefined reason when cancelling an order."})
        if attrs.get("cancellation_reason") and attrs.get("status") != Order.Status.CANCELLED:
            raise serializers.ValidationError({"cancellation_reason": "A cancellation reason is only valid when cancelling."})
        return attrs
