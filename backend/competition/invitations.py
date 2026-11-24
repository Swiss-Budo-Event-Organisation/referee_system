"""
Invitations of referees to a competition.

The invitor of a competition selects referees, whether they applied or not,
and the head referee. Saving the invitation marks the applications as
selected or not selected; sending it marks them as invited or declined and
e-mails every invited referee the list of everyone invited.

Applications that were cancelled, or belong to a competition that already
took place (participated, no show), are left alone.
"""

from collections.abc import Iterable

from django.conf import settings
from django.core import mail
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from competition.models import Application
from competition.models import Competition
from competition.models import Invitation
from referee.models import Referee

Status = Application.Status

# Statuses the invitation may change. Applications with any other status
# can't be invited.
MANAGED = frozenset(
    {
        Status.APPLIED,
        Status.SELECTED,
        Status.NOTSELECTED,
        Status.INVITED,
        Status.DECLINED,
    }
)


def latest_sent(competition: Competition) -> Invitation | None:
    return competition.invitations.filter(sent__isnull=False).order_by("-sent").first()


def draft(competition: Competition) -> Invitation | None:
    """The invitation that is being prepared and not sent yet."""
    return (
        competition.invitations.filter(sent__isnull=True).order_by("-created").first()
    )


def default_subject(competition: Competition) -> str:
    return f"Invitation: {competition.event.name} ({competition.start:%d.%m.%Y})"


def locked_referees(
    competition: Competition, referees: Iterable[Referee]
) -> list[Referee]:
    """The referees whose application the invitation must not change."""
    pks = {referee.pk for referee in referees}
    return [
        application.user
        for application in competition.applications.filter(user__in=pks)
        .exclude(status__in=MANAGED)
        .select_related("user__user")
    ]


def _applications(competition, referees) -> list[Application]:
    """The application of every referee, created for those who didn't apply."""
    existing = {a.user_id: a for a in competition.applications.all()}
    applications = []
    for referee in referees:
        application = existing.get(referee.pk)
        if application is None:
            application = Application.objects.create(
                user=referee, competition=competition, status=Status.SELECTED
            )
        applications.append(application)
    return applications


def _update_statuses(competition, invited, selected_status, other_status, others):
    invited_pks = [a.pk for a in invited]
    applications = competition.applications.filter(status__in=MANAGED)
    for application in applications.filter(pk__in=invited_pks):
        application.status = selected_status(application)
        application.save(update_fields=["status", "modified"])
    for application in applications.exclude(pk__in=invited_pks).filter(
        status__in=others
    ):
        application.status = other_status
        application.save(update_fields=["status", "modified"])


@transaction.atomic
def save_invitation(
    competition: Competition,
    referees: Iterable[Referee],
    head_referee: Referee | None,
    subject: str,
    message: str = "",
) -> Invitation:
    """
    Save the draft of the invitation. Selected applications become selected,
    the others not selected. Referees who were already invited stay invited
    until the changed invitation is sent.
    """
    referees = list(dict.fromkeys(referees))
    if head_referee is not None and head_referee not in referees:
        referees.insert(0, head_referee)

    invitation = draft(competition)
    if invitation is None:
        invitation = Invitation(
            competition=competition, previous_invitation=latest_sent(competition)
        )
    invitation.head_referee = head_referee
    invitation.subject = subject
    invitation.message = message
    invitation.save()

    invited = _applications(competition, referees)
    invitation.invited.set(invited)
    _update_statuses(
        competition,
        invited,
        selected_status=lambda a: (
            Status.INVITED if a.status == Status.INVITED else Status.SELECTED
        ),
        other_status=Status.NOTSELECTED,
        others=[Status.APPLIED, Status.SELECTED],
    )
    return invitation


@transaction.atomic
def send_invitation(invitation: Invitation, sender=None) -> Invitation:
    """
    Send the invitation: the invited applications become invited, all others
    declined, and the head referee is set on the competition. The e-mails
    go out once the changes are saved.
    """
    if invitation.is_sent:
        raise ValueError("This invitation was already sent.")
    competition = invitation.competition
    invitation.sent = timezone.now()
    invitation.sender = sender
    invitation.save(update_fields=["sent", "sender", "modified"])

    _update_statuses(
        competition,
        list(invitation.invited.all()),
        selected_status=lambda a: Status.INVITED,
        other_status=Status.DECLINED,
        others=[Status.APPLIED, Status.SELECTED, Status.NOTSELECTED, Status.INVITED],
    )
    competition.head_referee = invitation.head_referee
    competition.save(update_fields=["head_referee", "modified"])

    from competition.tasks import send_invitation_mails

    transaction.on_commit(lambda: send_invitation_mails.delay(invitation.pk))
    return invitation


def invited_referees(invitation: Invitation) -> list[Referee]:
    """The invited referees, the head referee first, then by name."""
    referees = [
        a.user for a in invitation.invited.select_related("user__user").order_by()
    ]
    referees.sort(
        key=lambda r: (
            r.pk != invitation.head_referee_id,
            r.user.last_name.lower(),
            r.user.first_name.lower(),
            r.name.lower(),
        )
    )
    return referees


def missing_emails(invitation: Invitation) -> list[Referee]:
    return [r for r in invited_referees(invitation) if not r.user.email]


def _context(invitation: Invitation, recipient: str) -> dict:
    competition = invitation.competition
    referees = invited_referees(invitation)
    return {
        "recipient": recipient,
        "message": invitation.message,
        "event": competition.event,
        "competition": competition,
        "end": competition.start + competition.duration,
        "head_referee": invitation.head_referee,
        "referees": referees,
        "is_update": invitation.previous_invitation_id is not None,
    }


def _mail(invitation, recipient, to, reply_to):
    context = _context(invitation, recipient)
    message = mail.EmailMultiAlternatives(
        subject=invitation.subject,
        body=render_to_string("competition/invitation_email.txt", context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to],
        reply_to=reply_to,
    )
    message.attach_alternative(
        render_to_string("competition/invitation_email.html", context), "text/html"
    )
    return message


def invitation_mails(invitation: Invitation) -> list[mail.EmailMessage]:
    """
    One e-mail to every invited referee with an e-mail address, and a copy
    to the sender and to the users the copy should go to.
    """
    sender = invitation.sender
    reply_to = [sender.email] if sender is not None and sender.email else []
    messages = [
        _mail(invitation, referee.name, referee.user.email, reply_to)
        for referee in invited_referees(invitation)
        if referee.user.email
    ]
    invited = {m.to[0] for m in messages}
    copies = list(invitation.send_copy.all())
    if sender is not None:
        copies.insert(0, sender)
    for user in copies:
        if user.email and user.email not in invited:
            invited.add(user.email)
            name = user.get_full_name() or user.username
            messages.append(_mail(invitation, name, user.email, reply_to))
    return messages
