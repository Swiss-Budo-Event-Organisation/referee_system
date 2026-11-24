from celery import shared_task
from django.core import mail


@shared_task
def send_mails(messages: list[mail.EmailMessage]):
    connection = mail.get_connection()
    connection.send_messages(messages)


@shared_task
def send_invitation_mails(invitation_id: int):
    """E-mail a sent invitation to everyone it concerns."""
    from competition.invitations import invitation_mails
    from competition.models import Invitation

    invitation = Invitation.objects.select_related(
        "competition__event__location__address", "head_referee__user", "sender"
    ).get(pk=invitation_id)
    messages = invitation_mails(invitation)
    if messages:
        mail.get_connection().send_messages(messages)
