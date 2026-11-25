"""
The e-mails about registrations. Mails to staff members only contain the
number of accounts awaiting approval, never names or addresses.
"""

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.template.loader import render_to_string

from accounts.models import Account
from accounts.models import notified_approvers
from accounts.models import pending_users
from accounts.tokens import confirmation_url


def _queue(template: str, subject: str, to: str, **context) -> None:
    from accounts.tasks import send_plain_mail

    body = render_to_string(f"accounts/{template}.txt", context)
    transaction.on_commit(lambda: send_plain_mail.delay(subject, body, [to]))


def _name(user: User) -> str:
    return user.get_full_name() or user.username


def registration_received(user: User) -> None:
    if user.email:
        _queue(
            "registration_received",
            "Your registration is awaiting approval",
            user.email,
            name=_name(user),
        )


def account_approved(user: User) -> None:
    if user.email:
        _queue(
            "account_approved",
            "Your account has been approved",
            user.email,
            name=_name(user),
            url=confirmation_url(user),
        )


def confirm_email(user: User) -> None:
    if user.email:
        _queue(
            "confirm_email",
            "Please confirm your e-mail address",
            user.email,
            name=_name(user),
            url=confirmation_url(user),
        )


def notify_staff(frequency: str) -> int:
    """
    Tell the staff members subscribed to this frequency how many accounts
    await approval. Nothing is sent while none do. Returns the number of
    e-mails queued.
    """
    count = pending_users().count()
    if count == 0:
        return 0
    staff = list(notified_approvers(frequency))
    for member in staff:
        _queue(
            "pending_accounts",
            "Accounts awaiting approval",
            member.email,
            count=count,
            url=f"{settings.FRONTEND_URL}/accounts/pending",
        )
    return len(staff)


def notify_staff_now() -> int:
    return notify_staff(Account.Notifications.IMMEDIATE)
