from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.db.models import Count, Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework.authentication import SessionAuthentication

from carts.models import Cart
from catalog.models import Category, ProcessingOption, Product
from orders.models import DeliveryServiceArea, Order
from orders.serializers import AdminOrderUpdateSerializer, OrderSerializer
from orders.services import transition_order_status
from users.models import Address

from .permissions import IsActiveStaff
from .serializers import (
    StaffCategorySerializer,
    StaffDeliveryServiceAreaSerializer,
    StaffAddressSerializer,
    StaffLoginSerializer,
    StaffProcessingOptionSerializer,
    StaffProductSerializer,
    StaffUserSerializer,
    StaffUserStatusSerializer,
)

User = get_user_model()


class StaffLoginThrottle(AnonRateThrottle):
    scope = "staff_login"


class StaffCSRFView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class StaffLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [StaffLoginThrottle]

    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        serializer = StaffLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request, username=serializer.validated_data["username"], password=serializer.validated_data["password"])
        if user is None or not user.is_active or not user.is_staff:
            return Response({"detail": "Invalid staff username or password."}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        return Response({"id": user.pk, "username": user.username, "is_superuser": user.is_superuser})


class StaffLogoutView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffMeView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]

    def get(self, request):
        return Response({"id": request.user.pk, "username": request.user.username, "is_superuser": request.user.is_superuser})


class StaffPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class StaffModelViewSet(viewsets.ModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]
    pagination_class = StaffPagination

    def perform_destroy(self, instance):
        # Keep catalog references stable; staff can archive records instead of deleting history.
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class StaffCategoryViewSet(StaffModelViewSet):
    serializer_class = StaffCategorySerializer
    queryset = Category.objects.select_related("parent").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        return queryset


class StaffProductViewSet(StaffModelViewSet):
    serializer_class = StaffProductSerializer
    queryset = Product.objects.select_related("category", "category__parent").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        category_id = self.request.query_params.get("category")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        active = self.request.query_params.get("is_active")
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        return queryset


class StaffProcessingOptionViewSet(StaffModelViewSet):
    serializer_class = StaffProcessingOptionSerializer
    queryset = ProcessingOption.objects.select_related("category").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category_id=category)
        return queryset


class StaffUserViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]
    serializer_class = StaffUserSerializer
    pagination_class = StaffPagination
    queryset = User.objects.filter(is_staff=False).annotate(address_count=Count("addresses", distinct=True)).order_by("-date_joined")

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(username__icontains=search) | Q(email__icontains=search) | Q(phone_number__icontains=search))
        return queryset

    @action(detail=True, methods=["patch"], url_path="status")
    def update_status(self, request, pk=None):
        user = self.get_object()
        serializer = StaffUserStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if user.pk == request.user.pk and not serializer.validated_data["is_active"]:
            raise PermissionDenied("You cannot deactivate your own staff account.")
        if user.is_superuser and not request.user.is_superuser:
            raise PermissionDenied("Only a superuser can change another superuser's status.")
        user.is_active = serializer.validated_data["is_active"]
        user.save(update_fields=["is_active"])
        return Response(StaffUserSerializer(self.get_queryset().get(pk=user.pk)).data)


class StaffAddressViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]
    serializer_class = StaffAddressSerializer
    pagination_class = StaffPagination
    queryset = Address.objects.select_related("user").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        search = request.query_params.get("search", "").strip()
        queryset = self.get_queryset()
        if search:
            queryset = queryset.filter(Q(user__username__icontains=search) | Q(phone_number__icontains=search) | Q(city__icontains=search) | Q(postal_code__icontains=search))
        page = self.paginate_queryset(queryset)
        data = StaffAddressSerializer(page, many=True).data if page is not None else StaffAddressSerializer(queryset, many=True).data
        return self.get_paginated_response(data) if page is not None else Response(data)


class StaffOrderViewSet(viewsets.ReadOnlyModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]
    serializer_class = OrderSerializer
    pagination_class = StaffPagination
    queryset = Order.objects.select_related("user", "address").prefetch_related("items__options").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        preorder = self.request.query_params.get("preorder")
        if preorder in {"true", "1"}:
            queryset = queryset.filter(fulfillment_type=Order.FulfillmentType.PREORDER)
        elif preorder in {"false", "0"}:
            queryset = queryset.filter(fulfillment_type=Order.FulfillmentType.ASAP)
        elif preorder:
            raise ValidationError({"preorder": "Use true or false."})
        status_value = self.request.query_params.get("status")
        if status_value:
            valid_statuses = {choice for choice, _ in Order.Status.choices}
            if status_value not in valid_statuses:
                raise ValidationError({"status": "Unknown order status."})
            queryset = queryset.filter(status=status_value)
        search = self.request.query_params.get("search", "").strip()
        if search:
            search_filter = Q(user__username__icontains=search) | Q(user__email__icontains=search) | Q(user__phone_number__icontains=search) | Q(items__product_name__icontains=search)
            if search.isdecimal():
                search_filter |= Q(pk=int(search))
            queryset = queryset.filter(search_filter).distinct()
        return queryset

    @action(detail=True, methods=["patch"], url_path="manage")
    @transaction.atomic
    def manage(self, request, pk=None):
        order = self.get_object()
        serializer = AdminOrderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data
        if "status" in changes:
            order = transition_order_status(order_id=order.pk, status=changes["status"], cancellation_reason=changes.get("cancellation_reason", ""))
        if "staff_note" in changes:
            order.staff_note = changes["staff_note"]
            order.save(update_fields=["staff_note", "updated_at"])
        order = self.get_queryset().get(pk=order.pk)
        return Response(OrderSerializer(order, context={"request": request}).data)


class StaffDeliveryServiceAreaView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]

    def get_object(self):
        area, _ = DeliveryServiceArea.objects.get_or_create(pk=1)
        return area

    def get(self, request):
        return Response(StaffDeliveryServiceAreaSerializer(self.get_object()).data)

    def patch(self, request):
        area = self.get_object()
        serializer = StaffDeliveryServiceAreaSerializer(area, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StaffDashboardStatsView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsActiveStaff]

    def get(self, request):
        return Response({
            "active_products": Product.objects.filter(is_active=True).count(),
            "active_categories": Category.objects.filter(is_active=True).count(),
            "customers": User.objects.filter(is_staff=False).count(),
            "open_orders": Order.objects.exclude(status__in=[Order.Status.COMPLETED, Order.Status.CANCELLED]).count(),
            "pending_preorders": Order.objects.filter(fulfillment_type=Order.FulfillmentType.PREORDER).exclude(status__in=[Order.Status.COMPLETED, Order.Status.CANCELLED]).count(),
            "active_carts": Cart.objects.filter(items__isnull=False).distinct().count(),
        })
