from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Address

from .models import Order
from .serializers import OrderCreateSerializer, OrderSerializer
from .services import create_order


class CustomerOrderListCreateView(generics.ListCreateAPIView):
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
    serializer_class = OrderSerializer
    lookup_field = "pk"

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items__options").select_related("address")
