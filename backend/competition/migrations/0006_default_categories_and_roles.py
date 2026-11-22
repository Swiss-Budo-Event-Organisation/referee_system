from django.contrib.auth.management import create_permissions
from django.db import migrations

# Competition categories and the groups administering / observing them.
# The names match the groups created in referee.0007_default_groups.
CATEGORIES = {
    "International": {"admins": "International Admin", "observers": None},
    "National": {"admins": "National Admin", "observers": None},
    "Region 1": {"admins": "Region 1 Admin", "observers": "Region 1 Observer"},
    "Region 2": {"admins": "Region 2 Admin", "observers": "Region 2 Observer"},
    "Region 3": {"admins": "Region 3 Admin", "observers": "Region 3 Observer"},
    "Adapted Judo": {"admins": "Adapted Judo Admin", "observers": None},
}

# Examiner groups and the licenses they may record examinations for.
EXAMINERS = {
    "Examiner International": ["IJF Intercontinental", "IJF Continental"],
    "Examiner National": ["National A", "National B"],
    "Examiner Regional": ["Regional"],
}
EXAMINER_PERMISSIONS = ["add_examination", "view_examination"]

LICENSE_ADMIN_GROUP = "National Admin"
LICENSE_ADMIN_PERMISSIONS = ["add_refereelicense", "change_refereelicense"]

# Category admins must not edit categories, as that would let them change
# which group administers a category.
CATEGORY_PERMISSIONS = [
    "add_competitioncategory",
    "change_competitioncategory",
    "delete_competitioncategory",
]


def _perms(Permission, db_alias, codenames):
    return list(Permission.objects.using(db_alias).filter(codename__in=codenames))


def forwards(apps, schema_editor):
    db_alias = schema_editor.connection.alias

    for app_config in apps.get_app_configs():
        app_config.models_module = True
        create_permissions(app_config, apps=apps, verbosity=0, using=db_alias)
        app_config.models_module = None

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")
    RefereeLicense = apps.get_model("referee", "RefereeLicense")
    groups = Group.objects.using(db_alias)

    category_perms = _perms(Permission, db_alias, CATEGORY_PERMISSIONS)
    for name, roles in CATEGORIES.items():
        category, _ = CompetitionCategory.objects.using(db_alias).get_or_create(
            name=name
        )
        for field, group_name in roles.items():
            if group_name is None or getattr(category, f"{field}_id") is not None:
                continue
            group, _ = groups.get_or_create(name=group_name)
            setattr(category, field, group)
        category.save()
        if category.admins is not None:
            category.admins.permissions.remove(*category_perms)

    examiner_perms = _perms(Permission, db_alias, EXAMINER_PERMISSIONS)
    for group_name, license_names in EXAMINERS.items():
        group, _ = groups.get_or_create(name=group_name)
        group.permissions.add(*examiner_perms)
        RefereeLicense.objects.using(db_alias).filter(
            name__in=license_names, examiners__isnull=True
        ).update(examiners=group)

    license_admin, _ = groups.get_or_create(name=LICENSE_ADMIN_GROUP)
    license_admin.permissions.add(
        *_perms(Permission, db_alias, LICENSE_ADMIN_PERMISSIONS)
    )


def backwards(apps, schema_editor):
    db_alias = schema_editor.connection.alias
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")

    license_admin = Group.objects.using(db_alias).filter(name=LICENSE_ADMIN_GROUP)
    for group in license_admin:
        group.permissions.remove(
            *_perms(Permission, db_alias, LICENSE_ADMIN_PERMISSIONS)
        )
    Group.objects.using(db_alias).filter(name__in=EXAMINERS.keys()).delete()
    CompetitionCategory.objects.using(db_alias).filter(
        name__in=CATEGORIES.keys(), competition__isnull=True
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("competition", "0005_competitioncategory_groups"),
        ("referee", "0007_default_groups"),
        ("referee", "0008_refereelicense_examiners"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
