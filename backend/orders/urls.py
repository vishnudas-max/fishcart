from django.urls import path

from .views import CustomerOrderDetailView, CustomerOrderListCreateView

urlpatterns = [
    path("", CustomerOrderListCreateView.as_view(), name="order-list-create"),
    path("<int:pk>/", CustomerOrderDetailView.as_view(), name="order-detail"),
]
