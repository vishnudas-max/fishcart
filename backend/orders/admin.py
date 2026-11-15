from django.contrib import admin

from .models import DeliveryServiceArea, Order, OrderItem, OrderItemOption


class OrderItemOptionInline(admin.TabularInline):
    model = OrderItemOption
    extra = 0
    can_delete = False
    readonly_fields = ("name", "price_per_kg", "subtotal")


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ("product", "product_name", "unit", "quantity", "unit_price", "product_subtotal", "processing_subtotal")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "fulfillment_type", "scheduled_for", "status", "total", "created_at")
    list_filter = ("fulfillment_type", "status", "created_at", "scheduled_for")
    search_fields = ("user__username", "user__phone_number", "id")
    readonly_fields = ("user", "address", "address_snapshot", "fulfillment_type", "scheduled_for", "status", "total", "stock_reserved", "customer_note", "staff_note", "cancellation_message", "created_at", "updated_at")
    inlines = (OrderItemInline,)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user", "address")


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "product_name", "quantity", "unit", "unit_price", "product_subtotal", "processing_subtotal")
    list_select_related = ("order", "product")
    inlines = (OrderItemOptionInline,)
    readonly_fields = ("order", "product", "product_name", "unit", "quantity", "unit_price", "product_subtotal", "processing_subtotal")


@admin.register(DeliveryServiceArea)
class DeliveryServiceAreaAdmin(admin.ModelAdmin):
    list_display = ("latitude", "longitude", "radius_km", "updated_at")
    fields = ("latitude", "longitude", "radius_km", "updated_at")
    readonly_fields = ("updated_at",)
    def has_add_permission(self, request):
        return not DeliveryServiceArea.objects.exists() and super().has_add_permission(request)
    def has_delete_permission(self, request, obj=None):
        return False
