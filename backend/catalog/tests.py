from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.core.exceptions import ValidationError
from PIL import Image
from rest_framework.test import APIClient

from orders.models import Order, OrderItem

from .models import Category, Product, ProductReview


def png_upload(name):
    stream = BytesIO()
    Image.new("RGB", (2, 2), color="teal").save(stream, format="PNG")
    return SimpleUploadedFile(name, stream.getvalue(), content_type="image/png")


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class ProductReviewAPITests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.customer = user_model.objects.create_user(
            username="review_customer",
            phone_number="+919876543210",
        )
        self.other_customer = user_model.objects.create_user(
            username="other_customer",
            phone_number="+919876543211",
        )
        self.category = Category.objects.create(name="Fish", slug="fish", kind=Category.Kind.FISH)
        self.product = Product.objects.create(
            category=self.category,
            name="Kerala Rohu",
            slug="kerala-rohu",
            image=png_upload("rohu.png"),
            price_per_unit=Decimal("320.00"),
            fish_type=Product.FishType.FRESHWATER,
        )
        self.client = APIClient()
        self.reviews_url = "/api/catalog/products/kerala-rohu/reviews/"

    def tearDown(self):
        self.product.image.delete(save=False)

    def _completed_purchase(self, customer):
        order = Order.objects.create(
            user=customer,
            address_snapshot={"recipient_name": "Test customer", "address_line1": "Test road", "city": "Kochi"},
            status=Order.Status.COMPLETED,
        )
        OrderItem.objects.create(
            order=order,
            product=self.product,
            product_name=self.product.name,
            unit="kg",
            quantity=Decimal("1.000"),
            unit_price=Decimal("320.00"),
            product_subtotal=Decimal("320.00"),
        )
        return order

    def test_reviews_are_public_and_only_show_visible_verified_reviews(self):
        self._completed_purchase(self.customer)
        ProductReview.objects.create(product=self.product, user=self.customer, rating=5, comment="Fresh")
        ProductReview.objects.create(product=self.product, user=self.other_customer, rating=1, comment="Hidden", is_visible=False)

        response = self.client.get(self.reviews_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_name"], "Verified customer")
        self.assertTrue(response.data[0]["is_verified_purchase"])
        self.assertNotIn("phone_number", response.data[0])

    def test_customer_must_be_authenticated_and_have_completed_purchase(self):
        self.assertEqual(self.client.post(self.reviews_url, {"rating": 5}, format="json").status_code, 401)
        self.client.force_authenticate(self.other_customer)
        response = self.client.post(self.reviews_url, {"rating": 5, "comment": "Looks good"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_completed_customer_can_create_one_review_per_product(self):
        self._completed_purchase(self.customer)
        self.client.force_authenticate(self.customer)
        response = self.client.post(self.reviews_url, {"rating": 4, "comment": "  Nice quality  "}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["comment"], "Nice quality")

        duplicate = self.client.post(self.reviews_url, {"rating": 5, "comment": "Another"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(ProductReview.objects.filter(user=self.customer, product=self.product).count(), 1)

    def test_customer_can_only_edit_their_own_review(self):
        review = ProductReview.objects.create(product=self.product, user=self.customer, rating=3)
        self.client.force_authenticate(self.other_customer)
        response = self.client.patch(f"/api/catalog/reviews/{review.pk}/", {"rating": 1}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(ProductReview.objects.get(pk=review.pk).rating, 3)

    def test_product_image_must_be_a_real_image_matching_its_extension(self):
        with self.assertRaises(ValidationError):
            Product.objects.create(
                category=self.category,
                name="Fake Image Product",
                slug="fake-image-product",
                image=SimpleUploadedFile("fake.jpg", b"not an image", content_type="image/jpeg"),
                price_per_unit=Decimal("100.00"),
            )

    def test_category_cannot_be_its_own_parent(self):
        self.category.parent = self.category
        with self.assertRaises(ValidationError):
            self.category.save()
