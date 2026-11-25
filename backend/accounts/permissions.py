"""
Who may handle registrations awaiting approval.

The approve permission (accounts.approve_account) lets a user see the
registrations, approve them with groups and examinations, delete them and
subscribe to the e-mail about them. The view permission
(accounts.view_account) only lets them see the registrations. Neither lets
them edit other users' profiles.
"""

from django.contrib.auth.models import Permission
from django.contrib.auth.models import User
from django.db.models import Q

APPROVE = "accounts.approve_account"
VIEW = "accounts.view_account"


def can_approve(user) -> bool:
    return bool(user and user.is_authenticated and user.has_perm(APPROVE))


def can_view_pending(user) -> bool:
    """Approving includes seeing the registrations."""
    return can_approve(user) or bool(
        user and user.is_authenticated and user.has_perm(VIEW)
    )


def approvers():
    """Active users with the approve permission, directly or by a group."""
    permission = Permission.objects.filter(
        content_type__app_label="accounts", codename="approve_account"
    ).first()
    return (
        User.objects.filter(is_active=True)
        .filter(
            Q(is_superuser=True)
            | Q(user_permissions=permission)
            | Q(groups__permissions=permission)
        )
        .distinct()
    )
