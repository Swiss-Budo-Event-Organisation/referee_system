from datetime import timedelta

from django.contrib.auth.models import User
from django.db import models
from django.utils.translation import gettext as _

# Registrations not approved within this time are deleted.
PENDING_DAYS = 30


class Account(models.Model):
    """
    The state of a user's account.

    Users who register are inactive until a staff member approves them;
    approved is then set. On their first login they complete their profile
    (onboarded). Their e-mail address counts as confirmed while it is the
    one they confirmed with a link (confirmed_email), so a changed address
    starts unconfirmed.

    Staff members may subscribe to an e-mail when accounts await approval.
    """

    class Notifications(models.TextChoices):
        NEVER = "never", _("Never")
        IMMEDIATE = "immediate", _("Immediately")
        DAILY = "daily", _("Daily digest")
        WEEKLY = "weekly", _("Weekly digest")

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="account", verbose_name=_("User")
    )
    approved = models.DateTimeField(null=True, blank=True, verbose_name=_("Approved"))
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        verbose_name=_("Approved by"),
    )
    onboarded = models.BooleanField(
        default=False,
        verbose_name=_("Profile completed"),
        help_text=_("Whether the user went through the onboarding."),
    )
    confirmed_email = models.EmailField(
        blank=True, verbose_name=_("Confirmed e-mail address")
    )
    approval_notifications = models.CharField(
        max_length=10,
        choices=Notifications,
        default=Notifications.NEVER,
        verbose_name=_("E-mail about accounts awaiting approval"),
        help_text=_("Only sent to staff members."),
    )

    class Meta:
        verbose_name = _("Account")
        verbose_name_plural = _("Accounts")

    def __str__(self) -> str:
        return str(self.user)

    @property
    def email_confirmed(self) -> bool:
        email = self.user.email.strip().lower()
        return bool(email) and email == self.confirmed_email.strip().lower()

    @property
    def is_pending(self) -> bool:
        return not self.user.is_active and self.approved is None

    @property
    def expires(self):
        """When a pending registration is deleted."""
        return self.user.date_joined + timedelta(days=PENDING_DAYS)


def pending_users():
    """Users who registered and are waiting for approval, oldest first."""
    return User.objects.filter(is_active=False, account__approved=None).order_by(
        "date_joined"
    )


def notified_staff(frequency):
    """Active staff members subscribed to the given notification frequency."""
    return User.objects.filter(
        is_active=True, is_staff=True, account__approval_notifications=frequency
    ).exclude(email="")
