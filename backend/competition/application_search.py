"""
The historic search of a referee's own applications. Every criterion is
optional, and an application has to meet all that are given.
"""

from django.db.models import Q
from django.db.models import QuerySet
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from competition.models import Application

LOCATION_FIELDS = [
    "competition__event__location__name",
    "competition__event__location__description",
    "competition__event__location__address__street",
    "competition__event__location__address__house_number",
    "competition__event__location__address__area_code",
    "competition__event__location__address__city",
    "competition__event__location__address__country",
]

TEXT_FIELDS = [
    "competition__event__name",
    "competition__event__info",
    "competition__event__slug",
    "competition__info",
    "competition__category__name",
    "accommodation__name",
    "accommodation_remark",
    "role__name",
    *LOCATION_FIELDS,
]


def _every_word_somewhere(term: str, fields: list[str]) -> Q:
    """Each word of the term appears in one of the fields, ignoring case."""
    condition = Q()
    for word in term.split():
        anywhere = Q()
        for field in fields:
            anywhere |= Q(**{f"{field}__icontains": word})
        condition &= anywhere
    return condition


def _date(params, name):
    value = params.get(name, "").strip()
    if not value:
        return None
    date = parse_date(value)
    if date is None:
        raise ValidationError({name: ["Enter a date as YYYY-MM-DD."]})
    return date


def _statuses(params) -> list[int]:
    statuses = []
    for value in params.getlist("status"):
        try:
            status = int(value)
        except ValueError:
            status = None
        if status not in Application.Status.values:
            raise ValidationError({"status": [f"Unknown status {value!r}."]})
        statuses.append(status)
    return statuses


def search_applications(applications: QuerySet, params) -> QuerySet:
    """
    The applications matching the query parameters:

    - `start_after`, `start_before`: the competition starts on or after,
      and on or before, the date (YYYY-MM-DD).
    - `location`: every word appears in the location's name, description
      or address.
    - `status`: one of the statuses, the parameter may be repeated.
    - `search`: every word appears in the application, its competition,
      event or location.
    """
    start_after = _date(params, "start_after")
    start_before = _date(params, "start_before")
    if start_after and start_before and start_after > start_before:
        raise ValidationError({"start_before": ["The end lies before the start."]})
    if start_after:
        applications = applications.filter(competition__start__date__gte=start_after)
    if start_before:
        applications = applications.filter(competition__start__date__lte=start_before)
    statuses = _statuses(params)
    if statuses:
        applications = applications.filter(status__in=statuses)
    location = params.get("location", "").strip()
    if location:
        applications = applications.filter(
            _every_word_somewhere(location, LOCATION_FIELDS)
        )
    search = params.get("search", "").strip()
    if search:
        # Searching the categories may find an application more than once.
        applications = applications.filter(
            pk__in=Application.objects.filter(
                _every_word_somewhere(search, TEXT_FIELDS)
            ).values("pk")
        )
    return applications
