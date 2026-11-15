from decimal import Decimal
from types import SimpleNamespace
from tempfile import TemporaryDirectory
import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError

from carts.models import Cart, CartItem
from catalog.models import Category, Product
from users.models import Address

from .models import DeliveryServiceArea, Order, OrderItem
from .serializers import AdminOrderUpdateSerializer
from .services import create_order, haversine_km, transition_order_status, validate_delivery_location


class DeliveryAreaTests(TestCase):
    def test_haversine_distance_is_in_kilometres(self):
        self.assertAlmostEqual(haversine_km(0, 0, 0, 1), 111.195, delta=0.1)

    def test_missing_market_origin_fails_closed(self):
        address = SimpleNamespace(latitude=Decimal("9.93"), longitude=Decimal("76.26"))
        with self.assertRaisesMessage(ValidationError, "Delivery location has not been configured"):
            validate_delivery_location(address)

    def test_out_of_range_address_is_rejected(self):
        DeliveryServiceArea.objects.create(latitude=Decimal("9.931200"), longitude=Decimal("76.267300"), radius_km=Decimal("50"))
        address = SimpleNamespace(latitude=Decimal("10.600000"), longitude=Decimal("76.267300"))
        with self.assertRaisesMessage(ValidationError, "outside our 50.00 km delivery area"):
            validate_delivery_location(address)

    def test_in_range_address_is_accepted(self):
        DeliveryServiceArea.objects.create(latitude=Decimal("9.931200"), longitude=Decimal("76.267300"), radius_km=Decimal("50"))
        address = SimpleNamespace(latitude=Decimal("9.940000"), longitude=Decimal("76.270000"))
        self.assertLess(validate_delivery_location(address), 50)


class OrderAdminFlowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="customer", phone_number="+919876543210", password="unused")
        self.order = Order.objects.create(user=self.user, address_snapshot={"address_line1": "Test"})
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        media_settings = override_settings(MEDIA_ROOT=self.media.name)
        media_settings.enable()
        self.addCleanup(media_settings.disable)

    def make_product(self, *, available=Decimal("2.000")):
        category = Category.objects.create(name="Fish", slug=f"fish-{self.user.pk}", kind=Category.Kind.FISH)
        return Product.objects.create(category=category, name="Sardine", slug=f"sardine-{self.user.pk}",
            image=SimpleUploadedFile("sardine.png", b"test-image", content_type="image/png"),
            price_per_unit=Decimal("200.00"), unit=Product.Unit.KG, fish_type=Product.FishType.SEA,
            available_quantity=available, minimum_quantity=Decimal("0.500"), quantity_step=Decimal("0.500"))

    def test_new_order_defaults_to_confirmed(self):
        self.assertEqual(self.order.status, Order.Status.CONFIRMED)

    def test_cancellation_requires_predefined_reason(self):
        serializer = AdminOrderUpdateSerializer(data={"status": Order.Status.CANCELLED})
        self.assertFalse(serializer.is_valid())
        self.assertIn("cancellation_reason", serializer.errors)

    def test_cancel_records_customer_message(self):
        cancelled = transition_order_status(order_id=self.order.pk, status=Order.Status.CANCELLED, cancellation_reason=Order.CancellationReason.OUT_OF_STOCK)
        self.assertEqual(cancelled.cancellation_reason, Order.CancellationReason.OUT_OF_STOCK)
        self.assertTrue(cancelled.cancellation_message)

    def test_cancelling_reserved_order_restores_stock(self):
        product = self.make_product(available=Decimal("0.000"))
        self.order.stock_reserved = True
        self.order.save(update_fields=["stock_reserved", "updated_at"])
        OrderItem.objects.create(order=self.order, product=product, product_name=product.name, unit="kg", quantity=Decimal("0.500"), unit_price=Decimal("200.00"), product_subtotal=Decimal("100.00"), gst_amount=Decimal("0.00"))
        transition_order_status(order_id=self.order.pk, status=Order.Status.CANCELLED, cancellation_reason=Order.CancellationReason.OUT_OF_STOCK)
        product.refresh_from_db()
        self.assertEqual(product.available_quantity, Decimal("0.500"))

    def test_order_placement_confirms_and_reserves_stock(self):
        self.order.delete()
        product = self.make_product()
        address = Address.objects.create(user=self.user, recipient_name="Customer", phone_number=self.user.phone_number,
            address_line1="1 Market Road", city="Kochi", state="Kerala", postal_code="682001",
            latitude=Decimal("9.940000"), longitude=Decimal("76.270000"))
        DeliveryServiceArea.objects.create(latitude=Decimal("9.931200"), longitude=Decimal("76.267300"), radius_km=Decimal("50"))
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, product=product, product_name=product.name, unit="kg", quantity=Decimal("0.500"), unit_price=product.price_per_unit)
        placed = create_order(user=self.user, address=address, fulfillment_type=Order.FulfillmentType.ASAP)
        product.refresh_from_db()
        self.assertEqual(placed.status, Order.Status.CONFIRMED)
        self.assertEqual(product.available_quantity, Decimal("1.500"))
        self.assertFalse(CartItem.objects.filter(cart=cart).exists())

    @override_settings(ORDER_NOTIFICATION_PROVIDER="disabled")
    def test_notifications_can_be_disabled(self):
        from .notifications import send_admin_order_notification
        self.assertFalse(send_admin_order_notification(self.order.pk))

    @override_settings(ORDER_NOTIFICATION_PROVIDER="telegram", TELEGRAM_BOT_TOKEN="test-token", TELEGRAM_ADMIN_CHAT_ID="12345")
    @patch("orders.notifications.urlopen")
    def test_telegram_message_includes_order_address_and_map(self, urlopen):
        response = MagicMock(status=200)
        response.read.return_value = b'{"ok":true}'
        urlopen.return_value.__enter__.return_value = response
        from .notifications import send_admin_order_notification
        self.assertTrue(send_admin_order_notification(self.order.pk))
        payload = json.loads(urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertIn("New order #", payload["text"])
        self.assertIn("Address: Test", payload["text"])
        self.assertIn("Map: Location pin unavailable", payload["text"])
