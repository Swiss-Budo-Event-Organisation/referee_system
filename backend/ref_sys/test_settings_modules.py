"""
The local and production settings, each loaded in a fresh process since the
test run itself uses ref_sys.settings.test.
"""

import os
import subprocess
import sys

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.test import SimpleTestCase


def pem_one_line() -> str:
    r"""A fresh RSA key as .env.prod holds it: line breaks written as \n."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return pem.strip().replace("\n", "\\n")


PRODUCTION_ENV = {
    "JWT_PRIVATE_KEY": pem_one_line(),
    "MFA_ENCRYPTION_KEYS": f"{Fernet.generate_key().decode()},"
    f"{Fernet.generate_key().decode()}",
    "DJANGO_SETTINGS_MODULE": "ref_sys.settings.production",
    "SECRET_KEY": "x7Qp2LmZ9vR4tY8wK3nB6cF1hJ5dG0sA-uE_iO2pL9kM4nB7vC3xZ",
    "DOMAIN": "referee.example.ch",
    "EMAIL": "smtp+tls://mailer:pa%40ss@smtp.example.ch:587",
    "DEFAULT_FROM_EMAIL": "Referee System <noreply@example.ch>",
    "DATABASE_URL": "sqlite:///:memory:",
}


# Only these are passed on: the test process has already loaded backend/.env
# into os.environ, and those values must not reach the subprocess.
SYSTEM_VARIABLES = {
    "PATH",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "VIRTUAL_ENV",
    "PYTHONPATH",
    "LANG",
    "LC_ALL",
}


def run_manage(*args, **env):
    environment = {k: v for k, v in os.environ.items() if k.upper() in SYSTEM_VARIABLES}
    # ENV_PATH points nowhere so backend/.env isn't read either.
    environment["ENV_PATH"] = "does-not-exist.env"
    environment.update(env)
    return subprocess.run(
        [sys.executable, "manage.py", *args],
        cwd=settings.BASE_DIR,
        env=environment,
        capture_output=True,
        text=True,
    )


PRINT_SETTINGS = (
    "from django.conf import settings as s; "
    "print(s.DEBUG, s.EMAIL_BACKEND, s.EMAIL_HOST, s.EMAIL_PORT, s.EMAIL_USE_TLS, "
    "s.EMAIL_HOST_USER, s.EMAIL_HOST_PASSWORD, s.ALLOWED_HOSTS, "
    "s.CSRF_TRUSTED_ORIGINS, s.CORS_ALLOW_ALL_ORIGINS, "
    "'debug_toolbar' in s.INSTALLED_APPS)"
)


class TestProductionSettings(SimpleTestCase):
    def test_deploy_checks(self):
        result = run_manage("check", "--deploy", **PRODUCTION_ENV)
        self.assertEqual(result.returncode, 0, result.stderr)
        # The only accepted warning: HSTS preload stays opt-in.
        warnings = [line for line in result.stderr.splitlines() if "(security." in line]
        self.assertEqual(len(warnings), 1, result.stderr)
        self.assertIn("security.W021", warnings[0])

    def test_values_from_environment(self):
        result = run_manage("shell", "-c", PRINT_SETTINGS, **PRODUCTION_ENV)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip().splitlines()[-1],
            "False django.core.mail.backends.smtp.EmailBackend smtp.example.ch "
            "587 True mailer pa@ss ['referee.example.ch'] "
            "['https://referee.example.ch'] False False",
        )

    def test_missing_secret_key_fails(self):
        result = run_manage("check", **{**PRODUCTION_ENV, "SECRET_KEY": ""})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SECRET_KEY must be set in .env.prod", result.stderr)

    def test_missing_jwt_key_fails(self):
        result = run_manage("check", **{**PRODUCTION_ENV, "JWT_PRIVATE_KEY": ""})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("JWT_PRIVATE_KEY must be set in .env.prod", result.stderr)

    def test_tokens_are_signed_with_rs256(self):
        result = run_manage(
            "shell",
            "-c",
            "from allauth.headless.tokens.strategies.jwt import internal as i; "
            "c = i._get_jwt_config(); "
            "print(c.algorithm, c.jwk_dict['kty'], "
            "settings.HEADLESS_SERVE_SPECIFICATION)",
            **PRODUCTION_ENV,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "RS256 RSA False")

    def test_missing_mfa_encryption_keys_fail(self):
        result = run_manage("check", **{**PRODUCTION_ENV, "MFA_ENCRYPTION_KEYS": ""})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("MFA_ENCRYPTION_KEYS must be set in .env.prod", result.stderr)

    def test_second_factor_settings(self):
        result = run_manage("shell", "-c", PRINT_MFA_SETTINGS, **PRODUCTION_ENV)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout.strip().splitlines()[-1],
            "False referee.example.ch 2 "
            "django.core.cache.backends.redis.RedisCache redis://redis:6379/1",
        )


PRINT_MFA_SETTINGS = (
    "from django.conf import settings as s; "
    "print(s.MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN, s.MFA_WEBAUTHN_RP_ID, "
    "len(s.MFA_ENCRYPTION_KEYS), s.CACHES['default']['BACKEND'], "
    "s.CACHES['default']['LOCATION'])"
)


class TestLocalSettings(SimpleTestCase):
    def test_passkeys_over_http(self):
        result = run_manage(
            "shell",
            "-c",
            "print(settings.MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN)",
            DJANGO_SETTINGS_MODULE="ref_sys.settings.local",
            DATABASE_URL="sqlite:///:memory:",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip().splitlines()[-1], "True")

    def test_deploy_checks_reject_the_local_settings(self):
        result = run_manage(
            "check",
            "--deploy",
            DJANGO_SETTINGS_MODULE="ref_sys.settings.local",
            DATABASE_URL="sqlite:///:memory:",
        )
        self.assertNotEqual(result.returncode, 0)
        for code in ("E001", "E003", "E004", "E005"):
            self.assertIn(f"accounts.{code}", result.stderr)

    def test_debug_toolbar_and_console_mail(self):
        result = run_manage(
            "shell",
            "-c",
            PRINT_SETTINGS,
            DJANGO_SETTINGS_MODULE="ref_sys.settings.local",
            DATABASE_URL="sqlite:///:memory:",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = result.stdout.strip().splitlines()[-1]
        self.assertTrue(
            output.startswith("True django.core.mail.backends.console.EmailBackend"),
            result.stdout,
        )
        self.assertTrue(output.endswith("True True"), result.stdout)
