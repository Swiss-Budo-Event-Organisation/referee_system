import time

import jwt
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal import auth as totp_auth
from allauth.mfa.utils import decrypt
from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken
from django.contrib.auth.hashers import get_hasher
from django.contrib.auth.hashers import identify_hasher
from django.contrib.auth.models import User
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.adapter import fallback_key
from api.tests.helpers import make_user

APP = "/_allauth/app/v1"


def totp_code(secret: str) -> str:
    counter = int(time.time()) // 30
    return totp_auth.format_hotp_value(totp_auth.hotp_value(secret, counter))


class TestRegistration(APITestCase):
    def register(self, **data):
        payload = {
            "username": "newbie",
            "email": "newbie@example.com",
            "first_name": "New",
            "last_name": "Bie",
            "password": "s3cret-Pa55word",
            "password_repeat": "s3cret-Pa55word",
            **data,
        }
        return self.client.post(reverse("user-register"), payload, format="json")

    def test_register_creates_user_with_hashed_password_and_profile(self):
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
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
        response = self.register(username="taken")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)


class AllauthClient(APITestCase):
    """Logs in like the React app: allauth's app client and its JWTs."""

    def setUp(self):
        # Rate limits and used TOTP codes are kept in the cache.
        cache.clear()
        self.user = make_user("john", "s3cret-Pa55word")

    def login(self, username="john", password="s3cret-Pa55word"):
        return self.client.post(
            f"{APP}/auth/login",
            {"username": username, "password": password},
            format="json",
        )

    def bearer(self, access_token=None):
        if access_token is None:
            self.client.credentials()
        else:
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")


class TestLogin(AllauthClient):
    def test_login_returns_token_pair(self):
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        meta = response.json()["meta"]
        self.assertTrue(meta["is_authenticated"])
        self.assertIn("access_token", meta)
        self.assertIn("refresh_token", meta)

    def test_access_token_holds_the_user_id(self):
        access = self.login().json()["meta"]["access_token"]
        payload = jwt.decode(access, options={"verify_signature": False})
        self.assertEqual(payload["sub"], str(self.user.pk))

    def test_wrong_password_is_rejected(self):
        response = self.login(password="wrong")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("access_token", response.json().get("meta", {}))

    def test_inactive_user_gets_no_tokens(self):
        make_user("pending", "s3cret-Pa55word", is_active=False)
        response = self.login("pending")
        self.assertNotEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("access_token", response.json().get("meta", {}))

    def test_signup_through_allauth_is_closed(self):
        response = self.client.post(
            f"{APP}/auth/signup",
            {"username": "x", "password": "s3cret-Pa55word"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username="x").exists())

    def test_access_token_authenticates_api_requests(self):
        self.bearer(self.login().json()["meta"]["access_token"])
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_token_is_rejected(self):
        self.bearer("not-a-token")
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_rotates_the_refresh_token(self):
        refresh = self.login().json()["meta"]["refresh_token"]
        response = self.client.post(
            f"{APP}/tokens/refresh", {"refresh_token": refresh}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()["data"]
        self.assertIn("access_token", data)
        self.assertNotEqual(data["refresh_token"], refresh)
        # The old refresh token is used up.
        again = self.client.post(
            f"{APP}/tokens/refresh", {"refresh_token": refresh}, format="json"
        )
        self.assertNotEqual(again.status_code, status.HTTP_200_OK)

    def test_logout_revokes_the_tokens(self):
        meta = self.login().json()["meta"]
        self.bearer(meta["access_token"])
        response = self.client.delete(f"{APP}/auth/session")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.bearer()
        response = self.client.post(
            f"{APP}/tokens/refresh",
            {"refresh_token": meta["refresh_token"]},
            format="json",
        )
        self.assertNotEqual(response.status_code, status.HTTP_200_OK)

    def test_session_auth_is_not_accepted_by_api(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("event-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_passkeys_are_bound_to_the_configured_domain(self):
        url = f"{APP}/auth/webauthn/login"
        options = self.client.get(url).json()["data"]["request_options"]
        self.assertEqual(options["publicKey"]["rpId"], "testserver")
        with self.settings(MFA_WEBAUTHN_RP_ID="referee.example.ch"):
            options = self.client.get(url).json()["data"]["request_options"]
        self.assertEqual(options["publicKey"]["rpId"], "referee.example.ch")

    def test_old_simplejwt_routes_are_gone(self):
        response = self.client.post("/api/token/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_browsable_api_login_page(self):
        response = self.client.get(reverse("rest_framework:login"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class TestTOTP(AllauthClient):
    def setUp(self):
        super().setUp()
        self.secret = self.activate_totp()

    def activate_totp(self):
        self.bearer(self.login().json()["meta"]["access_token"])
        response = self.client.get(f"{APP}/account/authenticators/totp")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        secret = response.json()["meta"]["secret"]
        # Adding a factor asks for the password again, even right after login.
        url = f"{APP}/account/authenticators/totp"
        response = self.client.post(url, {"code": totp_code(secret)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(response.json()["data"]["flows"][0]["id"], "reauthenticate")
        response = self.client.post(
            f"{APP}/auth/reauthenticate",
            {"password": "s3cret-Pa55word"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        response = self.client.post(url, {"code": totp_code(secret)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        self.bearer()
        # The code may be used once only.
        cache.clear()
        return secret

    def authenticate(self, session_token, code):
        return self.client.post(
            f"{APP}/auth/2fa/authenticate",
            {"code": code},
            format="json",
            HTTP_X_SESSION_TOKEN=session_token,
        )

    def test_secret_is_stored_encrypted(self):
        stored = Authenticator.objects.get(user=self.user, type="totp").data["secret"]
        self.assertNotIn(self.secret, stored)
        self.assertEqual(decrypt(stored), self.secret)

    def test_recovery_code_seed_is_stored_encrypted(self):
        stored = Authenticator.objects.get(user=self.user, type="recovery_codes")
        seed = decrypt(stored.data["seed"])
        self.assertNotIn(seed, str(stored.data))

    def test_a_new_key_still_decrypts_with_the_old_one(self):
        stored = Authenticator.objects.get(user=self.user, type="totp").data["secret"]
        with self.settings(MFA_ENCRYPTION_KEYS=[Fernet.generate_key().decode()]):
            with self.assertRaises(InvalidToken):
                decrypt(stored)
        old = fallback_key()
        with self.settings(MFA_ENCRYPTION_KEYS=[Fernet.generate_key().decode(), old]):
            self.assertEqual(decrypt(stored), self.secret)

    def test_login_asks_for_the_second_factor(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        body = response.json()
        self.assertNotIn("access_token", body["meta"])
        self.assertIn("session_token", body["meta"])
        pending = [flow for flow in body["data"]["flows"] if flow.get("is_pending")]
        self.assertEqual(pending[0]["id"], "mfa_authenticate")
        self.assertIn("totp", pending[0]["types"])

    def test_code_completes_the_login(self):
        session_token = self.login().json()["meta"]["session_token"]
        response = self.authenticate(session_token, totp_code(self.secret))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        self.bearer(response.json()["meta"]["access_token"])
        self.assertEqual(
            self.client.get(reverse("event-list")).status_code, status.HTTP_200_OK
        )

    def test_wrong_code_gets_no_tokens(self):
        session_token = self.login().json()["meta"]["session_token"]
        response = self.authenticate(session_token, "000000")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("access_token", response.json().get("meta", {}))

    def test_session_token_alone_does_not_open_the_api(self):
        session_token = self.login().json()["meta"]["session_token"]
        response = self.client.get(
            reverse("event-list"), HTTP_X_SESSION_TOKEN=session_token
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recovery_code_completes_the_login(self):
        session_token = self.login().json()["meta"]["session_token"]
        access = self.authenticate(session_token, totp_code(self.secret)).json()
        self.bearer(access["meta"]["access_token"])
        url = f"{APP}/account/authenticators/recovery-codes"
        # Seeing the codes needs a fresh reauthentication as well.
        self.assertEqual(self.client.get(url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.post(
            f"{APP}/auth/reauthenticate",
            {"password": "s3cret-Pa55word"},
            format="json",
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        codes = response.json()["data"]["unused_codes"]
        self.assertEqual(len(codes), 10)

        self.bearer()
        session_token = self.login().json()["meta"]["session_token"]
        response = self.authenticate(session_token, codes[0])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.json())
        self.assertIn("access_token", response.json()["meta"])
