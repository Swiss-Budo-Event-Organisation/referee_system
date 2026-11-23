from django.contrib.auth.models import Group
from django.contrib.auth.models import Permission
from django.db.models.signals import post_save
from django.db.models.signals import pre_save
from django.dispatch import receiver

from .groups import create_category_groups
from .groups import rename_category_groups
from .models import CompetitionCategory


@receiver(pre_save, sender=CompetitionCategory)
def remember_category_name(sender, instance, raw=False, using=None, **kwargs):
    """Keep the stored name so that post_save can detect a rename."""
    instance._previous_name = None
    if raw or instance.pk is None:
        return
    instance._previous_name = (
        sender.objects.using(using or "default")
        .filter(pk=instance.pk)
        .values_list("name", flat=True)
        .first()
    )


@receiver(post_save, sender=CompetitionCategory)
def sync_category_groups(sender, instance, created, raw=False, using=None, **kwargs):
    """
    Give every new category its member, admin and observer group, and rename
    these groups when the category is renamed.
    """
    if raw:
        return
    using = using or "default"
    if created:
        create_category_groups(instance, Group, Permission, using=using)
        return
    previous = getattr(instance, "_previous_name", None)
    if previous is not None and previous != instance.name:
        rename_category_groups(instance, previous, Group, using=using)
