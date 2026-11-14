from django.contrib import admin

from .models import Cart, CartItem, CartItemOption


class CartItemOptionInline(admin.TabularInline):
    model = CartItemOption
    extra = 0
    can_delete = False


class CartItemInline(admin.TabularInline):
    model = CartItem
    extra = 0
    show_change_link = True


@admin.register(Cart)
class CartAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "updated_at")
    search_fields = ("user__username", "user__phone_number")
    inlines = (CartItemInline,)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ("product_name", "cart", "quantity", "unit", "unit_price")
    list_select_related = ("cart", "product")
    inlines = (CartItemOptionInline,)
