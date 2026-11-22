"""
License-scoped permissions for examinations.

Members of a license's examiner group may record examinations for that
license. Superusers may record any examination.
"""

from django.db.models import QuerySet

from referee.models import Examination
from referee.models import RefereeLicense


def examinable_licenses(user) -> QuerySet[RefereeLicense]:
    if not user.is_authenticated or not user.is_active:
        return RefereeLicense.objects.none()
    if user.is_superuser:
        return RefereeLicense.objects.all()
    return RefereeLicense.objects.filter(examiners__in=user.groups.all())


def can_examine(user, license: RefereeLicense) -> bool:
    return examinable_licenses(user).filter(pk=license.pk).exists()


def examinations_of_examiner(user) -> QuerySet[Examination]:
    return Examination.objects.filter(license__in=examinable_licenses(user))


def sees_all_examinations(user) -> bool:
    """
    True if the user may view every examination, i.e. holds the view
    permission directly or through a group that is not an examiner group.
    Examiner groups only grant access to their own licenses.
    """
    if not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    codename = "view_examination"
    if user.user_permissions.filter(codename=codename).exists():
        return True
    return user.groups.filter(
        examined_licenses__isnull=True, permissions__codename=codename
    ).exists()
