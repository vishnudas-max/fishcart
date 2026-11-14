from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError as APIValidationError

from catalog.models import Category, ProcessingOption, Product

from .models import Cart, CartItem, CartItemOption


def _validate_quantity(product, quantity, *, check_stock=True):
    if quantity < product.minimum_quantity:
        raise APIValidationError({"quantity": f"Choose at least {product.minimum_quantity} {product.unit}."})
    if product.quantity_step and (quantity - product.minimum_quantity) % product.quantity_step != Decimal("0"):
        raise APIValidationError({"quantity": f"Quantity must follow increments of {product.quantity_step} {product.unit}."})
    if check_stock and quantity > product.available_quantity:
        raise APIValidationError({"quantity": "The requested quantity is currently unavailable."})


def _validated_options(product, option_ids):
    option_ids = list(option_ids or [])
    if len(option_ids) != len(set(option_ids)):
        raise APIValidationError({"processing_option_ids": "Duplicate options are not allowed."})
    root = product.category.parent or product.category
    if root.kind != Category.Kind.FISH:
        if option_ids:
            raise APIValidationError({"processing_option_ids": "Processing options are only available for fish."})
        return []
    options = list(ProcessingOption.objects.filter(pk__in=option_ids, category=root, is_active=True))
    if len(options) != len(option_ids):
        raise APIValidationError({"processing_option_ids": "One or more options are unavailable for this product."})
    return options


def _validate_cart_stock(cart, product, quantity, exclude_item_id=None):
    lines = cart.items.filter(product=product)
    if exclude_item_id:
        lines = lines.exclude(pk=exclude_item_id)
    existing_quantity = sum(lines.values_list("quantity", flat=True), Decimal("0"))
    if existing_quantity + quantity > product.available_quantity:
        raise APIValidationError({"quantity": "Your cart quantity exceeds the available stock."})


@transaction.atomic
def add_item(user, *, product_id, quantity, processing_option_ids=(), preorder_eligible=False):
    cart, _ = Cart.objects.get_or_create(user=user)
    cart = Cart.objects.select_for_update().get(pk=cart.pk)
    product = Product.objects.select_for_update(of=("self",)).select_related("category", "category__parent").filter(pk=product_id, is_active=True, category__is_active=True).first()
    if not product:
        raise APIValidationError({"product_id": "This product is unavailable."})
    _validate_quantity(product, quantity, check_stock=not preorder_eligible)
    options = _validated_options(product, processing_option_ids)
    if not preorder_eligible:
        _validate_cart_stock(cart, product, quantity)
    item = CartItem.objects.create(cart=cart, product=product, product_name=product.name, unit=product.unit, quantity=quantity, preorder_eligible=preorder_eligible, unit_price=product.price_per_unit)
    CartItemOption.objects.bulk_create([CartItemOption(item=item, option=option, name=option.name, price_per_kg=option.price_per_kg, gst_rate=option.gst_rate) for option in options])
    return item


@transaction.atomic
def update_item(item, *, quantity=None, processing_option_ids=None, preorder_eligible=None):
    cart = Cart.objects.select_for_update().get(pk=item.cart_id)
    item = CartItem.objects.select_for_update().get(pk=item.pk, cart=cart)
    product = Product.objects.select_for_update(of=("self",)).select_related("category", "category__parent").get(pk=item.product_id)
    if not product.is_active or not product.category.is_active:
        raise APIValidationError({"product": "This product is no longer available."})
    new_quantity = quantity if quantity is not None else item.quantity
    allow_preorder = item.preorder_eligible if preorder_eligible is None else preorder_eligible
    _validate_quantity(product, new_quantity, check_stock=not allow_preorder)
    selected_ids = processing_option_ids
    if selected_ids is None:
        selected_ids = item.selected_options.exclude(option__isnull=True).values_list("option_id", flat=True)
    options = _validated_options(product, selected_ids)
    if not allow_preorder:
        _validate_cart_stock(cart, product, new_quantity, exclude_item_id=item.pk)
    item.quantity = new_quantity
    item.product_name = product.name
    item.unit = product.unit
    item.unit_price = product.price_per_unit
    item.preorder_eligible = allow_preorder
    item.save(update_fields=["quantity", "product_name", "unit", "preorder_eligible", "unit_price", "updated_at"])
    item.selected_options.all().delete()
    CartItemOption.objects.bulk_create([CartItemOption(item=item, option=option, name=option.name, price_per_kg=option.price_per_kg, gst_rate=option.gst_rate) for option in options])
    return item
