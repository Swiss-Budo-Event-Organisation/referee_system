from datetime import timedelta

from celery import shared_task
from django.core import mail
from django.utils import timezone

from accounts.models import PENDING_DAYS


@shared_task
def send_plain_mail(subject: str, body: str, to: list[str]):
    """One plain text e-mail to each recipient."""
    messages = [mail.EmailMessage(subject, body, to=[address]) for address in to]
    mail.get_connection().send_messages(messages)


@shared_task
def send_pending_digest(frequency: str) -> int:
    """The daily or weekly digest of accounts awaiting approval."""
    from accounts.emails import notify_staff

    return notify_staff(frequency)


@shared_task
def delete_expired_registrations() -> int:
    """Delete registrations not approved within PENDING_DAYS days."""
    from accounts.models import pending_users

    cutoff = timezone.now() - timedelta(days=PENDING_DAYS)
    expired = pending_users().filter(date_joined__lt=cutoff)
    count = expired.count()
    for user in expired:
        user.delete()
    return count
