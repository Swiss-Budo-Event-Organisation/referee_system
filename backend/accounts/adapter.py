"""How django-allauth fits the accounts of this project."""

import base64
import hashlib

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core import context
from allauth.mfa.adapter import DefaultMFAAdapter
from cryptography.fernet import Fernet
from cryptography.fernet import MultiFernet
from django.conf import settings


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        """
        New users register through accounts.views.RegisterView, which holds
        the account for approval, so allauth's own signup stays closed.
        """
        return False


def fallback_key() -> str:
    """A Fernet key derived from SECRET_KEY, for development and tests."""
    digest = hashlib.sha256(f"mfa-secrets:{settings.SECRET_KEY}".encode()).digest()
    return base64.urlsafe_b64encode(digest).decode()


def mfa_fernet() -> MultiFernet:
    """
    Encrypts with the first key of MFA_ENCRYPTION_KEYS and decrypts with any
    of them, so a new key can be put first while the old ones still work.
    """
    keys = settings.MFA_ENCRYPTION_KEYS or [fallback_key()]
    return MultiFernet([Fernet(key) for key in keys])


class MFAAdapter(DefaultMFAAdapter):
    def encrypt(self, text: str) -> str:
        """TOTP secrets and recovery code seeds are stored encrypted."""
        return mfa_fernet().encrypt(text.encode()).decode()

    def decrypt(self, encrypted_text: str) -> str:
        return mfa_fernet().decrypt(encrypted_text.encode()).decode()

    def get_public_key_credential_rp_entity(self) -> dict[str, str]:
        """
        The relying party of passkeys is a fixed domain where one is set
        (production), rather than whatever Host header a request carries.
        Passkeys only work for this domain and its subdomains.
        """
        rp_id = (
            settings.MFA_WEBAUTHN_RP_ID or context.request.get_host().partition(":")[0]
        )
        return {"id": rp_id, "name": settings.MFA_TOTP_ISSUER}
