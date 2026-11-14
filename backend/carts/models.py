from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import models


class Cart(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def subtotal(self):
        return sum((line.subtotal for line in self.items.all()), Decimal("0.00"))

    @property
    def gst_total(self):
        return sum((line.gst_total for line in self.items.all()), Decimal("0.00"))

    @property
    def delivery_fee(self):
        return Decimal("0.00")

    @property
    def total(self):
        return self.subtotal + self.gst_total + self.delivery_fee

    def __str__(self):
        return f"Cart for {self.user_id}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="cart_items")
    product_name = models.CharField(max_length=180)
    unit = models.CharField(max_length=8)
    quantity = models.DecimalField(max_digits=8, decimal_places=3)
    preorder_eligible = models.BooleanField(default=False)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def product_subtotal(self):
        return (self.quantity * self.unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def processing_subtotal(self):
        if self.unit != "kg":
            return Decimal("0.00")
        return sum(((option.price_per_kg * self.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for option in self.selected_options.all()), Decimal("0.00"))

    @property
    def total(self):
        return self.subtotal + self.gst_total

    @property
    def subtotal(self):
        return self.product_subtotal + self.processing_subtotal

    @property
    def product_gst(self):
        rate = self.product.category.gst_rate
        return (self.product_subtotal * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @property
    def processing_gst(self):
        total = Decimal("0.00")
        for option in self.selected_options.all():
            charge = (option.price_per_kg * self.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            rate = option.option.gst_rate if option.option_id else option.gst_rate
            total += (charge * rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return total

    @property
    def gst_total(self):
        return self.product_gst + self.processing_gst

    def __str__(self):
        return f"{self.quantity} {self.unit} {self.product_name}"


class CartItemOption(models.Model):
    item = models.ForeignKey(CartItem, on_delete=models.CASCADE, related_name="selected_options")
    option = models.ForeignKey("catalog.ProcessingOption", null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=80)
    price_per_kg = models.DecimalField(max_digits=8, decimal_places=2)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        constraints = [models.UniqueConstraint(fields=["item", "option"], condition=models.Q(option__isnull=False), name="unique_option_per_cart_item")]

    def __str__(self):
        return self.name
