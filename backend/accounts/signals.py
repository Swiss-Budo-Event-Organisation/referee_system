from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Account


@receiver(post_save, sender=User)
def create_account(sender, instance, created, **kwargs):
    """
    Users created active (by staff, in the admin or on the command line)
    count as approved and onboarded; registrations start inactive.
    """
    if created:
        Account.objects.get_or_create(
            user=instance,
            defaults={
                "approved": timezone.now() if instance.is_active else None,
                "onboarded": instance.is_active,
            },
        )
