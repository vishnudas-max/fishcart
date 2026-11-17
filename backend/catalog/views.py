from django.db.models import Avg, Count, Prefetch, Q
from django.db import IntegrityError, transaction
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination

from .models import Category, Product, ProductReview
from .serializers import CategorySerializer, ProductQuerySerializer, ProductReviewSerializer, ProductSerializer


class ProductPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class CategoryListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(is_active=True, parent__isnull=True).prefetch_related(Prefetch("children", queryset=Category.objects.filter(is_active=True)))


class ProductListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = ProductSerializer
    pagination_class = ProductPagination

    def get_queryset(self):
        params = ProductQuerySerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        filters = params.validated_data
        queryset = Product.objects.filter(is_active=True, category__is_active=True).filter(Q(category__parent__isnull=True) | Q(category__parent__is_active=True)).select_related("category", "category__parent").annotate(review_count=Count("reviews", filter=Q(reviews__is_visible=True)), average_rating=Avg("reviews__rating", filter=Q(reviews__is_visible=True)))
        if filters.get("category"):
            category = Category.objects.filter(slug=filters["category"], is_active=True).first()
            if not category:
                return queryset.none()
            if category.parent_id is None:
                queryset = queryset.filter(Q(category=category) | Q(category__parent=category))
            else:
                queryset = queryset.filter(category=category)
        if filters.get("subcategory"):
            queryset = queryset.filter(category__slug=filters["subcategory"], category__parent__isnull=False)
        if filters.get("fish_type"):
            queryset = queryset.filter(fish_type=filters["fish_type"])
        if filters.get("min_price") is not None:
            queryset = queryset.filter(price_per_unit__gte=filters["min_price"])
        if filters.get("max_price") is not None:
            queryset = queryset.filter(price_per_unit__lte=filters["max_price"])
        if filters.get("search"):
            term = filters["search"].strip()
            queryset = queryset.filter(Q(name__icontains=term) | Q(description__icontains=term) | Q(category__name__icontains=term))
        return queryset.order_by(filters.get("ordering", "-created_at"))


class ProductDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = ProductSerializer
    queryset = Product.objects.filter(is_active=True, category__is_active=True).filter(Q(category__parent__isnull=True) | Q(category__parent__is_active=True)).select_related("category", "category__parent").annotate(review_count=Count("reviews", filter=Q(reviews__is_visible=True)), average_rating=Avg("reviews__rating", filter=Q(reviews__is_visible=True)))
    lookup_field = "slug"


class ProductReviewListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductReviewSerializer

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "POST" else [AllowAny()]

    def get_product(self):
        if not hasattr(self, "_product"):
            self._product = Product.objects.filter(slug=self.kwargs["slug"], is_active=True).first()
            if self._product is None:
                from django.http import Http404
                raise Http404
        return self._product

    def get_queryset(self):
        queryset = ProductReview.objects.filter(product=self.get_product()).select_related("user")
        if self.request.user.is_authenticated:
            return queryset.filter(Q(is_visible=True) | Q(user=self.request.user))
        return queryset.filter(is_visible=True)

    def perform_create(self, serializer):
        product = self.get_product()
        from orders.models import Order
        has_completed_purchase = Order.objects.filter(user=self.request.user, status=Order.Status.COMPLETED, items__product=product).exists()
        if not has_completed_purchase:
            raise PermissionDenied("You can review this product after a completed purchase.")
        if ProductReview.objects.filter(product=product, user=self.request.user).exists():
            raise ValidationError({"detail": "You have already reviewed this product. Update your existing review instead."})
        try:
            with transaction.atomic():
                serializer.save(product=product, user=self.request.user)
        except IntegrityError as exc:
            raise ValidationError({"detail": "You have already reviewed this product."}) from exc


class ProductReviewDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductReviewSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "put", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return ProductReview.objects.filter(user=self.request.user).select_related("user")
