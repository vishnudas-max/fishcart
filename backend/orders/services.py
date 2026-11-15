from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import math
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product
from carts.models import Cart, CartItem

from .models import DeliveryServiceArea, Order, OrderItem, OrderItemOption

MONEY = Decimal("0.01")
logger = logging.getLogger(__name__)

CANCELLATION_MESSAGES = {
    Order.CancellationReason.OUT_OF_STOCK: "An item in your order is no longer available. We’ve cancelled the order and will contact you about the next steps.",
    Order.CancellationReason.DELIVERY_UNAVAILABLE: "We’re unable to deliver to your location at the selected time. We’ve cancelled the order; please contact us if you need help.",
    Order.CancellationReason.OPERATIONAL_ISSUE: "We’re unable to complete your order due to an unexpected operational issue. We’re sorry for the inconvenience.",
    Order.CancellationReason.CUSTOMER_REQUEST: "Your order was cancelled as requested.",
}


def haversine_km(latitude_a, longitude_a, latitude_b, longitude_b):
    lat1, lat2 = math.radians(float(latitude_a)), math.radians(float(latitude_b))
    d_lat = lat2 - lat1
    d_lon = math.radians(float(longitude_b) - float(longitude_a))
    value = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, value)))


def validate_delivery_location(address):
    area = DeliveryServiceArea.objects.filter(pk=1).first()
    if not area or area.latitude is None or area.longitude is None:
        raise ValidationError({"delivery": "Delivery location has not been configured yet. Please try again later."})
    if address.latitude is None or address.longitude is None:
        raise ValidationError({"address": "Pin this address on the map to check delivery availability."})
    distance = haversine_km(area.latitude, area.longitude, address.latitude, address.longitude)
    if distance > float(area.radius_km):
        raise ValidationError({"delivery": f"This address is outside our {area.radius_km} km delivery area."})
    return distance


def _tax_amount(amount, rate):
    return (amount * rate / Decimal("100")).quantize(MONEY, rounding=ROUND_HALF_UP)


TRANSITIONS = {
    Order.Status.PENDING: {Order.Status.CONFIRMED, Order.Status.CANCELLED},
    Order.Status.CONFIRMED: {Order.Status.PREPARING, Order.Status.CANCELLED},
    Order.Status.PREPARING: {Order.Status.READY, Order.Status.CANCELLED},
    Order.Status.READY: {Order.Status.OUT_FOR_DELIVERY, Order.Status.CANCELLED},
    Order.Status.OUT_FOR_DELIVERY: {Order.Status.COMPLETED, Order.Status.CANCELLED},
    Order.Status.COMPLETED: set(),
    Order.Status.CANCELLED: set(),
}


def _address_snapshot(address):
    return {
        "recipient_name": address.recipient_name,
        "label": address.label,
        "phone_number": address.phone_number,
        "address_line1": address.address_line1,
        "address_line2": address.address_line2,
        "landmark": address.landmark,
        "city": address.city,
        "state": address.state,
        "postal_code": address.postal_code,
        "country_code": address.country_code,
        "latitude": str(address.latitude) if address.latitude is not None else None,
        "longitude": str(address.longitude) if address.longitude is not None else None,
    }


@transaction.atomic
def create_order(*, user, address, fulfillment_type, scheduled_for=None, customer_note=""):
    validate_delivery_location(address)
    cart = Cart.objects.select_for_update().filter(user=user).first()
    if cart is None:
        raise ValidationError({"cart": "Your cart is empty."})
    items = list(CartItem.objects.select_for_update(of=("self",)).filter(cart=cart).select_related("product", "product__category", "product__category__parent").prefetch_related("selected_options__option"))
    if not items:
        raise ValidationError({"cart": "Your cart is empty."})

    is_preorder = fulfillment_type == Order.FulfillmentType.PREORDER
    if is_preorder and (scheduled_for is None or scheduled_for <= timezone.now()):
        raise ValidationError({"scheduled_for": "Choose a date and time in the future for your preorder."})
    if not is_preorder and scheduled_for is not None:
        raise ValidationError({"scheduled_for": "A scheduled time is only valid for a preorder."})

    product_ids = sorted({item.product_id for item in items})
    products = {product.pk: product for product in Product.objects.select_for_update(of=("self",)).filter(pk__in=product_ids).select_related("category", "category__parent").order_by("pk")}
    quantities = defaultdict(lambda: Decimal("0"))
    for item in items:
        product = products.get(item.product_id)
        if not product or not product.is_active or not product.category.is_active:
            raise ValidationError({"cart": f"{item.product_name} is no longer available. Remove it before checkout."})
        quantities[product.pk] += item.quantity

    if not is_preorder:
        for product_id, quantity in quantities.items():
            product = products[product_id]
            if quantity > product.available_quantity:
                raise ValidationError({"cart": f"Not enough stock for {product.name}."})

    order = Order(
        user=user,
        address=address,
        address_snapshot=_address_snapshot(address),
        fulfillment_type=fulfillment_type,
        scheduled_for=scheduled_for,
        status=Order.Status.CONFIRMED,
        customer_note=customer_note,
        stock_reserved=not is_preorder,
    )
    try:
        order.full_clean()
    except DjangoValidationError as exc:
        raise ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc
    order.save()

    subtotal = Decimal("0.00")
    gst_total = Decimal("0.00")
    for cart_item in items:
        product = products[cart_item.product_id]
        product_amount = cart_item.product_subtotal
        product_gst_rate = product.category.gst_rate
        product_gst_amount = _tax_amount(product_amount, product_gst_rate)
        option_snapshots = list(cart_item.selected_options.all())
        processing_amount = cart_item.processing_subtotal
        processing_gst_amount = Decimal("0.00")
        order_item = OrderItem.objects.create(
            order=order,
            product=product,
            product_name=cart_item.product_name,
            unit=cart_item.unit,
            quantity=cart_item.quantity,
            unit_price=cart_item.unit_price,
            product_subtotal=product_amount,
            processing_subtotal=processing_amount,
            gst_rate=product_gst_rate,
            gst_amount=product_gst_amount,
        )
        for option in option_snapshots:
            option_total = (option.price_per_kg * cart_item.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            option_gst_rate = option.option.gst_rate if option.option_id else option.gst_rate
            option_gst = _tax_amount(option_total, option_gst_rate)
            processing_gst_amount += option_gst
            OrderItemOption.objects.create(item=order_item, name=option.name, price_per_kg=option.price_per_kg, subtotal=option_total, gst_rate=option_gst_rate, gst_amount=option_gst)
        order_item.processing_gst_amount = processing_gst_amount
        order_item.save(update_fields=["processing_gst_amount"])
        subtotal += product_amount + processing_amount
        gst_total += product_gst_amount + processing_gst_amount
    order.subtotal = subtotal
    order.gst_total = gst_total
    order.delivery_fee = Decimal("0.00")
    order.total = subtotal + gst_total + order.delivery_fee
    order.save(update_fields=["subtotal", "gst_total", "delivery_fee", "total", "updated_at"])
    if not is_preorder:
        for product_id, quantity in quantities.items():
            product = products[product_id]
            product.available_quantity -= quantity
            product.save(update_fields=["available_quantity", "updated_at"])
    CartItem.objects.filter(cart=cart).delete()
    transaction.on_commit(lambda order_id=order.pk: _notify_admin_safely(order_id))
    return order


def _notify_admin_safely(order_id):
    try:
        from .notifications import send_admin_order_notification
        send_admin_order_notification(order_id)
    except Exception:
        # Notification failures must not turn a committed order into a failed checkout response.
        logger.exception("Admin order notification failed for order_id=%s", order_id)


@transaction.atomic
def transition_order_status(*, order_id, status, cancellation_reason=""):
    order = Order.objects.select_for_update().get(pk=order_id)
    if status not in TRANSITIONS.get(order.status, set()):
        raise ValidationError({"status": f"Cannot move an order from {order.status} to {status}."})
    if status == Order.Status.CANCELLED:
        if cancellation_reason not in CANCELLATION_MESSAGES:
            raise ValidationError({"cancellation_reason": "Choose a predefined cancellation reason."})
        order.cancellation_reason = cancellation_reason
        order.cancellation_message = CANCELLATION_MESSAGES[cancellation_reason]
    if status == Order.Status.CANCELLED and order.stock_reserved:
        items = list(order.items.select_for_update().filter(product__isnull=False).order_by("product_id"))
        quantities = defaultdict(lambda: Decimal("0"))
        for item in items:
            quantities[item.product_id] += item.quantity
        products = Product.objects.select_for_update().filter(pk__in=sorted(quantities)).order_by("pk")
        for product in products:
            product.available_quantity += quantities[product.pk]
            product.save(update_fields=["available_quantity", "updated_at"])
        order.stock_reserved = False
    order.status = status
    order.save(update_fields=["status", "stock_reserved", "cancellation_reason", "cancellation_message", "updated_at"])
    return order
