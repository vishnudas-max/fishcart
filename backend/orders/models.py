from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Order(models.Model):
    class FulfillmentType(models.TextChoices):
        ASAP = "asap", "As soon as possible"
        PREORDER = "preorder", "Preorder"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        PREPARING = "preparing", "Preparing"
        READY = "ready", "Ready for delivery"
        OUT_FOR_DELIVERY = "out_for_delivery", "Out for delivery"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    class CancellationReason(models.TextChoices):
        OUT_OF_STOCK = "out_of_stock", "An item is unavailable"
        DELIVERY_UNAVAILABLE = "delivery_unavailable", "Delivery is unavailable"
        OPERATIONAL_ISSUE = "operational_issue", "Unexpected operational issue"
        CUSTOMER_REQUEST = "customer_request", "Customer requested cancellation"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    address = models.ForeignKey("users.Address", null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    address_snapshot = models.JSONField()
    fulfillment_type = models.CharField(max_length=12, choices=FulfillmentType.choices, default=FulfillmentType.ASAP, db_index=True)
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CONFIRMED, db_index=True)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    gst_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    delivery_fee = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    stock_reserved = models.BooleanField(default=False)
    customer_note = models.CharField(max_length=500, blank=True)
    staff_note = models.CharField(max_length=1000, blank=True)
    cancellation_reason = models.CharField(max_length=32, choices=CancellationReason.choices, blank=True)
    cancellation_message = models.CharField(max_length=240, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["fulfillment_type", "status", "scheduled_for"])]
        constraints = [models.CheckConstraint(condition=(models.Q(fulfillment_type="preorder", scheduled_for__isnull=False) | models.Q(fulfillment_type="asap", scheduled_for__isnull=True)), name="order_schedule_matches_fulfillment")]

    def clean(self):
        if self.fulfillment_type == self.FulfillmentType.PREORDER:
            if self.scheduled_for is None:
                raise ValidationError({"scheduled_for": "A preorder requires a scheduled date and time."})
            if timezone.is_naive(self.scheduled_for):
                raise ValidationError({"scheduled_for": "Include a timezone offset for the scheduled date and time."})
            previous = None
            if self.pk:
                previous = Order.objects.filter(pk=self.pk).values_list("scheduled_for", flat=True).first()
            if (not self.pk or previous != self.scheduled_for) and self.scheduled_for <= timezone.now():
                raise ValidationError({"scheduled_for": "Preorders must be scheduled for a future date and time."})
        elif self.scheduled_for is not None:
            raise ValidationError({"scheduled_for": "Only preorders can have a scheduled date and time."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_preorder(self):
        return self.fulfillment_type == self.FulfillmentType.PREORDER

    def __str__(self):
        return f"Order #{self.pk} — {self.get_status_display()}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="order_items")
    product_name = models.CharField(max_length=180)
    unit = models.CharField(max_length=8)
    quantity = models.DecimalField(max_digits=8, decimal_places=3)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    product_subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    processing_subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    processing_gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    @property
    def total(self):
        return self.product_subtotal + self.processing_subtotal + self.gst_amount + self.processing_gst_amount

    @property
    def gst_total(self):
        return self.gst_amount + self.processing_gst_amount

    def __str__(self):
        return f"{self.quantity} {self.unit} {self.product_name}"


class OrderItemOption(models.Model):
    item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=80)
    price_per_kg = models.DecimalField(max_digits=8, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    def __str__(self):
        return self.name


class DeliveryServiceArea(models.Model):
    """Singleton delivery origin and configurable maximum delivery radius."""
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    radius_km = models.DecimalField(max_digits=7, decimal_places=2, default=Decimal("50.00"))
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        from django.core.exceptions import ValidationError
        if (self.latitude is None) != (self.longitude is None):
            raise ValidationError("Set both market latitude and longitude, or leave both empty.")
        if self.radius_km <= 0:
            raise ValidationError({"radius_km": "Delivery radius must be greater than zero."})

    def save(self, *args, **kwargs):
        self.pk = 1
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Delivery area ({self.radius_km} km)"
