from django.contrib.auth.management import create_permissions
from django.db import migrations

ADMIN_CODENAMES = ["add_address", "change_address", "delete_address", "view_address"]
OBSERVER_CODENAMES = ["view_address"]


def _address_permissions(apps, schema_editor, codenames):
    db_alias = schema_editor.connection.alias
    # Permissions are normally created after all migrations ran.
    app_config = apps.get_app_config("helper")
    app_config.models_module = True
    create_permissions(app_config, apps=apps, verbosity=0, using=db_alias)
    app_config.models_module = None
    Permission = apps.get_model("auth", "Permission")
    return list(
        Permission.objects.using(db_alias).filter(
            content_type__app_label="helper", codename__in=codenames
        )
    )


def forwards(apps, schema_editor):
    """The admins of every category may manage addresses; observers view them."""
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")
    admin = _address_permissions(apps, schema_editor, ADMIN_CODENAMES)
    observer = [p for p in admin if p.codename in OBSERVER_CODENAMES]
    categories = CompetitionCategory.objects.using(schema_editor.connection.alias)
    for category in categories.select_related("admins", "observers"):
        if category.admins is not None:
            category.admins.permissions.add(*admin)
        if category.observers is not None:
            category.observers.permissions.add(*observer)


def backwards(apps, schema_editor):
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")
    admin = _address_permissions(apps, schema_editor, ADMIN_CODENAMES)
    categories = CompetitionCategory.objects.using(schema_editor.connection.alias)
    for category in categories.select_related("admins", "observers"):
        if category.admins is not None:
            category.admins.permissions.remove(*admin)
        if category.observers is not None:
            category.observers.permissions.remove(*admin)


class Migration(migrations.Migration):
    dependencies = [
        ("competition", "0011_invitation_further_recipients"),
        ("helper", "0003_alter_address_area_code_alter_address_country_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
