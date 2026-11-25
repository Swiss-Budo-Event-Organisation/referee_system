from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Referee
from .models import delete_unused_address


@receiver(post_delete, sender=Referee)
def delete_personal_address(sender, instance, **kwargs):
    if instance.address_id is not None:
        delete_unused_address(instance.address_id)
