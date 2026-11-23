"""
Permissions on events and competitions, based on the groups of the
categories assigned to an event.

Use it through Django's permission API, for example
``user.has_perm("competition.change_event", event)``:

- Staff members have every permission on events and competitions.
- Members of the admin group of any category of an event may change and
  delete the event, and add, change and delete its competitions.
- Members of the observer or admin group of any category of an event may
  view the event and its competitions.

Apart from staff, users also need the model permission itself, which the
admin and observer groups grant (see competition.groups).
"""

from django.contrib.auth.backends import BaseBackend
from django.db.models import Q

from .models import Competition
from .models import CompetitionCategory
from .models import Event

ACTIONS = ("add", "change", "delete", "view")
MODELS = ("event", "competition")
PERMISSIONS = frozenset(
    f"competition.{action}_{model}" for action in ACTIONS for model in MODELS
)


def event_categories(event: Event):
    """Categories assigned to any competition of the event."""
    return CompetitionCategory.objects.filter(competition__event=event).distinct()


def _event_of(obj):
    if isinstance(obj, Event):
        return obj
    if isinstance(obj, Competition):
        return obj.event
    return None


class CategoryPermissionBackend(BaseBackend):
    def get_all_permissions(self, user_obj, obj=None):
        if obj is not None or not user_obj.is_active or user_obj.is_anonymous:
            return set()
        if user_obj.is_staff:
            return set(PERMISSIONS)
        return set()

    def has_perm(self, user_obj, perm, obj=None):
        if perm not in PERMISSIONS or not user_obj.is_active:
            return False
        if obj is None:
            return perm in self.get_all_permissions(user_obj)
        event = _event_of(obj)
        if event is None or user_obj.is_anonymous:
            return False
        if user_obj.is_staff:
            return True
        # The model permission granted by the user's groups (ModelBackend).
        if not user_obj.has_perm(perm):
            return False
        groups = user_obj.groups.all()
        allowed = Q(admins__in=groups)
        if perm.split(".")[1].startswith("view_"):
            allowed |= Q(observers__in=groups)
        return event_categories(event).filter(allowed).exists()
