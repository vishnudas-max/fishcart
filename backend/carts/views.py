from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Cart, CartItem
from .serializers import CartItemCreateSerializer, CartItemSerializer, CartItemUpdateSerializer, CartSerializer
from .services import add_item, update_item


def load_cart(user):
    cart, _ = Cart.objects.get_or_create(user=user)
    return Cart.objects.prefetch_related("items__selected_options__option", "items__product__category").get(pk=cart.pk)


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CartSerializer(load_cart(request.user), context={"request": request}).data)


class CartItemListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CartItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = add_item(request.user, **serializer.validated_data)
        return Response(CartItemSerializer(item, context={"request": request}).data, status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, item_id):
        item = get_object_or_404(CartItem.objects.select_related("product__category").prefetch_related("selected_options__option"), pk=item_id, cart__user=request.user)
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = update_item(item, **serializer.validated_data)
        item = CartItem.objects.select_related("product__category").prefetch_related("selected_options__option").get(pk=item.pk)
        return Response(CartItemSerializer(item, context={"request": request}).data)

    def delete(self, request, item_id):
        item = get_object_or_404(CartItem, pk=item_id, cart__user=request.user)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
