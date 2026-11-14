from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    StaffAddressViewSet,
    StaffCSRFView,
    StaffCategoryViewSet,
    StaffDashboardStatsView,
    StaffLoginView,
    StaffLogoutView,
    StaffMeView,
    StaffOrderViewSet,
    StaffProductViewSet,
    StaffProcessingOptionViewSet,
    StaffUserViewSet,
)

router = DefaultRouter()
router.register("categories", StaffCategoryViewSet, basename="staff-category")
router.register("products", StaffProductViewSet, basename="staff-product")
router.register("processing-options", StaffProcessingOptionViewSet, basename="staff-processing-option")
router.register("users", StaffUserViewSet, basename="staff-user")
router.register("addresses", StaffAddressViewSet, basename="staff-address")
router.register("orders", StaffOrderViewSet, basename="staff-order")

urlpatterns = [
    path("csrf/", StaffCSRFView.as_view(), name="staff-csrf"),
    path("login/", StaffLoginView.as_view(), name="staff-login"),
    path("logout/", StaffLogoutView.as_view(), name="staff-logout"),
    path("me/", StaffMeView.as_view(), name="staff-me"),
    path("dashboard/", StaffDashboardStatsView.as_view(), name="staff-dashboard"),
    path("", include(router.urls)),
]
