"""
Changing the password through allauth's app client without losing the login
on the device that changed it.

Django rotates the session key when the password changes, which logs out
every other device: their tokens name a session whose password hash no
longer matches. It also invalidates the tokens of the current device, since
they name the old session key, and allauth's response only carries a new
session token. So the response gets a fresh pair of JWTs for the rotated
session as well.
"""

import json
from functools import wraps

from allauth.account.signals import password_changed
from allauth.headless import app_settings as headless_settings
from allauth.headless.account.views import ChangePasswordView
from allauth.headless.constants import Client
from django.dispatch import receiver

TOKENS_ATTRIBUTE = "_tokens_after_password_change"

allauth_change_password = ChangePasswordView.as_api_view(client=Client.APP)


@receiver(password_changed)
def issue_tokens_for_rotated_session(sender, request, user, **kwargs):
    """
    Runs inside allauth's view, while request.session is the user's
    rotated session.
    """
    headless = getattr(getattr(request, "allauth", None), "headless", None)
    if headless is None or headless.client != Client.APP:
        return
    tokens = headless_settings.TOKEN_STRATEGY.create_access_token_payload(request)
    setattr(request, TOKENS_ATTRIBUTE, tokens)


# Takes over the markers of allauth's view: exempt from CSRF checks (the app
# client authenticates with tokens, not cookies) and open to anonymous
# requests, which allauth then answers itself.
@wraps(allauth_change_password)
def change_password(request, *args, **kwargs):
    """allauth's password change, with the new tokens in the response's meta."""
    response = allauth_change_password(request, *args, **kwargs)
    tokens = getattr(request, TOKENS_ATTRIBUTE, None)
    if tokens and response.status_code == 200:
        body = json.loads(response.content)
        body.setdefault("meta", {}).update(tokens)
        response.content = json.dumps(body)
    return response
