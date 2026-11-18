from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from users.models import Address

from .models import DeliveryServiceArea, Order
from .serializers import DeliveryQuoteSerializer, DeliveryServiceAreaSerializer, OrderCreateSerializer, OrderSerializer
from .services import create_order, quote_delivery_location


class CustomerOrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items__options").select_related("address")

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        address = get_object_or_404(Address, pk=data["address_id"], user=request.user)
        order = create_order(user=request.user, address=address, fulfillment_type=data["fulfillment_type"], scheduled_for=data.get("scheduled_for"), customer_note=data.get("customer_note", ""))
        return Response(OrderSerializer(order, context={"request": request}).data, status=status.HTTP_201_CREATED)


class CustomerOrderDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    lookup_field = "pk"

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items__options").select_related("address")


class CustomerDeliveryAreaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        area = DeliveryServiceArea.objects.filter(pk=1).first()
        if area is None:
            return Response({"latitude": None, "longitude": None, "max_delivery_distance_km": "50.00", "free_delivery_km": "5.00", "delivery_fee_per_km": "10.00", "configured": False})
        return Response(DeliveryServiceAreaSerializer(area).data)


class CustomerDeliveryQuoteView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "delivery_quote"

    def post(self, request):
        serializer = DeliveryQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "address_id" in data:
            address = get_object_or_404(Address, pk=data["address_id"], user=request.user)
            latitude, longitude = address.latitude, address.longitude
        else:
            latitude, longitude = data["latitude"], data["longitude"]
        quote = quote_delivery_location(latitude, longitude)
        return Response(quote)
