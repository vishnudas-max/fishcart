from decimal import Decimal

from rest_framework import serializers

from .models import Category, ProcessingOption, Product


class ProcessingOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessingOption
        fields = ("id", "name", "slug", "price_per_kg", "gst_rate")


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ("id", "name", "slug", "kind", "parent", "description", "image", "gst_rate", "children")

    def get_children(self, obj):
        return CategorySerializer(obj.children.all(), many=True, context=self.context).data


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    processing_options = serializers.SerializerMethodField()
    is_fish = serializers.BooleanField(read_only=True)
    gst_rate = serializers.DecimalField(max_digits=5, decimal_places=2, source="category.gst_rate", read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "slug", "description", "image", "category", "price_per_unit", "unit", "fish_type", "available_quantity", "minimum_quantity", "quantity_step", "is_fish", "gst_rate", "processing_options")

    def get_processing_options(self, obj):
        if not obj.is_fish:
            return []
        root = obj.category.parent or obj.category
        return ProcessingOptionSerializer(root.processing_options.filter(is_active=True), many=True).data


class ProductQuerySerializer(serializers.Serializer):
    category = serializers.SlugField(required=False)
    subcategory = serializers.SlugField(required=False)
    fish_type = serializers.ChoiceField(choices=Product.FishType.choices, required=False)
    min_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False)
    max_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False)
    search = serializers.CharField(max_length=100, required=False, allow_blank=False)
    ordering = serializers.ChoiceField(choices=("name", "-name", "price_per_unit", "-price_per_unit", "-created_at"), required=False)

    def validate(self, attrs):
        if attrs.get("min_price") is not None and attrs.get("max_price") is not None and attrs["min_price"] > attrs["max_price"]:
            raise serializers.ValidationError({"max_price": "Must be greater than or equal to min_price."})
        return attrs
