from django.db.models import Prefetch, Q
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.pagination import PageNumberPagination

from .models import Category, Product
from .serializers import CategorySerializer, ProductQuerySerializer, ProductSerializer


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
        queryset = Product.objects.filter(is_active=True, category__is_active=True).filter(Q(category__parent__isnull=True) | Q(category__parent__is_active=True)).select_related("category", "category__parent")
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
    queryset = Product.objects.filter(is_active=True, category__is_active=True).filter(Q(category__parent__isnull=True) | Q(category__parent__is_active=True)).select_related("category", "category__parent")
    lookup_field = "slug"
