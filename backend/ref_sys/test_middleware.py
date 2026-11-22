"""
Middleware and settings behaviour that package upgrades could change silently.
"""

from django import forms
from django.conf import settings
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from api.tests.helpers import make_user


class TestMiddleware(APITestCase):
    def test_cors_allows_any_origin(self):
        response = self.client.get(
            reverse("license-list"), HTTP_ORIGIN="http://frontend.example"
        )
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")

    def test_cors_preflight(self):
        response = self.client.options(
            reverse("token-get"),
            HTTP_ORIGIN="http://frontend.example",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")
        self.assertIn("POST", response["Access-Control-Allow-Methods"])
        self.assertIn("authorization", response["Access-Control-Allow-Headers"])

    def test_security_headers(self):
        response = self.client.get(reverse("admin:login"))
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Referrer-Policy"], "same-origin")

    def test_api_returns_json(self):
        user = make_user()
        self.client.force_authenticate(user)
        response = self.client.get(reverse("license-list"))
        self.assertEqual(response["Content-Type"], "application/json")


class TestSettings(TestCase):
    def test_test_settings_are_used(self):
        self.assertEqual(settings.SETTINGS_MODULE, "ref_sys.settings.test")
        self.assertEqual(
            settings.DATABASES["default"]["ENGINE"], "django.db.backends.sqlite3"
        )
        self.assertEqual(
            settings.EMAIL_BACKEND, "django.core.mail.backends.locmem.EmailBackend"
        )
        self.assertTrue(settings.CELERY_TASK_ALWAYS_EAGER)

    def test_time_zone_and_hashers(self):
        from ref_sys.settings import base

        self.assertEqual(settings.TIME_ZONE, "CET")
        self.assertTrue(settings.USE_TZ)
        self.assertEqual(
            base.PASSWORD_HASHERS[0],
            "django.contrib.auth.hashers.Argon2PasswordHasher",
        )

    def test_date_input_formats(self):
        # Formats come from the en-gb locale; settings.DATE_INPUT_FORMATS is
        # ignored since localisation is always on (Django 5.0+).
        field = forms.DateField()
        for value in ["2024-12-01", "01/12/2024", "01/12/24"]:
            with self.subTest(value=value):
                self.assertEqual(field.clean(value).isoformat(), "2024-12-01")

    def test_jwt_lifetimes(self):
        from rest_framework_simplejwt.settings import api_settings

        self.assertEqual(api_settings.ACCESS_TOKEN_LIFETIME.total_seconds(), 1800)
        self.assertEqual(api_settings.REFRESH_TOKEN_LIFETIME.days, 30)
