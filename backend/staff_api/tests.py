from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class StaffCustomerDirectoryTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.staff = user_model.objects.create_user(username="operator", email="operator@example.com", is_staff=True)
        self.customer = user_model.objects.create_user(username="customer", email="customer@example.com")
        self.client = APIClient()
        self.client.force_authenticate(self.staff)

    def test_customer_directory_uses_registered_users_route(self):
        response = self.client.get("/api/staff/users/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.customer.pk])
