from django.contrib.auth.hashers import get_hasher
from django.contrib.auth.hashers import identify_hasher
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from api.tests.helpers import make_user


class TestRegistration(APITestCase):
    def test_register_creates_user_with_hashed_password_and_profile(self):
        response = self.client.post(
            reverse("user-register"),
            {"username": "newbie", "password": "s3cret-Pa55word"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "newbie")
        self.assertNotIn("password", response.data)
        user = User.objects.get(username="newbie")
        self.assertTrue(user.check_password("s3cret-Pa55word"))
        # Hashed with the first configured hasher (MD5 in tests, else Argon2).
        self.assertEqual(
            identify_hasher(user.password).algorithm, get_hasher().algorithm
        )
        self.assertIsNotNone(user.referee)

    def test_register_rejects_duplicate_username(self):
        make_user("taken")
        response = self.client.post(
            reverse("user-register"),
            {"username": "taken", "password": "whatever"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)


class TestJWT(APITestCase):
    def setUp(self):
        self.user = make_user("john", "s3cret-Pa55word")

    def obtain(self, password="s3cret-Pa55word"):
        return self.client.post(
            reverse("token-get"),
            {"username": "john", "password": password},
            format="json",
        )

    def test_obtain_token_pair(self):
        response = self.obtain()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_wrong_password_is_rejected(self):
        response = self.obtain("wrong")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_access_token_authenticates_requests(self):
        access = self.obtain().data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_returns_new_access_token(self):
        refresh = self.obtain().data["refresh"]
        response = self.client.post(
            reverse("token-refresh"), {"refresh": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_session_auth_is_not_accepted_by_api(self):
        # Only JWT is configured for the API.
        self.client.force_login(self.user)
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_browsable_api_login_page(self):
        response = self.client.get(reverse("rest_framework:login"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
