from django.contrib.auth.management import create_permissions
from django.db import migrations

BASE_GROUPS = [
    "International",
    "National",
    "Region 1",
    "Region 2",
    "Region 3",
    "Adapted Judo",
]
REGIONS = ["Region 1", "Region 2", "Region 3"]

ADMIN_SUFFIX = "Admin"
OBSERVER_SUFFIX = "Observer"

# Models the admin roles manage (full CRUD) and observers may view.
MANAGED_MODELS = {
    "competition": [
        "event",
        "competition",
        "competitioncategory",
        "accommodation",
        "application",
        "invitation",
    ],
}
# Models admin roles and observers may view only.
VIEW_ONLY_MODELS = {
    "referee": ["referee", "refereelicense", "examination", "refereerole"],
}


def group_names():
    names = list(BASE_GROUPS)
    names += [f"{name} {ADMIN_SUFFIX}" for name in BASE_GROUPS]
    names += [f"{name} {OBSERVER_SUFFIX}" for name in REGIONS]
    return names


def _permissions(Permission, db_alias, models, actions):
    codenames = [
        f"{action}_{model}"
        for model_list in models.values()
        for model in model_list
        for action in actions
    ]
    return Permission.objects.using(db_alias).filter(
        content_type__app_label__in=models.keys(), codename__in=codenames
    )


def create_default_groups(apps, schema_editor):
    db_alias = schema_editor.connection.alias

    # Permissions are normally created after all migrations ran (post_migrate);
    # make sure they exist now so they can be assigned on a fresh database.
    for app_config in apps.get_app_configs():
        app_config.models_module = True
        create_permissions(app_config, apps=apps, verbosity=0, using=db_alias)
        app_config.models_module = None

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    view_perms = list(
        _permissions(Permission, db_alias, MANAGED_MODELS, ["view"])
    ) + list(_permissions(Permission, db_alias, VIEW_ONLY_MODELS, ["view"]))
    admin_perms = list(
        _permissions(
            Permission, db_alias, MANAGED_MODELS, ["add", "change", "delete", "view"]
        )
    ) + list(_permissions(Permission, db_alias, VIEW_ONLY_MODELS, ["view"]))

    for name in BASE_GROUPS:
        Group.objects.using(db_alias).get_or_create(name=name)

        admin, _ = Group.objects.using(db_alias).get_or_create(
            name=f"{name} {ADMIN_SUFFIX}"
        )
        admin.permissions.add(*admin_perms)

    for name in REGIONS:
        observer, _ = Group.objects.using(db_alias).get_or_create(
            name=f"{name} {OBSERVER_SUFFIX}"
        )
        observer.permissions.add(*view_perms)


def remove_default_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    db_alias = schema_editor.connection.alias
    Group.objects.using(db_alias).filter(name__in=group_names()).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("competition", "0004_alter_application_options_alter_application_role"),
        ("referee", "0006_default_referee_licenses"),
    ]

    operations = [
        migrations.RunPython(create_default_groups, remove_default_groups),
    ]
