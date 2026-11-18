from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.viewsets import ModelViewSet
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import Address
from .serializers import AddressSerializer, CurrentUserSerializer, OTPRequestSerializer, OTPVerifySerializer
from .services import create_login_otp, send_login_otp_email, verify_login_otp

User = get_user_model()


class OTPRequestThrottle(AnonRateThrottle):
    scope = "otp_request"


class OTPVerifyThrottle(AnonRateThrottle):
    scope = "otp_verify"


def set_refresh_cookie(response, token):
    response.set_cookie(settings.JWT_REFRESH_COOKIE_NAME, str(token), max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()), httponly=True, secure=settings.JWT_COOKIE_SECURE, samesite=settings.JWT_COOKIE_SAMESITE, domain=settings.JWT_COOKIE_DOMAIN, path="/api/auth/")


class OTPRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = create_login_otp(email)
        send_login_otp_email(email, code)
        return Response({"detail": "If the email is eligible, a verification code has been sent."}, status=status.HTTP_202_ACCEPTED)


class OTPVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email, code = serializer.validated_data["email"], serializer.validated_data["code"]
        if not verify_login_otp(email, code):
            return Response({"detail": "Invalid or expired verification code."}, status=status.HTTP_400_BAD_REQUEST)
        requested_username = serializer.validated_data.get("username")
        user = User.objects.filter(email__iexact=email).first()
        if user and (not user.is_active or user.is_staff):
            return Response({"detail": "Invalid or expired verification code."}, status=status.HTTP_400_BAD_REQUEST)
        created = user is None
        if created:
            base = requested_username or slugify(email.split("@", 1)[0]) or "customer"
            username = base[:150]
            suffix = 1
            while User.objects.filter(username__iexact=username).exists():
                tail = f"{suffix}"
                username = f"{base[:150-len(tail)]}{tail}"
                suffix += 1
            user = User.objects.create_user(username=username, email=email)
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at"])
        refresh = RefreshToken.for_user(user)
        profile_photo = request.build_absolute_uri(user.profile_photo.url) if user.profile_photo else None
        response = Response({"access": str(refresh.access_token), "user": {"id": user.pk, "username": user.username, "email": user.email, "phone_number": user.phone_number, "first_name": user.first_name, "last_name": user.last_name, "profile_photo": profile_photo}}, status=status.HTTP_200_OK)
        set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]

    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if not raw_refresh:
            return Response({"detail": "Refresh token is missing."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw_refresh)
            access = str(refresh.access_token)
            response = Response({"access": access})
            if settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"]:
                refresh.blacklist()
                user = User.objects.get(pk=refresh["user_id"], is_active=True)
                set_refresh_cookie(response, RefreshToken.for_user(user))
            return response
        except (TokenError, User.DoesNotExist):
            response = Response({"detail": "Refresh token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
            response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, path="/api/auth/")
            return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, path="/api/auth/")
        return response


class CurrentUserView(generics.RetrieveUpdateAPIView):
    """Return or update the authenticated user's profile username."""
    permission_classes = [IsAuthenticated]
    serializer_class = CurrentUserSerializer

    def get_object(self):
        return self.request.user


class AddressViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        user = User.objects.select_for_update().get(pk=self.request.user.pk)
        make_default = serializer.validated_data.get("is_default", False) or not Address.objects.filter(user=user).exists()
        if make_default:
            Address.objects.filter(user=user, is_default=True).update(is_default=False)
        serializer.save(user=user, is_default=make_default)

    @transaction.atomic
    def perform_update(self, serializer):
        user = User.objects.select_for_update().get(pk=self.request.user.pk)
        make_default = serializer.validated_data.get("is_default", serializer.instance.is_default)
        if make_default:
            Address.objects.filter(user=user, is_default=True).exclude(pk=serializer.instance.pk).update(is_default=False)
            serializer.save(is_default=True)
        else:
            serializer.save()
            has_default = Address.objects.filter(user=user, is_default=True).exists()
            if not has_default:
                replacement = Address.objects.filter(user=user).exclude(pk=serializer.instance.pk).order_by("-updated_at").first()
                if replacement:
                    replacement.is_default = True
                    replacement.save(update_fields=["is_default", "updated_at"])

    @transaction.atomic
    def perform_destroy(self, instance):
        user = User.objects.select_for_update().get(pk=self.request.user.pk)
        was_default = instance.is_default
        instance.delete()
        if was_default:
            replacement = Address.objects.filter(user=user).order_by("-updated_at").first()
            if replacement:
                replacement.is_default = True
                replacement.save(update_fields=["is_default", "updated_at"])

    @action(detail=True, methods=["post"], url_path="set-default")
    @transaction.atomic
    def set_default(self, request, pk=None):
        address = self.get_object()
        user = User.objects.select_for_update().get(pk=request.user.pk)
        Address.objects.filter(user=user, is_default=True).exclude(pk=address.pk).update(is_default=False)
        address.is_default = True
        address.save(update_fields=["is_default", "updated_at"])
        return Response(AddressSerializer(address, context={"request": request}).data)


class CSRFView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"detail": "CSRF cookie set."})
