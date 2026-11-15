from django.urls import path

from .views import CustomerDeliveryAreaView, CustomerOrderDetailView, CustomerOrderListCreateView

urlpatterns = [
    path("delivery-area/", CustomerDeliveryAreaView.as_view(), name="delivery-area"),
    path("", CustomerOrderListCreateView.as_view(), name="order-list-create"),
    path("<int:pk>/", CustomerOrderDetailView.as_view(), name="order-detail"),
]
