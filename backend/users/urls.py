from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CSRFView, CurrentUserView, LogoutView, OTPRequestView, OTPVerifyView, RefreshView
from .views import AddressViewSet

router = DefaultRouter()
router.register("addresses", AddressViewSet, basename="address")

urlpatterns = [
    path("csrf/", CSRFView.as_view(), name="csrf-cookie"),
    path("otp/request/", OTPRequestView.as_view(), name="otp-request"),
    path("otp/verify/", OTPVerifyView.as_view(), name="otp-verify"),
    path("refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("", include(router.urls)),
]
