"""Replaceable adapters for order alerts sent to staff messaging providers."""
import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.utils import timezone

from .models import Order

logger = logging.getLogger(__name__)


def _order_message(order):
    address = order.address_snapshot
    coordinates = (address.get("latitude"), address.get("longitude"))
    map_url = f"https://www.openstreetmap.org/?mlat={coordinates[0]}&mlon={coordinates[1]}#map=15/{coordinates[0]}/{coordinates[1]}" if all(coordinates) else "Location pin unavailable"
    items = []
    for item in order.items.all():
        options = ", ".join(option.name for option in item.options.all())
        line = f"• {item.quantity} {item.unit} {item.product_name}"
        if options:
            line += f" ({options})"
        items.append(line)
    address_text = ", ".join(str(address.get(key) or "") for key in (
        "address_line1", "address_line2", "landmark", "city", "state", "postal_code", "country_code",
    )).strip(", ")
    fulfillment = "Preorder" if order.is_preorder else "Order now"
    if order.scheduled_for:
        fulfillment += f" · {timezone.localtime(order.scheduled_for).strftime('%d %b %Y, %I:%M %p %Z')}"
    lines = [
        f"New order #{order.pk} — {order.get_status_display()}",
        f"Customer: {order.user.username} · {order.user.email} · {order.user.phone_number or 'No profile phone'}",
        f"Fulfilment: {fulfillment}",
        "Items:", *(items or ["• (no items)"]),
        f"Subtotal: INR {order.subtotal:.2f}",
        f"GST: INR {order.gst_total:.2f}",
        f"Delivery: INR {order.delivery_fee:.2f}",
        f"Total: INR {order.total:.2f}",
        f"Deliver to: {address.get('recipient_name') or ''} · {address.get('phone_number') or ''}",
        f"Address: {address_text or 'Not provided'}",
        f"Coordinates: {coordinates[0] or '—'}, {coordinates[1] or '—'}",
        f"Map: {map_url}",
    ]
    if order.delivery_distance_km is not None:
        lines.insert(-4, f"Straight-line distance: {order.delivery_distance_km:.2f} km · first {order.delivery_free_distance_km:.2f} km free · INR {order.delivery_fee_per_km:.2f}/km thereafter")
    if order.customer_note:
        lines.append(f"Customer note: {order.customer_note}")
    # Telegram allows 4096 characters; leave room for provider-side formatting.
    return "\n".join(lines)[:3900]


def _load_order(order_id):
    return Order.objects.select_related("user").prefetch_related("items__options").get(pk=order_id)


def send_admin_order_telegram(order_id):
    """Send a plain-text order alert with address, coordinates, and map URL."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_ADMIN_CHAT_ID
    if not token or not chat_id:
        logger.warning("Telegram order notifications are enabled but bot credentials are incomplete.")
        return False
    payload = {"chat_id": chat_id, "text": _order_message(_load_order(order_id)), "disable_web_page_preview": True}
    try:
        request = Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
            return response.status == 200 and result.get("ok") is True
    except (HTTPError, URLError, TimeoutError, ValueError):
        # The Telegram bot token is embedded in its endpoint URL. Never log the URL or exception.
        logger.warning("Telegram order notification failed for order_id=%s", order_id)
        return False


def send_admin_order_whatsapp(order_id):
    """Send through Meta Cloud API; requires configured credentials and approved template."""
    required = (settings.WHATSAPP_ACCESS_TOKEN, settings.WHATSAPP_PHONE_NUMBER_ID,
                settings.WHATSAPP_ADMIN_PHONE, settings.WHATSAPP_ORDER_TEMPLATE)
    if not all(required):
        logger.warning("WhatsApp order notifications are enabled but required settings are incomplete.")
        return False
    recipient = re.sub(r"\D", "", settings.WHATSAPP_ADMIN_PHONE)
    if not re.fullmatch(r"[1-9]\d{7,14}", recipient):
        logger.warning("WhatsApp order notification recipient is not in international phone format.")
        return False
    order = _load_order(order_id)
    address = order.address_snapshot
    coordinates = (address.get("latitude"), address.get("longitude"))
    map_link = f"https://www.openstreetmap.org/?mlat={coordinates[0]}&mlon={coordinates[1]}#map=15/{coordinates[0]}/{coordinates[1]}" if all(coordinates) else "Location pin unavailable"
    item_lines = []
    for item in order.items.all():
        options = ", ".join(option.name for option in item.options.all())
        item_lines.append(f"{item.quantity} {item.unit} {item.product_name}" + (f" ({options})" if options else ""))
    fulfillment = "Preorder" if order.is_preorder else "Order now"
    if order.scheduled_for:
        fulfillment += f" for {timezone.localtime(order.scheduled_for).strftime('%d %b %Y, %I:%M %p %Z')}"
    if order.customer_note:
        fulfillment += f"; note: {order.customer_note}"
    values = [str(order.pk), order.user.username, order.user.email or "Email unavailable",
              ", ".join(str(address.get(key) or "") for key in ("address_line1", "address_line2", "landmark", "city", "state", "postal_code", "country_code"))[:900],
              map_link, ("; ".join(item_lines) + f". {fulfillment}")[:900], f"INR {order.total:.2f}"]
    payload = {"messaging_product": "whatsapp", "to": recipient,
               "type": "template", "template": {"name": settings.WHATSAPP_ORDER_TEMPLATE,
               "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
               "components": [{"type": "body", "parameters": [{"type": "text", "text": value} for value in values]}]}}
    try:
        request = Request(
            f"https://graph.facebook.com/{settings.WHATSAPP_GRAPH_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            return 200 <= response.status < 300
    except (HTTPError, URLError, TimeoutError):
        logger.warning("WhatsApp provider request failed for order_id=%s", order_id)
        return False


def send_admin_order_notification(order_id):
    """Select the configured provider; provider SDK/API details stay behind adapters."""
    provider = settings.ORDER_NOTIFICATION_PROVIDER
    if provider == "telegram":
        return send_admin_order_telegram(order_id)
    if provider == "whatsapp":
        return send_admin_order_whatsapp(order_id)
    if provider == "disabled":
        return False
    logger.error("Unsupported order notification provider configured.")
    return False
