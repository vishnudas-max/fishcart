from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from catalog.models import Category, ProcessingOption, Product
from users.models import Address


DEMO_PHONE = "+15555550100"  # NANP fictional 555-0100 range; cannot receive real calls/SMS.
DEMO_USERNAME = "demo_seafood_customer"
ASSET_DIRECTORY = Path(__file__).resolve().parents[2] / "demo_assets"

PRODUCTS = [
    {"name": "Pearl Spot (Karimeen)", "slug": "demo-pearl-spot-karimeen", "subcategory": "freshwater-fish", "fish_type": Product.FishType.FRESHWATER, "price": "780.00", "stock": "14.000", "image": "karimeen.jpeg", "featured": True, "description": "Fresh Kerala pearl spot, carefully chilled after landing."},
    {"name": "King Fish (Neymeen)", "slug": "demo-king-fish-neymeen", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "920.00", "stock": "18.000", "image": "harbor.jpeg", "featured": True, "description": "Firm, meaty slices from the morning coastal catch."},
    {"name": "Indian Sardines (Mathi)", "slug": "demo-indian-sardines-mathi", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "180.00", "stock": "32.000", "image": "sardines.jpeg", "featured": True, "description": "Small, flavorful sardines sourced from the Arabian Sea."},
    {"name": "Tiger Prawns", "slug": "demo-tiger-prawns", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "640.00", "stock": "12.000", "image": "prawns.jpeg", "featured": True, "description": "Juicy tiger prawns, cleaned on request."},
    {"name": "Silver Pomfret", "slug": "demo-silver-pomfret", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "860.00", "stock": "9.000", "image": "harbor.jpeg", "featured": False, "description": "Delicate white flesh with a mild, sweet flavor."},
    {"name": "Red Snapper", "slug": "demo-red-snapper", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "520.00", "stock": "11.000", "image": "harbor.jpeg", "featured": False, "description": "A versatile coastal catch with a clean, rich taste."},
    {"name": "Freshwater Tilapia", "slug": "demo-freshwater-tilapia", "subcategory": "freshwater-fish", "fish_type": Product.FishType.FRESHWATER, "price": "240.00", "stock": "20.000", "image": "karimeen.jpeg", "featured": False, "description": "Mild, tender freshwater fish, ideal for everyday meals."},
    {"name": "Kerala Rohu", "slug": "demo-kerala-rohu", "subcategory": "freshwater-fish", "fish_type": Product.FishType.FRESHWATER, "price": "320.00", "stock": "16.000", "image": "karimeen.jpeg", "featured": False, "description": "Fresh rohu with a firm texture, great for curry."},
    {"name": "Black Pomfret", "slug": "demo-black-pomfret", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "720.00", "stock": "7.000", "image": "harbor.jpeg", "featured": False, "description": "A rich-flavored favorite from the day’s sea catch."},
    {"name": "Indian Mackerel (Ayala)", "slug": "demo-indian-mackerel-ayala", "subcategory": "sea-fish", "fish_type": Product.FishType.SEA, "price": "260.00", "stock": "24.000", "image": "sardines.jpeg", "featured": False, "description": "Fresh mackerel with a bold, classic coastal flavor."},
]


class Command(BaseCommand):
    help = "Create repeatable local demo catalog data and a fictional OTP customer account."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo data is disabled when DJANGO_DEBUG is false.")

        fish = self._get_or_create_category("Fish", "fish", Category.Kind.FISH, sort_order=1)
        sea_fish = self._get_or_create_category("Sea Fish", "sea-fish", Category.Kind.FISH, parent=fish, sort_order=1)
        freshwater_fish = self._get_or_create_category("Freshwater Fish", "freshwater-fish", Category.Kind.FISH, parent=fish, sort_order=2)

        self._create_demo_images_and_products({"sea-fish": sea_fish, "freshwater-fish": freshwater_fish})
        for name, slug, price in (("Cleaned", "demo-cleaned", "0.00"), ("Curry Cut", "demo-curry-cut", "35.00"), ("Fillet Cut", "demo-fillet-cut", "60.00")):
            ProcessingOption.objects.get_or_create(
                category=fish,
                slug=slug,
                defaults={"name": name, "price_per_kg": Decimal(price), "is_active": True},
            )

        User = get_user_model()
        existing_demo_user = User.objects.filter(phone_number=DEMO_PHONE).first()
        if existing_demo_user and (existing_demo_user.username != DEMO_USERNAME or existing_demo_user.is_staff):
            raise CommandError("The reserved demo phone belongs to a non-demo account; no user or address data was changed.")
        if not existing_demo_user and User.objects.filter(username=DEMO_USERNAME).exists():
            raise CommandError(f"The username {DEMO_USERNAME!r} already belongs to another account; no data was changed for that account.")
        user, created = User.objects.get_or_create(
            phone_number=DEMO_PHONE,
            defaults={
                "username": DEMO_USERNAME,
                "first_name": "Demo",
                "last_name": "Customer",
                "is_active": True,
                "is_staff": False,
                "phone_verified_at": timezone.now(),
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        if not Address.objects.filter(user=user).exists():
            Address.objects.create(
                user=user,
                label="Home",
                recipient_name="Demo Customer",
                phone_number=DEMO_PHONE,
                address_line1="Demo Road, Fort Kochi",
                city="Kochi",
                state="Kerala",
                postal_code="682001",
                country_code="IN",
                latitude=Decimal("9.9650"),
                longitude=Decimal("76.2420"),
                is_default=True,
            )

        self.stdout.write(self.style.SUCCESS("Demo data is ready: 10 demo fish products and a demo customer."))
        self.stdout.write(f"Customer username: {user.username}")
        self.stdout.write(f"Customer phone for local OTP login: {DEMO_PHONE}")
        self.stdout.write("The customer has no password; authenticate with OTP. In local console SMS mode, read the OTP in backend logs.")

    def _get_or_create_category(self, name, slug, kind, *, parent=None, sort_order=0):
        category = Category.objects.filter(slug=slug).first()
        if category is None:
            category = Category.objects.filter(parent=parent, name=name).first()
        if category is not None:
            if category.kind != kind or category.parent_id != (parent.pk if parent else None):
                raise CommandError(f"Existing category {name!r} conflicts with the demo category; no existing category was changed.")
            return category
        return Category.objects.create(name=name, slug=slug, kind=kind, parent=parent, sort_order=sort_order)

    def _create_demo_images_and_products(self, categories):
        created_count = 0
        for item in PRODUCTS:
            if Product.objects.filter(slug=item["slug"]).exists():
                continue
            image_name = f"catalog/demo/{item['image']}"
            if not default_storage.exists(image_name):
                source = ASSET_DIRECTORY / item["image"]
                if not source.is_file():
                    raise CommandError(f"Missing bundled demo image: {source.name}")
                default_storage.save(image_name, ContentFile(source.read_bytes()))
            Product.objects.create(
                category=categories[item["subcategory"]],
                name=item["name"],
                slug=item["slug"],
                description=item["description"],
                image=image_name,
                price_per_unit=Decimal(item["price"]),
                unit=Product.Unit.KG,
                fish_type=item["fish_type"],
                available_quantity=Decimal(item["stock"]),
                minimum_quantity=Decimal("0.500"),
                quantity_step=Decimal("0.500"),
                is_active=True,
                is_featured=item["featured"],
            )
            created_count += 1
        self.stdout.write(f"Created {created_count} new demo products (10 demo product slugs total).")
