from rest_framework import serializers
from decimal import Decimal, ROUND_HALF_UP

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    selected_options = serializers.SerializerMethodField()
    product_subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    processing_subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    image = serializers.ImageField(source="product.image", read_only=True)
    gst_rate = serializers.DecimalField(source="product.category.gst_rate", max_digits=5, decimal_places=2, read_only=True)
    product_gst = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    processing_gst = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gst_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ("id", "product", "product_name", "image", "unit", "quantity", "preorder_eligible", "unit_price", "product_subtotal", "gst_rate", "product_gst", "selected_options", "processing_subtotal", "processing_gst", "gst_total", "total")
        read_only_fields = fields

    def get_selected_options(self, obj):
        rows = []
        for option in obj.selected_options.all():
            subtotal = (option.price_per_kg * obj.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            rate = option.option.gst_rate if option.option_id else option.gst_rate
            gst_amount = (subtotal * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            rows.append({"id": option.option_id, "name": option.name, "price_per_kg": option.price_per_kg, "gst_rate": rate, "subtotal": subtotal, "gst_amount": gst_amount})
        return rows


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gst_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    delivery_fee = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Cart
        fields = ("id", "items", "subtotal", "gst_total", "delivery_fee", "total", "created_at", "updated_at")


class CartItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(min_value=1)
    quantity = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal("0.001"))
    processing_option_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, default=list)
    preorder_eligible = serializers.BooleanField(required=False, default=False)


class CartItemUpdateSerializer(serializers.Serializer):
    quantity = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal("0.001"), required=False)
    processing_option_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    preorder_eligible = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Provide quantity and/or processing_option_ids.")
        return attrs
