from django.contrib import admin

from .models import Category, ProcessingOption, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "parent", "is_active", "sort_order")
    list_filter = ("kind", "is_active")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "fish_type", "price_per_unit", "unit", "available_quantity", "is_active", "is_featured")
    list_filter = ("is_active", "is_featured", "fish_type", "unit", "category")
    search_fields = ("name", "slug", "description")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProcessingOption)
class ProcessingOptionAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "price_per_kg", "is_active", "sort_order")
    list_filter = ("is_active", "category")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
