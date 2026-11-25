"""
Signed links that confirm a user's e-mail address.

The token holds the user and the address it was sent to, so it no longer
works once the address changes.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing

SALT = "accounts.confirm-email"
MAX_AGE = timedelta(days=14)


def make_token(user: User) -> str:
    return signing.dumps({"user": user.pk, "email": user.email.lower()}, salt=SALT)


def confirmation_url(user: User) -> str:
    return f"{settings.FRONTEND_URL}/confirm-email?token={make_token(user)}"


def check_token(token: str) -> User | None:
    """The active user the token confirms the current address of, else None."""
    try:
        data = signing.loads(token, salt=SALT, max_age=MAX_AGE)
    except signing.BadSignature:
        return None
    user = User.objects.filter(pk=data.get("user"), is_active=True).first()
    if user is None or user.email.lower() != data.get("email"):
        return None
    return user
