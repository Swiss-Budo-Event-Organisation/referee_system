"""
The local and production settings, each loaded in a fresh process since the
test run itself uses ref_sys.settings.test.
"""

import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase

PRODUCTION_ENV = {
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


class TestLocalSettings(SimpleTestCase):
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
