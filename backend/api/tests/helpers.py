from datetime import timedelta

from django.contrib.auth.models import Permission
from django.contrib.auth.models import User
from django.utils import timezone

from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from helper.models import Address
from helper.models import Location
from referee.models import RefereeLicense


def make_user(username="john", password="s3cret-Pa55word", **kwargs):
    return User.objects.create_user(username=username, password=password, **kwargs)


def grant(user, *codenames):
    user.user_permissions.add(*Permission.objects.filter(codename__in=codenames))
    # Drop the cached permissions so the new ones are seen.
    return User.objects.get(pk=user.pk)


def make_location(name="Dojo"):
    address = Address.objects.create(street="Main Street", city="Bern")
    return Location.objects.create(name=name, address=address)


def make_event(name="Test Event", start=None, location=None, **kwargs):
    if start is None:
        start = timezone.now() + timedelta(days=30)
    if location is None:
        location = make_location()
    return Event.create(name=name, start=start, location=location, **kwargs)


def make_competition(event, invitor, category_names=("National",), **kwargs):
    competition = Competition.objects.create(
        event=event,
        invitor=invitor,
        minimum_level=RefereeLicense.objects.get(name="Regional"),
        desired_level=RefereeLicense.objects.get(name="National B"),
        start=event.start,
        duration=timedelta(hours=8),
        application_open=timezone.now() - timedelta(days=1),
        application_close=timezone.now() + timedelta(days=10),
        **kwargs,
    )
    competition.category.set(
        CompetitionCategory.objects.filter(name__in=category_names)
    )
    return competition
