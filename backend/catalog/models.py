from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

from .validators import validate_catalog_image


class Category(models.Model):
    class Kind(models.TextChoices):
        FISH = "fish", "Fish"
        PICKLE = "pickle", "Pickles"
        OTHER = "other", "Other"

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120, unique=True)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.OTHER)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    description = models.CharField(max_length=500, blank=True)
    image = models.ImageField(upload_to="catalog/categories/%Y/%m/", blank=True, validators=[validate_catalog_image])
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))], help_text="GST percentage for products in this category. Confirm classification before charging tax.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [models.UniqueConstraint(fields=["parent", "name"], name="unique_category_name_per_parent")]

    def clean(self):
        if self.parent_id:
            if self.parent.parent_id:
                raise ValidationError({"parent": "Categories can only have one subcategory level."})
            self.kind = self.parent.kind
        if self.pk:
            previous = Category.objects.filter(pk=self.pk).values("parent_id", "kind").first()
            if previous and previous["parent_id"] != self.parent_id and (self.products.exists() or self.children.exists() or self.processing_options.exists()):
                raise ValidationError({"parent": "Cannot move a category that already has products, subcategories, or processing options."})
            if previous and previous["kind"] != self.kind and (self.products.exists() or self.children.exists() or self.processing_options.exists()):
                raise ValidationError({"kind": "Cannot change category kind while it has products, subcategories, or processing options."})

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.parent.name} / {self.name}" if self.parent_id else self.name


class Product(models.Model):
    class Unit(models.TextChoices):
        KG = "kg", "Kilogram"
        EACH = "each", "Each"

    class FishType(models.TextChoices):
        SEA = "sea", "Sea fish"
        FRESHWATER = "freshwater", "Freshwater fish"
        OTHER = "other", "Other"

    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="catalog/products/%Y/%m/", validators=[validate_catalog_image])
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    unit = models.CharField(max_length=8, choices=Unit.choices, default=Unit.KG)
    fish_type = models.CharField(max_length=12, choices=FishType.choices, blank=True)
    available_quantity = models.DecimalField(max_digits=10, decimal_places=3, validators=[MinValueValidator(Decimal("0"))], default=Decimal("0"))
    minimum_quantity = models.DecimalField(max_digits=7, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))], default=Decimal("0.5"))
    quantity_step = models.DecimalField(max_digits=7, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))], default=Decimal("0.5"))
    is_active = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_featured", "name"]
        indexes = [models.Index(fields=["is_active", "category", "price_per_unit"]), models.Index(fields=["is_active", "fish_type"])]

    def clean(self):
        if self.category_id:
            root = self.category.parent or self.category
            if root.kind == Category.Kind.FISH:
                if self.unit != self.Unit.KG:
                    raise ValidationError({"unit": "Fish products must be priced by kilogram."})
                if not self.fish_type:
                    raise ValidationError({"fish_type": "Choose sea fish or freshwater fish for fish products."})
            elif self.fish_type:
                raise ValidationError({"fish_type": "Fish type only applies to fish products."})
            if self.unit == self.Unit.EACH and self.minimum_quantity == Decimal("0.5"):
                self.minimum_quantity = Decimal("1")
            if self.unit == self.Unit.EACH and self.quantity_step == Decimal("0.5"):
                self.quantity_step = Decimal("1")

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def is_fish(self):
        root = self.category.parent or self.category
        return root.kind == Category.Kind.FISH

    def __str__(self):
        return self.name


class ProcessingOption(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="processing_options")
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=100)
    price_per_kg = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))], help_text="GST percentage for this processing charge. Confirm classification before charging tax.")
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        constraints = [models.UniqueConstraint(fields=["category", "slug"], name="unique_processing_option_per_category")]

    def clean(self):
        root = self.category.parent or self.category
        if self.category.parent_id or root.kind != Category.Kind.FISH:
            raise ValidationError({"category": "Processing options must be attached to the top-level fish category."})

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.price_per_kg}/kg)"
