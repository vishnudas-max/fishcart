from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth import get_user_model

from .models import Address

User = get_user_model()


@admin.register(User)
class AppUserAdmin(UserAdmin):
    list_display = ("username", "phone_number", "phone_verified_at", "is_staff", "is_active")
    search_fields = ("username", "phone_number")
    fieldsets = UserAdmin.fieldsets + (("Contact", {"fields": ("phone_number", "phone_verified_at", "profile_photo")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Contact", {"fields": ("phone_number",)}),)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ("label", "recipient_name", "phone_number", "city", "user", "is_default")
    list_filter = ("country_code", "state", "is_default")
    search_fields = ("recipient_name", "phone_number", "city", "postal_code", "user__username", "user__phone_number")
    readonly_fields = ("created_at", "updated_at")
