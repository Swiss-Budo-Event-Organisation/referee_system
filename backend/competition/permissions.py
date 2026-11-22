"""
Category-scoped permissions for competitions.

Members of a category's admin group manage the competitions in that category;
members of its observer group may view those competitions and their
applications. Admins can also see everything they manage. Superusers can do
everything.
"""

from collections.abc import Iterable

from django.db.models import Q
from django.db.models import QuerySet

from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory


def administered_categories(user) -> QuerySet[CompetitionCategory]:
    if not user.is_authenticated or not user.is_active:
        return CompetitionCategory.objects.none()
    if user.is_superuser:
        return CompetitionCategory.objects.all()
    return CompetitionCategory.objects.filter(admins__in=user.groups.all())


def observed_categories(user) -> QuerySet[CompetitionCategory]:
    if not user.is_authenticated or not user.is_active:
        return CompetitionCategory.objects.none()
    if user.is_superuser:
        return CompetitionCategory.objects.all()
    groups = user.groups.all()
    return CompetitionCategory.objects.filter(
        Q(admins__in=groups) | Q(observers__in=groups)
    ).distinct()


def managed_competitions(user) -> QuerySet[Competition]:
    if user.is_authenticated and user.is_superuser:
        return Competition.objects.all()
    return Competition.objects.filter(
        category__in=administered_categories(user)
    ).distinct()


def observed_competitions(user) -> QuerySet[Competition]:
    if user.is_authenticated and user.is_superuser:
        return Competition.objects.all()
    return Competition.objects.filter(category__in=observed_categories(user)).distinct()


def can_manage_competition(user, competition: Competition) -> bool:
    return managed_competitions(user).filter(pk=competition.pk).exists()


def can_observe_competition(user, competition: Competition) -> bool:
    return observed_competitions(user).filter(pk=competition.pk).exists()


def can_assign_categories(
    user,
    categories: Iterable[CompetitionCategory],
    current: Iterable[CompetitionCategory] = (),
) -> bool:
    """
    Check that every category added to or removed from a competition is one
    the user administers. Categories that stay untouched are always fine.
    """
    new = {category.pk for category in categories}
    if not new:
        return False
    changed = new ^ {category.pk for category in current}
    allowed = set(administered_categories(user).values_list("pk", flat=True))
    return changed <= allowed


def managed_applications(user) -> QuerySet[Application]:
    return Application.objects.filter(competition__in=managed_competitions(user))


def observed_applications(user) -> QuerySet[Application]:
    return Application.objects.filter(competition__in=observed_competitions(user))
