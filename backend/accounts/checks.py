"""
Checks run by `manage.py check --deploy`: settings for login and second
factors that are only acceptable in development and tests.
"""

from django.conf import settings
from django.core.checks import Error
from django.core.checks import Tags
from django.core.checks import register


@register(Tags.security, deploy=True)
def check_authentication_settings(app_configs, **kwargs):
    errors = []
    if getattr(settings, "MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN", False):
        errors.append(
            Error(
                "MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN accepts passkeys from any "
                "origin, including plain http.",
                hint="Only enable it in the local and test settings.",
                id="accounts.E001",
            )
        )
    if getattr(settings, "MFA_TOTP_INSECURE_BYPASS_CODE", None):
        errors.append(
            Error(
                "MFA_TOTP_INSECURE_BYPASS_CODE lets anyone pass the second factor.",
                id="accounts.E002",
            )
        )
    if not getattr(settings, "MFA_WEBAUTHN_RP_ID", ""):
        errors.append(
            Error(
                "MFA_WEBAUTHN_RP_ID is not set, so passkeys are bound to the "
                "Host header of each request.",
                hint="Set it to the public domain.",
                id="accounts.E003",
            )
        )
    if not getattr(settings, "MFA_ENCRYPTION_KEYS", None):
        errors.append(
            Error(
                "MFA_ENCRYPTION_KEYS is not set, so second factor secrets are "
                "encrypted with a key derived from SECRET_KEY.",
                id="accounts.E004",
            )
        )
    if getattr(settings, "HEADLESS_JWT_ALGORITHM", "") != "RS256":
        errors.append(
            Error(
                "Login tokens are not signed with RS256.",
                hint="Set JWT_PRIVATE_KEY.",
                id="accounts.E005",
            )
        )
    return errors
